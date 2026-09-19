import type { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
import { FUNDING_COMMITMENT } from "@/lib/solana/constants";

/**
 * Fetch a parsed transaction with the versioned-transaction flag set.
 *
 * `maxSupportedTransactionVersion: 0` is REQUIRED, not optional: without it the
 * RPC returns an error for any versioned transaction, and every Jupiter swap
 * and most modern transfers are versioned. Omitting it would look like "no such
 * transaction" and silently fail verification for perfectly valid purchases.
 *
 * Verified against the installed @solana/web3.js 1.99 type:
 *   getParsedTransaction(signature, commitmentOrConfig?: GetVersionedTransactionConfig | Finality)
 *   GetVersionedTransactionConfig = { commitment?: Finality; maxSupportedTransactionVersion?: number }
 *
 * Returns null (rather than throwing) when the RPC has no such transaction, so
 * callers produce a clear "not found / not yet confirmed" message.
 */
export async function getParsedTransaction(
  connection: Connection,
  signature: string,
): Promise<ParsedTransactionWithMeta | null> {
  return connection.getParsedTransaction(signature, {
    commitment: FUNDING_COMMITMENT,
    maxSupportedTransactionVersion: 0,
  });
}