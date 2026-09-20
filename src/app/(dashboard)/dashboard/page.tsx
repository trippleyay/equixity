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
      <h1 className="font-display text-3xl font-medium text-ink">Overview</h1>
      <p className="mt-1 text-sm text-slate">
        Welcome, {merchant.name}.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          featured
          label="USDC balance"
          value={`$${formatUsdcUnits(balance)}`}
          sub="available to fund rewards"
        />
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
        <Card
          label="Rewards"
          value={settings.is_enabled ? "Enabled" : "Disabled"}
          sub="customer earning"
        />
        <Card
          label="Receiving wallet"
          value={settings.receiving_wallet_address ? "Set" : "Not set"}
          sub={
            settings.receiving_wallet_address
              ? `${settings.receiving_wallet_address.slice(0, 4)}…${settings.receiving_wallet_address.slice(-4)}`
              : "required to verify purchases"
          }
        />
        <Card
          label="Eligibility"
          value={settings.confirmed_customer_eligibility ? "Confirmed" : "Not confirmed"}
          sub="required to enable rewards"
        />
      </div>

      {/* Setup state is shown in the cards above (receiving wallet / eligibility);
          no separate warning banner — the Rewards toggle itself refuses to stick
          without them, server-side. */}

      <section className="mt-6 rounded-2xl border border-ink/5 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">
          Total rewards issued
        </h2>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-3xl font-medium text-ink">
            {totals.count}
          </span>
          <span className="text-sm text-slate">
            {formatBaseUnitsWithDecimals(totals.reward_amount_units, settings.decimals)}{" "}
            {settings.reward_asset}
          </span>
        </div>
        {rewards.length === 0 ? (
          <p className="mt-2 text-sm text-slate">
            No rewards issued yet. Rewards appear here once a customer earns one.
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate">
            Aggregated from reward_events (not a stored counter).
          </p>
        )}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-ink/5 bg-white shadow-soft">
        <div className="border-b border-ink/5 px-5 py-4 text-sm font-semibold text-ink">
          Recent activity
        </div>
        {recentFunding.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate">
            No activity yet. Send USDC to your deposit address and it will show
            up here after you open the Funding page.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/5">
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate">Signature</th>
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate">Amount</th>
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate">Detected</th>
              </tr>
            </thead>
            <tbody>
              {recentFunding.map((t) => (
                <tr key={t.id} className="border-b border-ink/5 transition last:border-0 hover:bg-equixity-mist/40">
                  <td className="px-5 py-3 font-mono text-xs text-slate">
                    {t.transaction_signature.slice(0, 20)}…
                  </td>
                  <td className="px-5 py-3 font-medium text-ink">${formatUsdcUnits(t.amount_usdc_units)}</td>
                  <td className="px-5 py-3 text-slate">
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
  featured,
}: {
  label: string;
  value: string;
  sub?: string;
  featured?: boolean;
}) {
  if (featured) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-equixity-deep to-[#420b53] p-5 text-white shadow-lift">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
          {label}
        </div>
        <div className="mt-2 font-display text-3xl font-medium">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-white/60">{sub}</div>}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-ink/5 bg-white p-5 shadow-soft transition hover:shadow-lift">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">
        {label}
      </div>
      <div className="mt-2 font-display text-2xl font-medium text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate">{sub}</div>}
    </div>
  );
}