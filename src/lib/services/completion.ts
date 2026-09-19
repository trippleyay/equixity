import { getServiceClient } from "@/lib/supabase/service";
import { getActiveAsset } from "@/lib/services/assets";
import { calculateReward } from "@/lib/rewards/calculate";
import { env } from "@/lib/env";

/**
 * Shared purchase -> reward -> claim pipeline (spec section 4 steps 6-9).
 *
 * Both verification paths converge here once they have independently
 * established a trustworthy purchase amount:
 *   * section 4  (on-chain) reads the amount from the verified transaction;
 *   * section 4a (card)     trusts the merchant's own authenticated backend.
 * Neither path ever reads an amount from an untrusted request body, and the
 * amount parameter here is the already-verified bigint.
 */

export type CompletionSettings = {
  reward_bps: number;
  is_enabled: boolean;
  reward_asset: string;
  receiving_wallet_address: string | null;
};

export type CompletionSuccess = {
  ok: true;
  reward_event_id: string;
  /** Absent when rewards were disabled — nothing claimable was created. */
  claim_url: string | null;
  /** 'pending' when claimable, 'rewards_disabled' when the toggle was off. */
  status: "pending" | "rewards_disabled";
  reward_asset: string;
  reward_asset_ui_amount: string;
  reward_usdc_ui_value: string;
};

export type CompletionFailure = { ok: false; httpStatus: number; error: string };

export type CompletionResult = CompletionSuccess | CompletionFailure;

/** Public claim URL (spec section 4 step 9). Env-driven, like the SDK snippet. */
export function buildClaimUrl(rewardEventId: string): string {
  const base = (env.nextPublicAppUrl || "https://equixity.app").replace(/\/+$/, "");
  return `${base}/claim/${rewardEventId}`;
}
export async function recordPurchaseAndReward(params: {
  merchantId: string;
  settings: CompletionSettings;
  /** Exactly one of these two identifies the purchase's idempotency key. */
  transactionSignature: string | null;
  externalOrderId: string | null;
  /** Verified amounts — bigint. Only the matching path's field is populated. */
  purchaseUsdcUnits: bigint | null;
  purchaseCents: bigint | null;
}): Promise<CompletionResult> {
  const {
    merchantId,
    settings,
    transactionSignature,
    externalOrderId,
    purchaseUsdcUnits,
    purchaseCents,
  } = params;

  // --- Step 2: merchant must have finished setup ---------------------------
  // Reject clearly rather than guessing (spec section 4 step 2 / 4a step 2).
  if (!settings.receiving_wallet_address) {
    return {
      ok: false,
      httpStatus: 409,
      error:
        "This merchant has not registered a receiving wallet yet, so purchases cannot be verified.",
    };
  }

  // --- Step 3: idempotency guards ------------------------------------------
  // Checked explicitly so the caller gets a clear message; the unique
  // constraints behind them are the actual guarantee under concurrency.
  const service = getServiceClient();
  if (transactionSignature) {
    const { data: existing } = await service
      .from("reward_events")
      .select("id")
      .eq("transaction_signature", transactionSignature)
      .maybeSingle();
    if (existing) {
      return {
        ok: false,
        httpStatus: 409,
        error: "This transaction has already been claimed.",
      };
    }
  }
  if (externalOrderId) {
    const { data: existing } = await service
      .from("reward_events")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("external_order_id", externalOrderId)
      .maybeSingle();
    if (existing) {
      return {
        ok: false,
        httpStatus: 409,
        error: "This order has already been recorded.",
      };
    }
  }

  // --- Step 6: the reward asset must exist and be priced -------------------
  const asset = await getActiveAsset(settings.reward_asset);
  if (!asset) {
    return {
      ok: false,
      httpStatus: 409,
      error: `The selected reward asset '${settings.reward_asset}' is not currently available.`,
    };
  }

  // Compute the reward. A reward-math problem must never silently lose the
  // purchase: when rewards are disabled we do not compute at all, and if
  // computation fails it is surfaced as a clear error rather than recorded as
  // a phantom zero-value reward.
  let rewardAmountUnits: bigint | null = null;
  let rewardUsdcUnits: bigint | null = null;
  let rewardAssetUiAmount: string | null = null;
  let rewardUsdcUi: string | null = null;

  if (settings.is_enabled && purchaseUsdcUnits !== null) {
    try {
      const calc = await calculateReward({
        purchaseUsdcUnits,
        rewardBps: settings.reward_bps,
        asset,
      });
      rewardAmountUnits = calc.reward_amount_units;
      rewardUsdcUnits = calc.reward_usdc_units;
      rewardAssetUiAmount = calc.reward_asset_ui_amount;
      rewardUsdcUi = calc.reward_usdc_ui;
    } catch (e) {
      return { ok: false, httpStatus: 422, error: (e as Error).message };
    }
  }

  // --- Steps 7 & 8: record the purchase; claim only if it is claimable ------
  // Section 4 step 7: when the toggle is off, still record the purchase for
  // history but create NO claimable reward. That lands in the dedicated
  // 'rewards_disabled' status — distinct from both 'failed' and a compliance
  // 'ineligible' — so the row is never left at an undefined 'pending' forever.
  const claimable =
    settings.is_enabled && rewardAmountUnits !== null && rewardAmountUnits > 0n;

  const { data: eventId, error: rpcError } = await service.rpc(
    "create_reward_purchase",
    {
      p_merchant_id: merchantId,
      p_transaction_signature: transactionSignature,
      p_external_order_id: externalOrderId,
      // Cents is the card path's natural unit; base units is what the chain
      // gives us. Each column is populated by exactly one path.
      p_purchase_amount_cents: purchaseCents === null ? null : purchaseCents.toString(),
      p_purchase_amount_usdc_units:
        purchaseUsdcUnits === null ? null : purchaseUsdcUnits.toString(),
      p_reward_asset: settings.reward_asset,
      p_reward_amount_units: claimable ? rewardAmountUnits!.toString() : null,
      p_reward_usdc_units: claimable ? rewardUsdcUnits!.toString() : null,
      p_status: claimable ? "pending" : "rewards_disabled",
      p_create_claim: claimable,
    },
  );

  if (rpcError || !eventId) {
    // The unique indexes are the real idempotency guarantee under concurrency;
    // a collision surfaces here as a duplicate-key error.
    const message = rpcError?.message ?? "Could not record the purchase.";
    const isDuplicate = /duplicate key|unique/i.test(message);
    return {
      ok: false,
      httpStatus: isDuplicate ? 409 : 500,
      error: isDuplicate ? "This purchase has already been claimed." : message,
    };
  }

  // --- Step 9: the claim reference the SDK turns into a link ---------------
  return {
    ok: true,
    reward_event_id: eventId as string,
    claim_url: claimable ? buildClaimUrl(eventId as string) : null,
    status: claimable ? "pending" : "rewards_disabled",
    reward_asset: settings.reward_asset,
    reward_asset_ui_amount: rewardAssetUiAmount ?? "0",
    reward_usdc_ui_value: rewardUsdcUi ?? "0",
  };
}