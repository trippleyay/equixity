import { notFound } from "next/navigation";
import { getClaimForClaimPage } from "@/lib/services/claims";
import { getRecentClaimAssets } from "@/lib/services/claim-assets";
import { formatUsdcUnits } from "@/lib/format";
import { ClaimProviders } from "@/components/ClaimProviders";
import { ClaimPanel } from "@/components/ClaimPanel";
import { AssetTable } from "@/components/AssetTable";

export const dynamic = "force-dynamic";

/**
 * /claim/[rewardEventId] — the public customer claim page (spec section 5).
 *
 * PUBLIC BY DESIGN: no Equixity account is needed, matching the original
 * "no account requirement". Access control is the unguessable UUID itself, which
 * is why nothing beyond this one reward is ever rendered or returned
 * (spec section 7).
 *
 * The reward amount and asset come from the merchant's linked reward_events row
 * and the CACHED reward_assets catalog — never from an upstream API at request
 * time (spec section 3).
 */

function displayAmount(uiish: string | null, decimals: number | null): string {
  if (!uiish) return "0";
  // reward_amount_units is raw base units; show it with the asset's decimals,
  // using integer math only.
  const n = BigInt(uiish);
  const scale = 10n ** BigInt(decimals ?? 0);
  const whole = n / scale;
  const frac = (n % scale).toString().padStart(decimals ?? 0, "0");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole.toString();
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ rewardEventId: string }>;
}) {
  const { rewardEventId } = await params;
  const claim = await getClaimForClaimPage(rewardEventId);
  if (!claim) notFound();

  // The same catalog component the merchant dashboard uses (spec section 1
  // requires the reuse), scoped to a highlight of this reward's asset.
  const assets = await getRecentClaimAssets();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-gray-500">Equixity reward</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">
          {claim.merchant_name} sent you a reward
        </h1>
      </header>

      <section className="mb-6 rounded-lg border border-gray-200 p-5">
        <div className="flex items-center gap-3">
          {claim.asset_logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={claim.asset_logo_url}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-full"
            />
          ) : null}
          <div>
            <p className="text-lg font-semibold text-gray-900">
              {displayAmount(claim.reward_amount_units, claim.asset_decimals)}{" "}
              {claim.asset_display_name ?? claim.reward_asset}
            </p>
            <p className="text-sm text-gray-500">
              {claim.reward_usdc_units
                ? `Backed by $${formatUsdcUnits(claim.reward_usdc_units)} USDC`
                : null}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <ClaimProviders>
          <ClaimPanel rewardEventId={rewardEventId} initialStatus={claim.status} />
        </ClaimProviders>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-gray-900">
          Reward assets available through Equixity
        </h2>
        <AssetTable assets={assets} highlightTicker={claim.reward_asset} />
      </section>
    </main>
  );
}