import { getServiceClient } from "@/lib/supabase/service";
import { resolveOutcome } from "@/lib/solana/withdraw";
import {
  listStaleClaimingClaims,
  type StaleClaimRow,
} from "@/lib/services/claims";
import { deliverRewardAsset } from "@/lib/solana/reward-swap";
import { getDepositAccountForSigning } from "@/lib/services/merchant";
import { decryptSecretKey } from "@/lib/crypto/deposit-keys";
import { Keypair, PublicKey } from "@solana/web3.js";

/**
 * Reconcile claims stuck in 'claiming' (spec section 6 step 8).
 *
 * Same poll-on-view pattern the withdrawal flow already uses: no cron, no
 * background job. Each stale row is resolved against the CHAIN, never assumed:
 *   * a transaction that confirmably landed  -> FINISH the delivery (see below);
 *   * a transaction the chain definitively never executed -> fail + refund;
 *   * anything still in flight -> left alone, because refunding a transaction
 *     that might still land would hand the money out twice.
 *
 * "FINISH", NOT "ASSUME". This used to mark a row delivered as soon as the SWAP
 * was confirmed on chain, which is not the same claim: the swap only proves the
 * merchant received the asset. Observed live, our row sat in 'claiming' for a
 * delivery that had in fact completed, and the reconciler as written could have
 * marked delivered a row whose delivery transfer had never run at all. Both are
 * guesses about someone's money.
 *
 * So a confirmed swap now routes into the same delivery leg the live request
 * uses, and that leg decides from the chain: if the customer's token account
 * already holds the amount, the row is settled; if it does not, the transfer is
 * made. Neither path can double-send, and neither claims an outcome it did not
 * verify.
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
    const ageMs = Date.now() - new Date(row.updated_at).getTime();
    // A Solana blockhash expires in 151 slots (~60-90s). Any unconfirmed transaction
    // with no on-chain trace after 90 seconds will definitively never land.
    const isDefinitivelyDead =
      verdict === "notlanded" || (verdict === "indeterminate" && ageMs > 90_000);

    if (isDefinitivelyDead) {
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
      const settled = await finishDelivery(row, sig);
      if (settled) reconciled += 1;
    }
    // 'indeterminate' and <= 90s -> leave it in 'claiming' and try again on a later view.
  }

  return reconciled;
}

/**
 * Run (or verify) the delivery leg for a swap that is confirmed on chain.
 * Returns true when the row reached a terminal state.
 *
 * If the row does not carry enough to rebuild the leg, or anything goes wrong
 * while trying, this returns false and the row STAYS in 'claiming' for the next
 * view. That is deliberate: the alternative is writing an outcome nobody
 * verified, and this function exists because that already happened once.
 */
async function finishDelivery(
  row: StaleClaimRow,
  swapSignature: string,
): Promise<boolean> {
  if (
    !row.merchant_id ||
    !row.customer_wallet_address ||
    !row.asset_mint ||
    row.asset_decimals === null
  ) {
    return false;
  }

  try {
    const deposit = await getDepositAccountForSigning(row.merchant_id);
    const depositKeypair = Keypair.fromSecretKey(
      decryptSecretKey(deposit.encrypted_private_key),
    );
    const outcome = await deliverRewardAsset({
      claimId: row.id,
      merchantId: row.merchant_id,
      merchantPubkey: depositKeypair.publicKey,
      customerPubkey: new PublicKey(row.customer_wallet_address),
      assetMint: row.asset_mint,
      assetDecimals: row.asset_decimals,
      swapSignature,
      expectedUnits: row.reward_amount_units
        ? BigInt(row.reward_amount_units)
        : 0n,
      depositKeypair,
    });
    return outcome.status !== "claiming";
  } catch {
    return false;
  }
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
