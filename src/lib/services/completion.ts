import { getServiceClient } from "@/lib/supabase/service";
import { getActiveAsset } from "@/lib/services/assets";
import { calculateReward } from "@/lib/rewards/calculate";

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
  status: "pending" | "rewards_disabled";
  reward_asset: string;
  /** Human asset name for the notification copy ("Apple stock"). */
  asset_name: string;
  reward_asset_ui_amount: string;
  reward_usdc_ui_value: string;
};

export type CompletionFailure = {
  ok: false;
  httpStatus: number;
  error: string;
  /**
   * True when the "failure" is really "we already recorded this purchase".
   * A webhook must answer 2xx for those, or the processor retries forever.
   */
  duplicate?: boolean;
};

export type CompletionResult = CompletionSuccess | CompletionFailure;

export async function recordPurchaseAndReward(params: {
  merchantId: string;
  settings: CompletionSettings;
  /** Exactly one of these two identifies the purchase's idempotency key. */
  transactionSignature: string | null;
  externalOrderId: string | null;
  /** Verified amounts — bigint. Only the matching path's field is populated. */
  purchaseUsdcUnits: bigint | null;
  purchaseCents: bigint | null;
  /** Crypto path only: the paying wallet, known from the verified transaction. */
  customerWalletAddress?: string | null;
  /** Fiat only: processor-provided contact for the (future) backup notice. */
  backupEmail?: string | null;
}): Promise<CompletionResult> {
  const {
    merchantId,
    settings,
    transactionSignature,
    externalOrderId,
    purchaseUsdcUnits,
    purchaseCents,
    customerWalletAddress,
    backupEmail,
  } = params;

  // --- Step 2: the ON-CHAIN path requires a registered receiving wallet -----
  // (it is what purchase verification checks against). The card paths do NOT:
  // a fiat merchant needs no Solana wallet at all (spec section 5: "don't port
  // that check over"), and requiring one here was breaking complete-card for
  // exactly those merchants.
  if (transactionSignature && !settings.receiving_wallet_address) {
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
        duplicate: true,
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
        duplicate: true,
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
      // Crypto: the paying wallet IS the destination (spec: "same wallet that
      // paid"), recorded at creation so the customer never enters anything.
      p_customer_wallet_address: claimable ? (customerWalletAddress ?? null) : null,
      p_claim_method: claimable && customerWalletAddress ? "same_wallet" : null,
      p_backup_email: claimable ? (backupEmail ?? null) : null,
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
      duplicate: isDuplicate,
    };
  }

  // --- Step 9: the reward reference the notification links to --------------
  return {
    ok: true,
    reward_event_id: eventId as string,
    status: claimable ? "pending" : "rewards_disabled",
    reward_asset: settings.reward_asset,
    asset_name: asset.display_name,
    reward_asset_ui_amount: rewardAssetUiAmount ?? "0",
    reward_usdc_ui_value: rewardUsdcUi ?? "0",
  };
}