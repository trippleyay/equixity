import { PublicKey } from "@solana/web3.js";
import type { ParsedTransactionWithMeta } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { getServiceClient } from "@/lib/supabase/service";
import { getSolanaConnection } from "@/lib/solana/connection";
import {
  DEPOSIT_SCAN_LIMIT,
  FUNDING_COMMITMENT,
  USDC_MINT,
} from "@/lib/solana/constants";

export type FundingTransactionRow = {
  id: string;
  transaction_signature: string;
  amount_usdc_units: string; // bigint as decimal string — never a JS number
  status: string;
  detected_at: string;
};

/**
 * Net USDC (base units) that landed in the merchant's deposit USDC token account
 * within a single parsed transaction. Returns null (no credit) unless positive.
 *
 * Why balance deltas (not instruction destinations): on SPL Token, inbound USDC
 * transfers to the merchant's ATA list the ATA — not the merchant wallet — as
 * the destination. Balance deltas also catch CPI-wrapped transfers (aggregator
 * programs) that top-level instructions don't expose.
 *
 * Amounts come from the "amount" raw-unit string field; never uiAmount (a
 * float), per the no-floats rule.
 */
function usdcNetReceived(
  parsed: ParsedTransactionWithMeta | null,
  owner: PublicKey,
  depositAta: PublicKey,
): bigint | null {
  const meta = parsed?.meta;
  if (!meta) return null;

  const accountKeys = parsed!.transaction.message.accountKeys;
  const post = meta.postTokenBalances ?? [];
  const pre = meta.preTokenBalances ?? [];
  const ownerStr = owner.toBase58();
  const ataStr = depositAta.toBase58();

  const postIdx = post.findIndex(
    (b) => b.mint === USDC_MINT && b.owner === ownerStr,
  );
  if (postIdx === -1) return null;

  // Cross-check that the affected token account is really the USDC ATA derived
  // from this merchant's deposit address (not some other USDC account they own).
  const postEntry = post[postIdx];
  const acct = accountKeys?.[postEntry.accountIndex];
  if (acct && acct.pubkey.toString() !== ataStr) return null;

  const preEntry = pre.find(
    (b) => b.accountIndex === postEntry.accountIndex && b.mint === USDC_MINT,
  );
  // Raw unit string (never the float uiAmount) — see TokenBalance.uiTokenAmount.
  const postUnits = BigInt(postEntry.uiTokenAmount.amount);
  const preUnits = preEntry ? BigInt(preEntry.uiTokenAmount.amount) : 0n;
  const delta = postUnits - preUnits;
  return delta > 0n ? delta : null;
}

export type FundingSyncResult = {
  deposit_address: string;
  balance: string; // bigint as decimal string
  transactions: FundingTransactionRow[];
  checkedSignatures: number;
  newCredits: number;
};

/**
 * Poll-on-view funding sync (spec section 5):
 *   1. Look up the merchant's deposit_address.
 *   2. getSignaturesForAddress + getParsedTransaction for signatures not
 *      already recorded.
 *   3. Filter to confirmed USDC credits into the deposit ATA.
 *   4. credit_funding() inserts the funding_transactions row and increments the
 *      balance in a single plpgsql function call (atomic — no read-then-write).
 *   5. Return the current balance and full history.
 *
 * Runs only when a merchant opens/refreshes the Funding page — no cron, no
 * webhook (spec section 1).
 */
export async function syncFunding(
  merchantId: string,
): Promise<FundingSyncResult> {
  const service = getServiceClient();

  // 1. deposit address. Service-role only; selects deposit_address and never
  // encrypted_private_key (spec section 8).
  const { data: dep, error: depError } = await service
    .from("merchant_deposit_accounts")
    .select("deposit_address")
    .eq("merchant_id", merchantId)
    .single();
  if (depError || !dep) {
    throw new Error("No deposit account found for this merchant.");
  }
  const depositAddress = dep.deposit_address;
  const depositPubkey = new PublicKey(depositAddress);

  // Deterministic USDC ATA for this deposit address; does not need to exist
  // on-chain yet.
  const ata = await getAssociatedTokenAddress(
    new PublicKey(USDC_MINT),
    depositPubkey,
  );

  const conn = getSolanaConnection();

  // 2. Newest confirmed signatures. Query BOTH the wallet and its USDC ATA:
  // inbound USDC transfers list the ATA (not the wallet) in account_keys, so a
  // wallet-only query would silently miss them (documented correction to §5.2).
  const walletSigs =
    (await conn.getSignaturesForAddress(depositPubkey, {
      limit: DEPOSIT_SCAN_LIMIT,
    })) ?? [];
  const ataSigs =
    (await conn.getSignaturesForAddress(ata, {
      limit: DEPOSIT_SCAN_LIMIT,
    })) ?? [];

  const bySig = new Map<string, string>();
  for (const s of [...walletSigs, ...ataSigs])
    bySig.set(s.signature, s.err ? "err" : "ok");
  const candidates = [...bySig.entries()]
    .filter(([, status]) => status === "ok")
    .map(([sig]) => sig);

  // 3. Exclude already-recorded transactions.
  const { data: recorded } = await service
    .from("funding_transactions")
    .select("transaction_signature")
    .eq("merchant_id", merchantId);
  const recordedSet = new Set(recorded?.map((r) => r.transaction_signature) ?? []);
  const newSigs = candidates.filter((sig) => !recordedSet.has(sig));

  // 4. Credit each new confirmed incoming USDC transfer, atomically.
  let newCredits = 0;
  for (const sig of newSigs) {
    const parsed = await conn.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0,
      commitment: FUNDING_COMMITMENT,
    });
    const delta = usdcNetReceived(parsed, depositPubkey, ata);
    if (delta === null) continue;
    await service.rpc("credit_funding", {
      p_merchant_id: merchantId,
      p_transaction_signature: sig,
      // bigint arg must travel as a decimal string (JSON has no bigint).
      p_amount_usdc_units: delta.toString(),
    });
    newCredits += 1;
  }

  // 5. Return current balance + full history.
  const { balance, transactions } = await listFundingTransactions(merchantId);
  return {
    deposit_address: depositAddress,
    balance,
    transactions,
    checkedSignatures: candidates.length,
    newCredits,
  };
}

export async function listFundingTransactions(merchantId: string): Promise<{
  balance: string;
  transactions: FundingTransactionRow[];
}> {
  const service = getServiceClient();
  // ::text cast keeps the bigint exact across JSON (PostgREST would otherwise
  // hand back a JS number and risk precision loss above 2^53 units).
  const { data: balance } = await service
    .from("merchant_balances")
    .select("available_usdc_units::text")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  const { data: txs } = await service
    .from("funding_transactions")
    .select(
      "id, transaction_signature, amount_usdc_units::text, status, detected_at",
    )
    .eq("merchant_id", merchantId)
    .order("detected_at", { ascending: false });
  return {
    balance: balance?.available_usdc_units ?? "0",
    transactions: (txs ?? []).map((t) => ({
      id: t.id,
      transaction_signature: t.transaction_signature,
      amount_usdc_units: t.amount_usdc_units ?? "0",
      status: t.status,
      detected_at: t.detected_at,
    })),
  };
}