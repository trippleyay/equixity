import Link from "next/link";
import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import {
  getBalance,
  getSettings,
  listAssets,
  listRewards,
} from "@/lib/services/merchant";
import { formatBaseUnitsWithDecimals, formatBps, formatUsdcUnits } from "@/lib/format";

const PAGE_SIZE = 10;

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { merchant } = await requireDashboardMerchant();

  const settings = await getSettings(merchant.id);
  const balance = await getBalance(merchant.id);
  const rewards = await listRewards(merchant.id);
  const catalog = await listAssets();
  const asset = catalog.find((a) => a.ticker === settings.reward_asset);
  const issued = rewards.filter(
    (reward) => reward.status === "completed" || reward.status === "delivered",
  );
  const issuedByAsset = new Map<
    string,
    { units: bigint; usdcUnits: bigint; decimals: number }
  >();
  for (const reward of issued) {
    const ticker = reward.reward_asset ?? settings.reward_asset;
    const current = issuedByAsset.get(ticker) ?? {
      units: 0n,
      usdcUnits: 0n,
      decimals: catalog.find((item) => item.ticker === ticker)?.decimals ?? settings.decimals,
    };
    current.units += BigInt(reward.reward_amount_units ?? "0");
    current.usdcUnits += BigInt(reward.reward_usdc_units ?? "0");
    issuedByAsset.set(ticker, current);
  }
  const issuedAssets = [...issuedByAsset.entries()].map(([ticker, totals]) => ({
    ticker,
    ...totals,
    catalogAsset: catalog.find((item) => item.ticker === ticker),
  }));
  const totalIssuedUsdc = issuedAssets.reduce(
    (total, issuedAsset) => total + issuedAsset.usdcUnits,
    0n,
  );
  const params = await searchParams;
  const requestedPage = Number(params.page ?? "1");
  const totalPages = Math.max(1, Math.ceil(rewards.length / PAGE_SIZE));
  const page = Number.isInteger(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;
  const pageRewards = rewards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
        <h2 className="text-sm font-semibold text-ink">Total rewards issued</h2>
        {issuedAssets.length === 0 ? (
          <p className="mt-2 text-sm text-slate">No rewards issued yet.</p>
        ) : (
          <>
            <div className="mt-4 flex items-baseline gap-3 rounded-xl bg-mist/50 px-4 py-4">
              <div className="text-xs text-slate">Rewards</div>
              <div className="font-display text-3xl font-medium text-ink">
                {issued.length.toLocaleString()}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">
                Total value: ${formatUsdcUnits(totalIssuedUsdc)}
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {issuedAssets.map((issuedAsset) => (
                <div
                  key={issuedAsset.ticker}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-ink/5 px-4 py-3"
                >
                  {issuedAsset.catalogAsset?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={issuedAsset.catalogAsset.logo_url}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-mist" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-ink">
                      {issuedAsset.catalogAsset?.display_name ?? issuedAsset.ticker}
                    </div>
                    <div className="truncate text-xs text-slate">
                      {formatBaseUnitsWithDecimals(issuedAsset.units, issuedAsset.decimals)}{" "}
                      {issuedAsset.ticker}
                    </div>
                  </div>
                  <div className="whitespace-nowrap font-display text-lg font-medium text-ink">
                    ${formatUsdcUnits(issuedAsset.usdcUnits)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

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
                  <th className="pb-3 pr-4">Asset</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRewards.map((reward) => (
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
                      {catalog.find(
                        (item) =>
                          item.ticker === (reward.reward_asset ?? settings.reward_asset),
                      )?.display_name ?? reward.reward_asset ?? settings.reward_asset}
                    </td>
                    <td className="py-3 pr-4 text-ink">
                      {formatBaseUnitsWithDecimals(
                        reward.reward_amount_units ?? "0",
                        catalog.find(
                          (item) =>
                            item.ticker === (reward.reward_asset ?? settings.reward_asset),
                        )?.decimals ?? settings.decimals,
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
            {totalPages > 1 ? (
              <nav className="mt-5 flex flex-wrap items-center justify-center gap-1.5" aria-label="Reward transaction pages">
                <PageLink page={page - 1} disabled={page === 1} label="Previous" />
                {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                  (pageNumber) => (
                    <Link
                      key={pageNumber}
                      href={pageNumber === 1 ? "/dashboard" : `/dashboard?page=${pageNumber}`}
                      aria-current={pageNumber === page ? "page" : undefined}
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-medium transition ${
                        pageNumber === page
                          ? "bg-equixity-deep text-white"
                          : "bg-mist/70 text-ink hover:bg-mist"
                      }`}
                    >
                      {pageNumber}
                    </Link>
                  ),
                )}
                <PageLink page={page + 1} disabled={page === totalPages} label="Next" />
              </nav>
            ) : null}
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

function PageLink({
  page,
  disabled,
  label,
}: {
  page: number;
  disabled: boolean;
  label: string;
}) {
  const className = `inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium transition ${
    disabled
      ? "pointer-events-none bg-slate-100 text-slate-400"
      : "bg-mist/70 text-ink hover:bg-mist"
  }`;
  if (disabled) {
    return (
      <span className={className} aria-disabled="true">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={page === 1 ? "/dashboard" : `/dashboard?page=${page}`}
      className={className}
    >
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    pending: "Pending",
    completed: "Completed",
    delivered: "Completed",
    failed: "Failed",
    rewards_disabled: "Rewards disabled",
  };
  const tone =
    status === "completed" || status === "delivered"
      ? "bg-emerald-50 text-emerald-700"
      : status === "failed"
        ? "bg-slate-700 text-white"
        : "bg-slate-100 text-slate-600";
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