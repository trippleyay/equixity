import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getRewardForHostedPage,
  type HostedRewardView,
} from "@/lib/services/reward-delivery";
import { rewardAttestationText } from "@/lib/compliance/restricted-countries";
import { formatBaseUnitsWithDecimals, formatUsdcUnits } from "@/lib/format";
import { RewardClaimExperience } from "@/components/RewardClaimExperience";
import { RewardProviders } from "@/components/RewardProviders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You've got a reward!",
  description: "Claim the stock reward from your purchase.",
};

/**
 * /reward/[rewardEventId] — the hosted reward page
 * (reward-delivery spec sections 3a and 8).
 *
 * The entire customer flow lives HERE, as ordinary React under Equixity's own
 * domain: the geo check, the attestation checkbox, the blocked message, the
 * fiat wallet choice, and delivery. The merchant's page carries only the
 * notification badge that links here and nothing else.
 *
 * PUBLIC by design: no Equixity account is needed. Access control is the
 * unguessable UUID itself, which is why nothing beyond this one reward is ever
 * rendered or returned (spec section 7).
 */

/**
 * Reward amount in the asset's own units ("0.42"), reusing the shared
 * integer-math formatter rather than a second copy of the same division.
 */
function displayAmount(uiish: string | null, decimals: number | null): string {
  if (!uiish) return "0";
  return formatBaseUnitsWithDecimals(uiish, decimals ?? 0);
}

export default async function RewardPage({
  params,
}: {
  params: Promise<{ rewardEventId: string }>;
}) {
  const { rewardEventId } = await params;
  const reward: HostedRewardView | null =
    await getRewardForHostedPage(rewardEventId);
  if (!reward) notFound();

  const assetName = reward.asset_display_name ?? reward.reward_asset;
  const amount = displayAmount(reward.reward_amount_units, reward.asset_decimals);

  return (
    <RewardProviders>
      <RewardClaimExperience
        rewardEventId={rewardEventId}
        merchantName={reward.merchant_name}
        assetTicker={reward.asset_ticker ?? assetName}
        assetLogoUrl={reward.asset_logo_url}
        assetAmount={amount}
        assetWorth={
          reward.reward_usdc_units
            ? `Worth $${formatUsdcUnits(reward.reward_usdc_units)}`
            : null
        }
        attestationText={rewardAttestationText()}
        initiallyDelivered={reward.status === "delivered"}
      />
    </RewardProviders>
  );
}
