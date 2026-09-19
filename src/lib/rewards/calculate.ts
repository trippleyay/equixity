import { USDC_DECIMALS } from "@/lib/solana/constants";
import { divideDecimal, formatDecimal } from "@/lib/decimal";
import { uiAmountToRawBaseUnits } from "@/lib/solana/scaled-amount";
import type { RewardAsset } from "@/lib/services/assets";

/**
 * Reward calculation (spec section 4 step 6, and the confirmed Scaled UI Amount
 * decision).
 *
 * The order of operations is exactly what the spec specifies:
 *   purchase_amount_usdc * reward_bps / 10000  -> USDC value
 *   -> convert to the reward asset's units using token_price_usd
 *
 * UNIT DISCIPLINE, which is the whole point of this module:
 *   * the USDC side is bigint base units throughout (integer division only —
 *     it truncates, so a reward can never be over-issued relative to the USDC
 *     value that backs it);
 *   * the ASSET side is computed in UI/scaled units, because `token_price_usd`
 *     is quoted per displayed unit;
 *   * conversion to RAW base units happens only at the end, via the
 *     extension-aware spl-token helper, so the Scaled UI Amount multiplier is
 *     honoured without any hand-rolled multiplier math.
 *
 * `reward_amount_units` (raw base units) is what gets stored and what the
 * transfer instruction spends; `reward_asset_ui_amount` is the human-facing
 * quantity.
 */

export type RewardCalculation = {
  /** Reward value in USDC base units (bigint). */
  reward_usdc_units: bigint;
  /** Reward value in USDC, display precision (e.g. "0.024000"). */
  reward_usdc_ui: string;
  /** Reward quantity in the asset's UI/scaled units (e.g. "0.00003146"). */
  reward_asset_ui_amount: string;
  /** Reward quantity in the asset's RAW base units — stored and transferred. */
  reward_amount_units: bigint;
};

export async function calculateReward(params: {
  purchaseUsdcUnits: bigint;
  rewardBps: number;
  asset: RewardAsset;
}): Promise<RewardCalculation> {
  const { purchaseUsdcUnits, rewardBps, asset } = params;

  if (purchaseUsdcUnits <= 0n) {
    throw new Error("Purchase amount must be greater than zero.");
  }
  if (!Number.isInteger(rewardBps) || rewardBps <= 0) {
    throw new Error("Reward rate must be a positive integer in basis points.");
  }

  // Integer division truncates toward zero — never round a reward up.
  const rewardUsdcUnits = (purchaseUsdcUnits * BigInt(rewardBps)) / 10000n;
  if (rewardUsdcUnits <= 0n) {
    throw new Error(
      "Purchase is too small to produce a reward at this merchant's reward rate.",
    );
  }

  const rewardUsdcUi = formatDecimal(rewardUsdcUnits, USDC_DECIMALS);

  const price = asset.token_price_usd;
  if (!price || Number(price) <= 0) {
    throw new Error(
      `No live price is available for ${asset.ticker} yet; a reward cannot be priced.`,
    );
  }

  // Rewards math in UI/scaled units (price is per displayed unit).
  const assetUiAmount = divideDecimal(rewardUsdcUi, price, 12);
  if (Number(assetUiAmount) <= 0) {
    throw new Error(
      `Reward rounds below one indivisible unit of ${asset.ticker}.`,
    );
  }

  // Single conversion point to raw base units, extension-aware.
  const rawUnits = await uiAmountToRawBaseUnits(asset.mint_address, assetUiAmount);
  if (rawUnits <= 0n) {
    throw new Error(
      `Reward is too small to represent in ${asset.ticker} base units.`,
    );
  }

  return {
    reward_usdc_units: rewardUsdcUnits,
    reward_usdc_ui: rewardUsdcUi,
    reward_asset_ui_amount: assetUiAmount,
    reward_amount_units: rawUnits,
  };
}