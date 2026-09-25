import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { getServiceClient } from "@/lib/supabase/service";
import { getSolanaConnection } from "@/lib/solana/connection";
import { getFeePayerKeypair } from "@/lib/solana/fee-payer";
import { decryptSecretKey } from "@/lib/crypto/deposit-keys";
import { getDepositAccountForSigning } from "@/lib/services/merchant";
import {
  buildSwapInstructions,
  quoteUsdcToAsset,
  toTransactionInstruction,
  withFeePayerPayingAtaRent,
} from "@/lib/solana/jupiter";
import { describeFailureSignature, resolveOutcome } from "@/lib/solana/withdraw";
import { getClaimForExecution } from "@/lib/services/claims";

/**
 * Swap-at-claim reward execution (spec section 6).
 *
 * This deliberately REUSES the withdrawal infrastructure rather than inventing a
 * parallel mechanism, because it is the same shape of problem: a server-initiated
 * signed transfer of real money that must not double-spend or silently lose
 * funds. Specifically it reuses decryptSecretKey, the fee-payer wallet, the
 * atomic reserve/release plpgsql functions, and the resolveOutcome
 * chain-verification pattern.
 *
 * THE TWO-STEP DELIVERY (spec section 6 step 4): Jupiter's `destinationTokenAccount`
 * is only valid for an ALREADY-INITIALIZED token account, and a first-time
 * customer wallet will not have one. So delivery is:
 *   leg 1 - swap the reward's USDC into the merchant's own deposit wallet (ATA
 *           created by Jupiter's own setup instructions);
 *   leg 2 - `transferChecked` the resulting asset from the merchant's ATA to the
 *           customer's ATA, creating the customer's ATA idempotently with the
 *           fee payer covering the one-time rent.
 * This always works regardless of Jupiter's destination support, at the cost of
 * one extra instruction.
 *
 * TOKEN-2022 IS REQUIRED FOR LEG 2. Reward assets are Token-2022 mints, so the
 * transfer and the customer's ATA must both be built with TOKEN_2022_PROGRAM_ID.
 * The USDC leg stays on the legacy TOKEN_PROGRAM_ID, because USDC is a legacy
 * mint. Getting this backwards would produce an invalid instruction.
 *
 * MONEY RULES ENFORCED HERE:
 *   * the balance is debited by reserve_reward_for_claim BEFORE any swap, so two
 *     concurrent claims cannot both clear the same funds;
 *   * a swap that definitively never landed releases the reserve (fail + credit);
 *   * a swap that DID land followed by a failed delivery does NOT refund USDC —
 *     the merchant holds the swapped asset instead, so the debit is correct and
 *     refunding would hand them the value twice. That case fails with no refund
 *     and records why;
 *   * an indeterminate outcome is left in 'claiming' for reconciliation. Nothing
 *     is ever refunded while the chain might still have executed it.
 */

export class ClaimNotExecutableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimNotExecutableError";
  }
}

export type RewardClaimOutcome = {
  status: "delivered" | "failed" | "claiming" | "ineligible";
  signature: string | null;
  reason: string | null;
};

/**
 * Net amount of `mint` that landed in `owner`'s associated token account during
 * one transaction, as raw base units (the string `amount` field, never the float
 * `uiAmount`). Used to measure exactly how much the swap leg actually delivered,
 * rather than trusting the quote.
 */
async function assetReceivedByOwner(
  signature: string,
  mint: string,
  owner: PublicKey,
): Promise<bigint | null> {
  const { getParsedTransaction } = await import("@/lib/solana/get-transaction");
  const conn = getSolanaConnection();
  const parsed = await getParsedTransaction(conn, signature);
  if (!parsed?.meta) return null;

  const ata = getAssociatedTokenAddressSync(
    new PublicKey(mint),
    owner,
    true,
    TOKEN_2022_PROGRAM_ID,
  ).toBase58();

  const post = parsed.meta.postTokenBalances ?? [];
  const pre = parsed.meta.preTokenBalances ?? [];
  const accountKeys = parsed.transaction.message.accountKeys;

  const postEntry = post.find((b) => {
    if (b.mint !== mint) return false;
    const key = accountKeys?.[b.accountIndex];
    return key ? key.pubkey.toString() === ata : false;
  });
  if (!postEntry) return null;

  const preEntry = pre.find(
    (b) => b.accountIndex === postEntry.accountIndex && b.mint === mint,
  );
  const postUnits = BigInt(postEntry.uiTokenAmount.amount);
  const preUnits = preEntry ? BigInt(preEntry.uiTokenAmount.amount) : 0n;
  const delta = postUnits - preUnits;
  return delta > 0n ? delta : null;
}

async function recordSwapSignature(
  claimId: string,
  signature: string,
): Promise<void> {
  const service = getServiceClient();
  await service
    .from("reward_claims")
    .update({ swap_transaction_signature: signature, updated_at: new Date().toISOString() })
    .eq("id", claimId);
}

/**
 * HOW LONG TO WATCH THE CHAIN, AND WHY IT IS BOUNDED.
 *
 * The first version used `conn.confirmTransaction({signature, blockhash,
 * lastValidBlockHeight})` and waited for it to return. Observed live, that call
 * took 41 seconds to report a transaction that had landed in the SAME SECOND it
 * was sent. A 41 second wait is survivable on its own; it is not survivable when
 * the whole request has a 60 second ceiling on Vercel, because the delivery leg
 * then ran with 19 seconds left and the function was killed mid-confirmation.
 * The customer saw "something went wrong", the row stayed 'claiming', and the
 * asset had in fact been delivered.
 *
 * So the waiting is explicit and bounded here: poll the signature status
 * directly, and if the outcome is still unknown when the budget runs out, return
 * 'indeterminate' and let reconciliation settle it later. NEVER guess, and never
 * refund something the chain might still execute.
 *
 * Budgets are deliberately a fraction of the 60 second route ceiling, so that a
 * slow swap leg still leaves room for the delivery leg to complete.
 */
const CONFIRM_POLL_MS = 800;
const SWAP_CONFIRM_BUDGET_MS = 18_000;
const DELIVERY_CONFIRM_BUDGET_MS = 14_000;

async function waitForOutcome(
  signature: string,
  budgetMs: number,
  blockhash?: string | null,
): Promise<"confirmed" | "notlanded" | "indeterminate"> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const verdict = await resolveOutcome(signature, blockhash ?? null);
    if (verdict !== "indeterminate") return verdict;
    if (Date.now() >= deadline) return "indeterminate";
    await new Promise((r) => setTimeout(r, CONFIRM_POLL_MS));
  }
}

/**
 * What the CUSTOMER's token account holds right now, 0n when it does not exist.
 *
 * This is the idempotency signal for the delivery leg. A retry must never send
 * the asset twice, and the only trustworthy answer to "has this already been
 * delivered" is the chain itself, never a boolean in our own row.
 */
async function customerHolding(
  mint: PublicKey,
  owner: PublicKey,
): Promise<bigint> {
  try {
    const ata = getAssociatedTokenAddressSync(
      mint,
      owner,
      true,
      TOKEN_2022_PROGRAM_ID,
    );
    const acc = await getAccount(
      getSolanaConnection(),
      ata,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    return acc.amount;
  } catch {
    return 0n;
  }
}

async function failClaim(
  claimId: string,
  merchantId: string,
  refundUsdcUnits: bigint,
  reason: string,
): Promise<void> {
  const service = getServiceClient();
  await service.rpc("fail_reward_claim", {
    p_claim_id: claimId,
    p_merchant_id: merchantId,
    // 0 means "do not refund": used ONLY for the case where the swap landed but
    // delivery failed, because the merchant holds the swapped asset instead.
    p_amount_usdc_units: refundUsdcUnits.toString(),
    p_failure_reason: reason,
  });
}

async function completeClaim(claimId: string, signature: string): Promise<void> {
  const service = getServiceClient();
  await service.rpc("complete_reward_claim", {
    p_claim_id: claimId,
    p_swap_transaction_signature: signature,
  });
}

/** Loads the address lookup tables Jupiter asked for, ignoring any that are gone. */
async function loadLookupTables(
  addresses: string[],
): Promise<AddressLookupTableAccount[]> {
  if (addresses.length === 0) return [];
  const conn = getSolanaConnection();
  const results = await Promise.all(
    addresses.map(async (addr) => {
      try {
        const res = await conn.getAddressLookupTable(new PublicKey(addr));
        return res.value;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((t): t is AddressLookupTableAccount => t !== null);
}

/**
 * Execute a reward claim end to end (spec section 6).
 *
 * Assumes section 6a has ALREADY passed — the caller is responsible for that
 * ordering, and this function never re-checks eligibility, because doing so here
 * would make it possible to forget the check elsewhere. The gate lives in
 * lib/compliance/eligibility.ts and the claim route runs it first.
 */
export type ClaimMethod = "same_wallet" | "pasted_address" | "privy_embedded";

export async function executeRewardClaim(params: {
  claimId: string;
  customerWalletAddress: string;
  claimMethod: ClaimMethod;
  detectedCountryCode: string | null;
}): Promise<RewardClaimOutcome> {
  const { claimId, customerWalletAddress, claimMethod, detectedCountryCode } = params;
  const service = getServiceClient();

  const exec = await getClaimForExecution(claimId);
  if (!exec) {
    throw new ClaimNotExecutableError(
      "This reward is not available to claim (unknown id, missing amount, or already handled).",
    );
  }

  const customerPubkey = new PublicKey(customerWalletAddress);

  // --- 1. Atomic reserve: status -> claiming AND debit, in ONE function -----
  const { data: reservedRaw, error: reserveErr } = await service.rpc(
    "reserve_reward_for_claim",
    {
      p_claim_id: claimId,
      p_merchant_id: exec.merchant_id,
      p_amount_usdc_units: exec.reward_usdc_units.toString(),
      p_claim_method: claimMethod,
      p_customer_wallet_address: customerWalletAddress,
      p_detected_country_code: detectedCountryCode,
    },
  );
  if (reserveErr) {
    throw new Error(`Claim reserve failed: ${reserveErr.message}`);
  }
  if (reservedRaw !== true) {
    // Either the claim was not 'unclaimed', or the balance could not absorb it
    // (in which case the DB already recorded a definitive 'failed'). Either way
    // nothing is reserved and no swap may proceed.
    return {
      status: "failed",
      signature: null,
      reason:
        "This reward could not be reserved (already claimed or insufficient balance).",
    };
  }

  // --- 2. Recover the merchant's signing keypair (same path as withdraw) ----
  let depositKeypair: Keypair;
  try {
    const deposit = await getDepositAccountForSigning(exec.merchant_id);
    depositKeypair = Keypair.fromSecretKey(
      decryptSecretKey(deposit.encrypted_private_key),
    );
  } catch (e) {
    await failClaim(
      claimId,
      exec.merchant_id,
      exec.reward_usdc_units,
      `failed_to_decrypt_deposit_key: ${(e as Error).message}`,
    );
    return {
      status: "failed",
      signature: null,
      reason: "Could not reconstruct the merchant signing key; the reward was returned.",
    };
  }

  const feePayer = getFeePayerKeypair();
  const conn = getSolanaConnection();
  const merchantPubkey = depositKeypair.publicKey;
  void customerPubkey;

  // --- 3. Quote, build, sign and submit the swap leg -----------------------
  let swapSignature: string;
  let swapBlockhash: string | null = null;

  try {
    const quote = await quoteUsdcToAsset({
      outputMint: exec.asset_mint,
      usdcAmountUnits: exec.reward_usdc_units,
    });
    const instructions = await buildSwapInstructions({
      userPublicKey: merchantPubkey.toBase58(),
      quote,
    });

    const allInstructions = [
      ...(instructions.computeBudgetInstructions ?? []),
      ...(instructions.setupInstructions ?? []),
      ...(instructions.otherInstructions ?? []),
      instructions.swapInstruction,
      ...(instructions.cleanupInstruction ? [instructions.cleanupInstruction] : []),
    ].map(toTransactionInstruction);

    // THE MERCHANT HOLDING NO SOL MUST NOT BREAK THE SWAP. Jupiter's setup
    // instruction names the merchant's deposit wallet as the rent payer for the
    // asset's token account, and that wallet holds USDC and zero SOL by design.
    // Observed on chain for the live AAPLx swap: the ATA creation aborted with
    // "Transfer: insufficient lamports 0, need 1559560" and the broadcast
    // transaction failed, which surfaced to the customer as "the swap did not
    // confirm" and pointed at nothing. See withFeePayerPayingAtaRent.
    const preparedInstructions = withFeePayerPayingAtaRent(
      allInstructions,
      feePayer.publicKey,
    );

    const lookupTables = await loadLookupTables(
      instructions.addressLookupTableAddresses ?? [],
    );

    const latest = await conn.getLatestBlockhash();
    swapBlockhash = latest.blockhash;

    // The Equixity fee payer is the transaction fee payer, so the merchant's
    // deposit key never pays a network fee (spec section 6 step 5). This is
    // exactly why /swap-instructions is used instead of the assembled /swap
    // response, which would hardcode the deposit wallet as fee payer.
    const message = new TransactionMessage({
      payerKey: feePayer.publicKey,
      recentBlockhash: latest.blockhash,
      instructions: preparedInstructions,
    }).compileToV0Message(lookupTables);

    const tx = new VersionedTransaction(message);
    tx.sign([depositKeypair, feePayer]);

    // SIMULATE BEFORE BROADCASTING. skipPreflight below is deliberate on this
    // path, but it also means a transaction that can never succeed is sent and
    // fails on chain: a fee burned, a slot used, and an on-chain failure to
    // explain from logs later. One simulation turns that into a precise error
    // naming the program that refused, before anything leaves this process, and
    // the caller already refunds the reserve for a build-or-broadcast failure.
    const simulation = await conn.simulateTransaction(tx);
    if (simulation.value.err) {
      const logs = simulation.value.logs ?? [];
      const refusal = logs
        .filter((line) =>
          /insufficient|Transfer:|custom program error|failed/i.test(line),
        )
        .slice(-1)[0];
      throw new Error(
        refusal
          ? `simulation failed: ${refusal}`
          : `simulation failed: ${JSON.stringify(simulation.value.err)}`,
      );
    }

    swapSignature = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
      maxRetries: 2,
    });
  } catch (e) {
    // Nothing was broadcast (quote/build/sign/send all failed before landing),
    // so the reserve is safe to release.
    await failClaim(
      claimId,
      exec.merchant_id,
      exec.reward_usdc_units,
      `swap_build_or_broadcast_failed: ${(e as Error).message}`,
    );
    return {
      status: "failed",
      signature: null,
      reason: `The swap could not be submitted: ${(e as Error).message}`,
    };
  }

  // Record the signature the moment it exists, so a crash from here on is
  // reconcilable instead of a stuck row with no trace of what was broadcast.
  await recordSwapSignature(claimId, swapSignature);

  // --- 4. Confirm the swap leg, inside a bounded budget --------------------
  const swapVerdict = await waitForOutcome(
    swapSignature,
    SWAP_CONFIRM_BUDGET_MS,
    swapBlockhash,
  );
  if (swapVerdict === "notlanded") {
    // The chain tells two realities apart: a signature that exists WITH an
    // error executed and failed, a signature that does not exist never executed
    // at all. Both mean the USDC never left, so the reserve is released either
    // way; only one of them can be explained, so record what the chain said.
    const onChain = await describeFailureSignature(swapSignature);
    await failClaim(
      claimId,
      exec.merchant_id,
      exec.reward_usdc_units,
      `swap_not_confirmed_on_chain: ${onChain ?? "no on-chain trace"}`,
    );
    return {
      status: "failed",
      signature: swapSignature,
      reason: onChain
        ? `The swap failed on chain (${onChain}), so the reward was returned to the merchant.`
        : "The swap did not confirm, so the reward was returned to the merchant.",
    };
  }
  if (swapVerdict === "indeterminate") {
    // Still in flight when the budget ran out. Left to reconciliation, because
    // refunding here could pay twice if the transaction lands after all.
    return {
      status: "claiming",
      signature: swapSignature,
      reason:
        "The swap is still confirming. This settles on its own within a minute, and there is nothing to retry.",
    };
  }

  // --- 5 and 6. Deliver the asset, then settle the row ---------------------
  return deliverRewardAsset({
    claimId,
    merchantId: exec.merchant_id,
    merchantPubkey,
    customerPubkey,
    assetMint: exec.asset_mint,
    assetDecimals: exec.asset_decimals,
    swapSignature,
    expectedUnits: exec.reward_amount_units,
    depositKeypair,
  });
}
/**
 * THE DELIVERY LEG, ON ITS OWN, SO A KILLED REQUEST CAN BE FINISHED LATER.
 *
 * Extracted from executeRewardClaim because delivery is the half of the flow that
 * can outlive its request. Observed live: the swap landed in one second, the
 * confirmation call took 41 seconds to say so, the delivery transaction was sent
 * at 19:37:26, and the Vercel function died at 19:37:44 while confirming it. The
 * customer held the asset, our row said 'claiming', and the page told them
 * something had failed. The chain was right and the record was wrong.
 *
 * TWO RULES MAKE A RETRY SAFE:
 *   1. the amount delivered is read from the SWAP TRANSACTION itself, so it does
 *      not drift if the merchant's balance has moved since;
 *   2. if the customer's token account ALREADY holds that amount, this leg has
 *      already run, so the row is settled instead of the asset being sent twice.
 *
 * NO REFUND ON FAILURE HERE. Once the swap has landed the value exists as the
 * reward asset, so releasing the USDC reserve would pay the merchant twice. This
 * fails the row with the reason recorded and no refund, which is the honest
 * state: the merchant holds the swapped asset and a human should look.
 */
export async function deliverRewardAsset(params: {
  claimId: string;
  merchantId: string;
  merchantPubkey: PublicKey;
  customerPubkey: PublicKey;
  assetMint: string;
  assetDecimals: number;
  swapSignature: string;
  expectedUnits: bigint;
  depositKeypair: Keypair;
}): Promise<RewardClaimOutcome> {
  const conn = getSolanaConnection();
  const feePayer = getFeePayerKeypair();
  const mintPubkey = new PublicKey(params.assetMint);
  const sourceAta = getAssociatedTokenAddressSync(
    mintPubkey,
    params.merchantPubkey,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  const customerAta = getAssociatedTokenAddressSync(
    mintPubkey,
    params.customerPubkey,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  // Rule 1: the swap's own output, read from its transaction.
  const received = await assetReceivedByOwner(
    params.swapSignature,
    params.assetMint,
    params.merchantPubkey,
  );
  const deliverUnits = received ?? params.expectedUnits;
  if (deliverUnits <= 0n) {
    await failClaim(
      params.claimId,
      params.merchantId,
      0n, // the value is held as the swapped asset, so no USDC refund
      "swap_landed_but_no_asset_received",
    );
    return {
      status: "failed",
      signature: params.swapSignature,
      reason:
        "The swap landed but produced no deliverable asset; this needs manual review.",
    };
  }

  // Rule 2: already delivered? Settle it, never resend it.
  const alreadyHeld = await customerHolding(mintPubkey, params.customerPubkey);
  if (alreadyHeld >= deliverUnits) {
    await completeClaim(params.claimId, params.swapSignature);
    return {
      status: "delivered",
      signature: params.swapSignature,
      reason: null,
    };
  }

  let transferSignature: string;
  let deliveryBlockhash: string | null = null;
  try {
    // Reward assets are Token-2022, so the transfer and the customer's ATA must
    // both be built with TOKEN_2022_PROGRAM_ID. A legacy-program instruction
    // here would be invalid.
    const transferIx = createTransferCheckedInstruction(
      sourceAta,
      mintPubkey,
      customerAta,
      params.merchantPubkey,
      deliverUnits,
      params.assetDecimals,
      [],
      TOKEN_2022_PROGRAM_ID,
    );
    // The fee payer covers the one-time rent when the customer's wallet has
    // never held this asset before, which is the realistic first-claim case.
    const createCustomerAtaIx =
      createAssociatedTokenAccountIdempotentInstruction(
        feePayer.publicKey,
        customerAta,
        params.customerPubkey,
        mintPubkey,
        TOKEN_2022_PROGRAM_ID,
      );

    const latest = await conn.getLatestBlockhash();
    deliveryBlockhash = latest.blockhash;
    const tx = new Transaction();
    tx.feePayer = feePayer.publicKey;
    tx.recentBlockhash = latest.blockhash;
    tx.lastValidBlockHeight = latest.lastValidBlockHeight;
    tx.add(createCustomerAtaIx, transferIx);
    tx.sign(params.depositKeypair, feePayer);

    // Simulate before sending, for the same reason the swap leg does: a doomed
    // transaction otherwise costs a fee and a slot and leaves an on-chain error
    // to explain from logs later.
    const simulation = await conn.simulateTransaction(tx);
    if (simulation.value.err) {
      const refusal = (simulation.value.logs ?? [])
        .filter((line) =>
          /insufficient|custom program error|failed/i.test(line),
        )
        .slice(-1)[0];
      throw new Error(
        refusal
          ? `simulation failed: ${refusal}`
          : `simulation failed: ${JSON.stringify(simulation.value.err)}`,
      );
    }

    transferSignature = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
      maxRetries: 2,
    });
  } catch (e) {
    await failClaim(
      params.claimId,
      params.merchantId,
      0n,
      `transfer_out_failed_swap_landed: ${(e as Error).message}`,
    );
    return {
      status: "failed",
      signature: params.swapSignature,
      reason: `The swap completed but delivery to the customer failed (${(e as Error).message}). The merchant holds the swapped asset; this needs manual review.`,
    };
  }

  const verdict = await waitForOutcome(
    transferSignature,
    DELIVERY_CONFIRM_BUDGET_MS,
    deliveryBlockhash,
  );
  if (verdict === "confirmed") {
    await completeClaim(params.claimId, transferSignature);
    return { status: "delivered", signature: transferSignature, reason: null };
  }
  if (verdict === "indeterminate") {
    return {
      status: "claiming",
      signature: transferSignature,
      reason:
        "Your reward is on its way. This settles on its own within a minute.",
    };
  }

  const onChain = await describeFailureSignature(transferSignature);
  await failClaim(
    params.claimId,
    params.merchantId,
    0n,
    `delivery_not_confirmed_swap_landed: ${onChain ?? "no on-chain trace"}`,
  );
  return {
    status: "failed",
    signature: transferSignature,
    reason: onChain
      ? `The reward could not be delivered to that wallet (${onChain}). The merchant still holds it, so please reach out.`
      : "The reward could not be delivered to that wallet. The merchant still holds it, so please reach out.",
  };
}
