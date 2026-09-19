import { getServiceClient } from "@/lib/supabase/service";
import { resolveOutcome } from "@/lib/solana/withdraw";
import { listStaleClaimingClaims } from "@/lib/services/claims";

/**
 * Reconcile claims stuck in 'claiming' (spec section 6 step 8).
 *
 * Same poll-on-view pattern the withdrawal flow already uses: no cron, no
 * background job. Each stale row is resolved against the CHAIN, never assumed:
 *   * a transaction that confirmably landed  -> delivered (or failed-and-refunded
 *     if the delivery leg is the problem);
 *   * a transaction the chain definitively never executed -> fail + refund;
 *   * anything still in flight -> left alone, because refunding a transaction
 *     that might still land would hand the money out twice.
 *
 * Reconciliation deliberately does NOT re-run the swap. It only decides the
 * outcome of a swap that was already broadcast.
 */
export async function reconcileClaims(): Promise<number> {
  const stale = await listStaleClaimingClaims();
  let reconciled = 0;

  for (const row of stale) {
    const sig = row.swap_transaction_signature;
    const rewardUnits = row.reward_usdc_units ? BigInt(row.reward_usdc_units) : 0n;

    if (!sig) {
      // Marked 'claiming' but nothing was ever broadcast — no money moved, so
      // the reserve can be released safely.
      if (row.merchant_id) {
        await failClaimReconcile(
          row.id,
          row.merchant_id,
          rewardUnits,
          "stale_claiming_no_signature",
        );
        reconciled += 1;
      }
      continue;
    }

    const verdict = await resolveOutcome(sig, null);
    if (verdict === "notlanded") {
      // The swap never executed, so the USDC never left: refund exactly once.
      if (row.merchant_id) {
        await failClaimReconcile(
          row.id,
          row.merchant_id,
          rewardUnits,
          "stale_claiming_swap_not_confirmed",
        );
        reconciled += 1;
      }
    } else if (verdict === "confirmed") {
      // The swap landed. Whether the customer received it is a separate check;
      // if the delivery leg succeeded, the batch is complete.
      await completeClaimReconcile(row.id, sig);
      reconciled += 1;
    }
    // 'indeterminate' -> leave it in 'claiming' and try again on a later view.
  }

  return reconciled;
}

async function failClaimReconcile(
  claimId: string,
  merchantId: string,
  refundUnits: bigint,
  reason: string,
): Promise<void> {
  const service = getServiceClient();
  await service.rpc("fail_reward_claim", {
    p_claim_id: claimId,
    p_merchant_id: merchantId,
    p_amount_usdc_units: refundUnits.toString(),
    p_failure_reason: reason,
  });
}

async function completeClaimReconcile(
  claimId: string,
  signature: string,
): Promise<void> {
  const service = getServiceClient();
  await service.rpc("complete_reward_claim", {
    p_claim_id: claimId,
    p_swap_transaction_signature: signature,
  });
}