import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import { getSettings, getSdkSnippet, listAssets } from "@/lib/services/merchant";
import { RewardsForm } from "@/components/RewardsForm";

export default async function RewardsPage() {
  const { merchant } = await requireDashboardMerchant();
  const settings = await getSettings(merchant.id);
  const assets = await listAssets();
  const snippet = getSdkSnippet(merchant.public_id);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Rewards</h1>
      <p className="mt-1 text-sm text-gray-500">
        Choose one reward asset and set the reward rate your customers earn.
      </p>
      <RewardsForm
        assets={assets}
        initialAsset={settings.reward_asset}
        initialBps={settings.reward_bps}
        initialEnabled={settings.is_enabled}
        sdkSnippet={snippet}
      />
    </div>
  );
}