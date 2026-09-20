import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import { getSettings, listAssets } from "@/lib/services/merchant";
import { RewardsForm } from "@/components/RewardsForm";
import { getRecentClaimAssets } from "@/lib/services/claim-assets";

export default async function RewardsPage() {
  const { merchant } = await requireDashboardMerchant();
  const settings = await getSettings(merchant.id);
  const fallback = await listAssets();
  // One shape for the shared table (spec section 1 requires the same component
  // on the merchant Rewards view and the customer claim page).
  const catalog = await getRecentClaimAssets();
  const assets =
    catalog.length > 0
      ? catalog
      : fallback.map((a) => ({
          ticker: a.ticker,
          asset_type: a.asset_type,
          display_name: a.display_name,
          logo_url: a.logo_url,
          token_price_usd: a.token_price_usd,
        }));

  return (
    <div>
      <h1 className="font-display text-3xl font-medium text-ink">Rewards</h1>
      <p className="mt-1 text-sm text-gray-500">
        Choose one reward asset and set the reward rate your customers earn.
      </p>
      <RewardsForm
        assets={assets}
        initialAsset={settings.reward_asset}
        initialBps={settings.reward_bps}
        initialEnabled={settings.is_enabled}
        initialEligibilityConfirmed={settings.confirmed_customer_eligibility}
      />
    </div>
  );
}