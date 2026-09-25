import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import {
  getBalance,
  getSettings,
  listAssets,
  listRewards,
} from "@/lib/services/merchant";
import { formatBaseUnitsWithDecimals, formatBps, formatUsdcUnits } from "@/lib/format";

export default async function OverviewPage() {
  const { merchant } = await requireDashboardMerchant();

  const settings = await getSettings(merchant.id);
  const balance = await getBalance(merchant.id);
  const rewards = await listRewards(merchant.id);
  const catalog = await listAssets();
  const asset = catalog.find((a) => a.ticker === settings.reward_asset);

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
          logoUrl={asset?.logo_url}
        />
        <Card
          label="Reward status"
          value={settings.is_enabled ? "Enabled" : "Disabled"}
          sub={`${formatBps(settings.reward_bps)} per purchase`}
        />
      </div>

      <section className="mt-6 rounded-2xl border border-ink/5 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Reward transactions</h2>
        {rewards.length === 0 ? (
          <p className="mt-2 text-sm text-slate">
            No rewards issued yet. Rewards appear here once a customer earns one.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-[11px] font-semibold uppercase tracking-wider text-slate">
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Order amount</th>
                  <th className="pb-3 pr-4">Reward asset</th>
                  <th className="pb-3 pr-4">Reward amount</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rewards.map((reward) => (
                  <tr key={reward.id} className="border-b border-ink/5 last:border-0">
                    <td className="py-3 pr-4 text-slate">
                      {new Date(reward.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="py-3 pr-4 text-ink">
                      {reward.purchase_amount_cents !== null
                        ? `$${formatCents(reward.purchase_amount_cents)}`
                        : "Not available"}
                    </td>
                    <td className="py-3 pr-4 font-medium text-ink">
                      {reward.reward_asset ?? settings.reward_asset}
                    </td>
                    <td className="py-3 pr-4 text-ink">
                      {formatBaseUnitsWithDecimals(
                        reward.reward_amount_units ?? "0",
                        settings.decimals,
                      )}{" "}
                      {reward.reward_asset ?? settings.reward_asset}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={reward.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}

function formatCents(cents: string): string {
  const value = BigInt(cents);
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    pending: "Pending",
    delivered: "Delivered",
    failed: "Failed",
    rewards_disabled: "Rewards disabled",
  };
  const tone =
    status === "delivered"
      ? "bg-emerald-50 text-emerald-700"
      : status === "failed"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {label[status] ?? status}
    </span>
  );
}

function Card({
  label,
  value,
  sub,
  featured,
  logoUrl,
}: {
  label: string;
  value: string;
  sub?: string;
  featured?: boolean;
  logoUrl?: string | null;
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
      <div className="mt-2 flex items-center gap-2.5">
        {logoUrl ? (
          /* Hotlinked from the issuer's CDN (spec section 3: no re-hosting). */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-full"
            loading="lazy"
          />
        ) : null}
        <div className="font-display text-2xl font-medium text-ink">{value}</div>
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate">{sub}</div>}
    </div>
  );
}