import { Keypair, PublicKey, Transaction, type Blockhash } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getServiceClient } from "@/lib/supabase/service";
import { getSolanaConnection } from "@/lib/solana/connection";
import { getFeePayerKeypair } from "@/lib/solana/fee-payer";
import { FUNDING_COMMITMENT, USDC_MINT } from "@/lib/solana/constants";
import { decryptSecretKey } from "@/lib/crypto/deposit-keys";
import { getDepositAccountForSigning } from "@/lib/services/merchant";
import {
  getWithdrawal,
  listOpenWithdrawals,
  type WithdrawalRow,
} from "@/lib/services/withdrawals";

/**
 * Self-service withdrawal executor (SERVER-ONLY). Pulls a merchant's USDC to an
 * external Solana address in real time, in exchange only for the SOL network fee
 * (paid by the Equixity fee-payer wallet, never the merchant's holding).
 *
 * Order of operations (confirmed design):
 *   1. Destination is validated as base58 BEFORE any RPC/fee/reserve — an
 *      invalid address never spends a lamport.
 *   2. reserve_withdrawal() debits the balance + creates the 'pending' row
 *      atomically, so two concurrent requests can't both clear the same funds.
 *   3. The merchant's OWN deposit keypair signs the outbound transfer — never
 *      any other authority.
 *   4. The fee payer covers the fee, and (only when the destination has never
 *      held USDC) the one-time ATA rent via an idempotent instruction.
 *   5. On any post-broadcast failure we NEVER auto-refund without checking the
 *      chain: confirmed stays confirmed; a definitively not-landed/errored
 *      transfer is failed AND refunded exactly once; an indeterminate outcome
 *      is left 'submitted' for reconciliation on the next Funding page view.
 */

export class InsufficientFundsError extends Error {
  constructor() {
    super("Withdraw amount exceeds the available balance.");
    this.name = "InsufficientFundsError";
  }
}

export class InvalidDestinationError extends Error {
  constructor(address: string) {
    super(
      `Invalid destination address (not a valid Solana base58 key): ${address}`,
    );
    this.name = "InvalidDestinationError";
  }
}

export class FeePayerNotConfiguredError extends Error {
  constructor() {
    super("FEE_PAYER_SECRET_KEY is not set; withdrawals are disabled.");
    this.name = "FeePayerNotConfiguredError";
  }
}

export class WithdrawSigningError extends Error {}

export type WithdrawalResult = {
  withdrawal: WithdrawalRow;
  balance: string;
};

/** confirmed | notlanded | indeterminate — never auto-refund the middle. */
export async function executeWithdrawal(
  merchantId: string,
  amountUnits: bigint,
  destinationAddress: string,
): Promise<WithdrawalResult> {
  if (amountUnits <= 0n) throw new Error("Withdraw amount must be positive.");

  // 0. Destination well-formedness, before anything costs anything.
  let destinationPubkey: PublicKey;
  try {
    destinationPubkey = new PublicKey(destinationAddress);
  } catch {
    throw new InvalidDestinationError(destinationAddress);
  }

  if (getFeePayerKeypair().publicKey.toBase58().length === 0) {
    throw new FeePayerNotConfiguredError();
  }
  const feePayer = getFeePayerKeypair();
  const conn = getSolanaConnection();
  const service = getServiceClient();

  // 1. Atomic reserve: debit + create 'pending' row in ONE function call.
  const { data: reservedRaw, error: reserveErr } = await service.rpc(
    "reserve_withdrawal",
    {
      p_merchant_id: merchantId,
      p_amount_usdc_units: amountUnits.toString(),
      p_destination_address: destinationAddress,
    },
  );
  if (reserveErr) {
    throw new Error(`Withdrawal reserve failed: ${reserveErr.message}`);
  }
  const reserved = (reservedRaw as Array<{ id: string } | undefined> | null)?.[0];
  if (!reserved) {
    // Zero rows returned => the balance couldn't absorb it; nothing was debited.
    throw new InsufficientFundsError();
  }
  const withdrawalId = reserved.id;

  // 2. Recover the merchant's signing keypair in memory.
  let depositKeypair: Keypair;
  try {
    const deposit = await getDepositAccountForSigning(merchantId);
    depositKeypair = Keypair.fromSecretKey(
      decryptSecretKey(deposit.encrypted_private_key),
    );
  } catch (e) {
    await failWithdrawal(withdrawalId, "failed_to_decrypt_deposit_key");
    throw new WithdrawSigningError(
      `Could not reconstruct the signing key: ${(e as Error).message}`,
    );
  }
  const depositPubkey = depositKeypair.publicKey;

  // 3. Token accounts. Source ATA exists whenever the merchant has any balance
  //    (they received USDC to it); destination ATA may need creating.
  const mint = new PublicKey(USDC_MINT);
  const sourceAta = getAssociatedTokenAddressSync(mint, depositPubkey);
  const destAta = getAssociatedTokenAddressSync(mint, destinationPubkey);

  // 4. Instructions + sign. The fee payer funds rent/fee; only the merchant's
  //    key signs USDC authority, so the fee payer holds NO authority over the
  //    transfer.
  const transferIx = createTransferInstruction(
    sourceAta,
    destAta,
    depositPubkey,
    amountUnits,
    [],
    TOKEN_PROGRAM_ID,
  );
  const createDestIx = createAssociatedTokenAccountIdempotentInstruction(
    feePayer.publicKey,
    destAta,
    destinationPubkey,
    mint,
    TOKEN_PROGRAM_ID,
  );

  const recent = await conn.getLatestBlockhash();
  const tx = new Transaction();
  tx.feePayer = feePayer.publicKey;
  tx.recentBlockhash = recent.blockhash;
  tx.lastValidBlockHeight = recent.lastValidBlockHeight;
  tx.add(createDestIx, transferIx);
  tx.sign(depositKeypair, feePayer);
  const raw = tx.serialize();

  // 5. Broadcast.
  let signature: string;
  try {
    signature = await conn.sendRawTransaction(raw, {
      skipPreflight: true,
      maxRetries: 2,
    });
  } catch (e) {
    // sendRawTransaction throwing means it was never broadcast — safe to refund.
    await failWithdrawal(withdrawalId, `broadcast_failed: ${(e as Error).message}`);
    return {
      withdrawal: await getWithdrawal(withdrawalId),
      balance: await getBalanceString(merchantId),
    };
  }
// 6. Await confirmation.
  await setStatus(withdrawalId, "submitted", signature);
  try {
    const result = await conn.confirmTransaction(
      {
        signature,
        blockhash: recent.blockhash,
        lastValidBlockHeight: recent.lastValidBlockHeight,
      },
      FUNDING_COMMITMENT,
    );
    if (result.value.err) throw new Error("transfer executed with a failure");
    await setStatus(withdrawalId, "confirmed", signature);
  } catch {
    // 7. Outcome may be ambiguous — check the chain before deciding anything.
    const verdict = await resolveOutcome(signature, recent.blockhash);
    if (verdict === "confirmed") {
      await setStatus(withdrawalId, "confirmed", signature);
    } else if (verdict === "notlanded") {
      await failWithdrawal(withdrawalId, "not_confirmed_on_chain");
    }
    // 'indeterminate' -> leave in 'submitted'; reconciled on next page view.
  }

  return {
    withdrawal: await getWithdrawal(withdrawalId),
    balance: await getBalanceString(merchantId),
  };
}

/**
 * Reconcile any merchant rows stuck in 'submitted' (e.g. from an interrupted
 * call or an indeterminate earlier outcome). Only clears rows we can decide:
 * confirmed stays confirmed; a transfer the chain definitively never executed
 * (not found after searching full history, or executed-with-error) is failed
 * and refunded. Still-processing rows are left alone — never refund a
 * transaction that might land. Returns the number of rows reconciled.
 */
export async function reconcileWithdrawals(merchantId: string): Promise<number> {
  const open = await listOpenWithdrawals(merchantId);
  let reconciled = 0;
  for (const row of open) {
    const sig = row.transaction_signature;
    if (!sig) {
      // Marked submitted but never got a signature — nothing was broadcast.
      await failWithdrawal(row.id, "stale_no_signature");
      reconciled += 1;
      continue;
    }
    const verdict = await resolveOutcome(sig, null);
    if (verdict === "confirmed") {
      await setStatus(row.id, "confirmed", sig);
      reconciled += 1;
    } else if (verdict === "notlanded") {
      await failWithdrawal(row.id, "stale_not_confirmed");
      reconciled += 1;
    }
    // indeterminate: leave 'submitted', try again on a later view.
  }
  return reconciled;
}

async function getBalanceString(merchantId: string): Promise<string> {
  const service = getServiceClient();
  const { data } = await service
    .from("merchant_balances")
    .select("available_usdc_units::text")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  return data?.available_usdc_units ?? "0";
}

async function setStatus(
  id: string,
  status: "submitted" | "confirmed",
  signature?: string,
): Promise<void> {
  const service = getServiceClient();
  await service.rpc("set_withdrawal_status", {
    p_withdrawal_id: id,
    p_status: status,
    p_transaction_signature: signature,
  });
}

async function failWithdrawal(id: string, reason: string): Promise<void> {
  const service = getServiceClient();
  await service.rpc("fail_withdrawal", {
    p_withdrawal_id: id,
    p_reason: reason,
  });
}

export async function resolveOutcome(
  signature: string,
  blockhash: Blockhash | null,
): Promise<Outcome> {
  const conn = getSolanaConnection();
  try {
    const { value } = await conn.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = value?.[0];
    if (status?.err) return "notlanded"; // executed but aborted -> tokens not sent
    const cs = status?.confirmationStatus;
    if (cs === "confirmed" || cs === "finalized") return "confirmed";
    if (blockhash) {
      // Still unconfirmed: if its blockhash is no longer valid it can never land.
      const valid = await conn.isBlockhashValid(blockhash);
      if (!valid.value) return "notlanded";
    }
    return "indeterminate"; // still possible it lands; don't refund
  } catch {
    return "indeterminate";
  }
}
export type Outcome = "confirmed" | "notlanded" | "indeterminate";

/**
 * WHAT THE CHAIN SAID WHEN A SIGNATURE FAILED, or null when the signature
 * succeeded or does not exist on chain at all.
 *
 * `resolveOutcome` deliberately collapses "landed and failed" and "never landed"
 * into one verdict, because both mean the transfer did not happen and the money
 * must be released either way. That is right for the LEDGER and wrong for the
 * RECORD: a failure that landed has an error, a program, and usually a log line
 * naming the real cause, and reporting it as "did not confirm" sends whoever
 * reads the row looking at the wrong thing. Live example: a reward swap that
 * failed because the rent payer held no SOL was recorded for hours as an
 * unconfirmed swap.
 *
 * Returns a short human-readable string, never throws.
 */
export async function describeFailureSignature(
  signature: string,
): Promise<string | null> {
  const conn = getSolanaConnection();
  try {
    const { value } = await conn.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = value?.[0];
    if (!status?.err) return null;

    const errText = JSON.stringify(status.err);
    const tx = await conn.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    const logs = tx?.meta?.logMessages ?? [];
    // Prefer the line that names the CAUSE ("Transfer: insufficient lamports 0,
    // need 1559560") over the program's own generic "failed" line, which is the
    // difference between a reason someone can act on and one they cannot.
    const clue =
      logs.find((line) => /insufficient lamports/i.test(line)) ??
      logs
        .filter((line) =>
          /insufficient|Transfer:|custom program error|failed/i.test(line),
        )
        .slice(-1)[0];
    return clue ? `${errText}, ${clue.replace(/^Program log: /, "")}` : errText;
  } catch {
    return null;
  }
}