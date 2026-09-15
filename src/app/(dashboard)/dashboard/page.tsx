import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import {
  getBalance,
  getSettings,
  listRewards,
  totalRewardsIssued,
} from "@/lib/services/merchant";
import { listFundingTransactions } from "@/lib/solana/sync-deposits";
import { formatBaseUnitsWithDecimals, formatBps, formatUsdcUnits } from "@/lib/format";

export default async function OverviewPage() {
  const { merchant } = await requireDashboardMerchant();

  const settings = await getSettings(merchant.id);
  const balance = await getBalance(merchant.id);
  const totals = await totalRewardsIssued(merchant.id);
  const funding = await listFundingTransactions(merchant.id);
  const recentFunding = funding.transactions.slice(0, 6);
  const rewards = await listRewards(merchant.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Overview</h1>
      <p className="mt-1 text-sm text-gray-500">
        Welcome back, {merchant.name}.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card label="USDC balance" value={`$${formatUsdcUnits(balance)}`} />
        <Card
          label="Reward asset"
          value={settings.display_name}
          sub={settings.reward_asset}
        />
        <Card
          label="Reward rate"
          value={formatBps(settings.reward_bps)}
          sub={`capped at 20%`}
        />
      </div>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white">
        <h2 className="px-4 py-3 text-sm font-semibold text-gray-700">
          Total rewards issued
        </h2>
        <div className="px-4 py-4 text-2xl font-semibold">
          {totals.count}{" "}
          <span className="text-sm text-gray-500">
            {formatBaseUnitsWithDecimals(totals.reward_amount_units, settings.decimals)}{" "}
            {settings.reward_asset}
          </span>
        </div>
        {rewards.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-gray-500">
            No rewards issued yet. Rewards appear here once a customer earns one.
          </p>
        ) : (
          <p className="px-4 pb-4 text-sm text-gray-500">
            Aggregated from reward_events (not a stored counter).
          </p>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white">
        <div className="px-4 py-3 text-sm font-semibold text-gray-700">
          Recent activity
        </div>
        {recentFunding.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500">
            No activity yet. Send USDC to your deposit address and it will show
            up here after you open the Funding page.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-4 py-2">Signature</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Detected</th>
              </tr>
            </thead>
            <tbody>
              {recentFunding.map((t) => (
                <tr key={t.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs text-gray-600">
                    {t.transaction_signature.slice(0, 20)}…
                  </td>
                  <td className="px-4 py-2">${formatUsdcUnits(t.amount_usdc_units)}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(t.detected_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}