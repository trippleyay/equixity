import { notFound } from "next/navigation";
import {
  getRewardForHostedPage,
  type HostedRewardView,
} from "@/lib/services/reward-delivery";
import { rewardAttestationText } from "@/lib/compliance/restricted-countries";
import { formatBaseUnitsWithDecimals, formatUsdcUnits } from "@/lib/format";
import { RewardProviders } from "@/components/RewardProviders";
import { RewardClaimPanel } from "@/components/RewardClaimPanel";

export const dynamic = "force-dynamic";

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
    <main className="mx-auto min-h-screen max-w-2xl bg-gradient-to-b from-equixity-mist/60 via-white to-white px-4 py-12">
      <header className="mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/equixity-wordmark-dark.svg"
          alt="Equixity"
          width={132}
          height={28}
          className="h-6 w-auto sm:h-7"
        />
        <h1 className="mt-3 font-display text-3xl font-medium text-ink">
          {reward.merchant_name} sent you a reward
        </h1>
      </header>

      <section className="mb-6 rounded-2xl border border-ink/5 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-3">
          {/*
            The logo is hotlinked from the issuer's CDN rather than re-hosted, so
            it can fail on a cold or slow request. The mist circle sits behind it
            unconditionally: if the image does not load, the customer sees a
            clean placeholder rather than an empty gap. `eager` because this is
            above the fold on a page the customer reaches once.
          */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-equixity-mist">
            {reward.asset_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={reward.asset_logo_url}
                alt=""
                width={40}
                height={40}
                loading="eager"
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="font-display text-2xl font-medium text-ink">
              {amount} {reward.asset_ticker ?? assetName}
            </p>
            {/*
              The customer's own currency is the STOCK, not the merchant's
              settlement currency. "Worth $0.05" is what a shopper cares about;
              naming USDC here is merchant plumbing leaking into their moment.
            */}
            <p className="text-sm text-slate">
              {reward.reward_usdc_units
                ? `Worth $${formatUsdcUnits(reward.reward_usdc_units)}`
                : null}
            </p>
          </div>
        </div>
      </section>

      <section>
        <RewardProviders>
          <RewardClaimPanel
            rewardEventId={rewardEventId}
            attestationText={rewardAttestationText()}
          />
        </RewardProviders>
      </section>
    </main>
  );
}
