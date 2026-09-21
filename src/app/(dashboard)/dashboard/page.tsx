import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import Link from "next/link";
import {
  getBalance,
  getSettings,
  listRewards,
  totalRewardsIssued,
} from "@/lib/services/merchant";
import { formatBaseUnitsWithDecimals, formatBps, formatUsdcUnits } from "@/lib/format";
import { getRecentClaimAssets } from "@/lib/services/claim-assets";
import { listClaimsForMerchant } from "@/lib/services/claims";

export default async function OverviewPage() {
  const { merchant } = await requireDashboardMerchant();

  const settings = await getSettings(merchant.id);
  const balance = await getBalance(merchant.id);
  const totals = await totalRewardsIssued(merchant.id);
  const rewards = await listRewards(merchant.id);
  const catalog = await getRecentClaimAssets();
  const asset = catalog.find((a) => a.ticker === settings.reward_asset);

  // Needs-attention: only shows when something is actually wrong.
  const now = Date.now();
  const claims = await listClaimsForMerchant(merchant.id);
  const attention = claims.filter((c) => {
    if (c.status === "failed") return true;
    if (c.status === "submitted" || c.status === "claiming") {
      return now - new Date(c.created_at).getTime() > 15 * 60_000;
    }
    return false;
  });

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

      {/* Setup notices: only what actually blocks or matters to the merchant. */}
      {attention.length > 0 && (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-amber-900">
            Claims needing attention ({attention.length})
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-amber-900">
            {attention.slice(0, 5).map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium uppercase">{c.status}</span>
                <span className="text-amber-800">
                  {new Date(c.created_at).toLocaleString()}
                </span>
                {c.failure_reason && (
                  <span className="text-amber-800">- {c.failure_reason}</span>
                )}
              </li>
            ))}
          </ul>
          {attention.length > 5 && (
            <p className="mt-2 text-xs text-amber-800">
              And {attention.length - 5} more. Stuck claims reconcile on the
              Funding page; failed claims have refunded the balance.
            </p>
          )}
        </section>
      )}

      {!settings.confirmed_customer_eligibility && (
        <Notice>
          Eligibility is not confirmed, so rewards cannot be distributed.{" "}
          <Link
            href="/rewards"
            className="font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Go to Rewards to confirm
          </Link>
          .
        </Notice>
      )}

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

    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {children}
    </div>
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