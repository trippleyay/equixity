"use client";

import { useMemo, useState } from "react";
import { cleanDisplayName, formatUsdPrice } from "@/lib/format";

/**
 * The reward-asset catalog table (spec section 1).
 *
 * Locked presentation decisions: a FILTERABLE TABLE (not a dropdown) with logo,
 * symbol, name, price columns; the filter is All / Public Stock / Pre-IPO
 * defaulting to All; the price shown is the traded token price, never an
 * issuer's mark/implied valuation.
 *
 * ONE component, used both by the merchant Rewards view for selection and by the
 * customer claim page for showing which asset the reward is in — section 1
 * requires exactly that reuse.
 */

export type AssetRow = {
  ticker: string;
  asset_type: "xstock" | "prestock";
  display_name: string;
  logo_url: string;
  token_price_usd: string;
};

type Filter = "all" | "xstock" | "prestock";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "xstock", label: "Public Stock" },
  { id: "prestock", label: "Pre-IPO" },
];

export function AssetTable({
  assets,
  selectable = false,
  selectedTicker,
  onSelect,
  highlightTicker,
}: {
  assets: AssetRow[];
  selectable?: boolean;
  selectedTicker?: string | null;
  onSelect?: (ticker: string) => void;
  highlightTicker?: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const rows =
      filter === "all" ? assets : assets.filter((a) => a.asset_type === filter);
    // "All" is one merged, alphabetical list — not grouped by type. The two
    // type filters exist for exactly that separation.
    return [...rows].sort((a, b) =>
      cleanDisplayName(a.display_name, a.ticker)
        .localeCompare(cleanDisplayName(b.display_name, b.ticker), undefined, {
          sensitivity: "base",
        }),
    );
  }, [assets, filter]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count =
            f.id === "all"
              ? assets.length
              : assets.filter((a) => a.asset_type === f.id).length;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={active}
              className={
                active
                  ? "rounded-full bg-equixity-deep px-3 py-1 text-xs font-medium text-white transition hover:bg-equixity-deepDark"
                  : "rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-ink transition hover:bg-equixity-mist"
              }
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Scroll container: ~50 rows must not push the sections below the fold. */}
      <div className="max-h-96 overflow-auto rounded-2xl border border-ink/10">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead className="sticky top-0 z-10 bg-equixity-mist/60 backdrop-blur-sm">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate">Asset</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate">Symbol</th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate">Price</th>
              {selectable ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5 bg-white">
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={selectable ? 4 : 3}
                  className="px-3 py-6 text-center text-gray-500"
                >
                  No assets in this category yet.
                </td>
              </tr>
            ) : (
              visible.map((asset) => (
                <AssetTableRow
                  key={asset.ticker}
                  asset={asset}
                  selectable={selectable}
                  isSelected={selectedTicker === asset.ticker}
                  isHighlighted={highlightTicker === asset.ticker}
                  onSelect={onSelect}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssetTableRow({
  asset,
  selectable,
  isSelected,
  isHighlighted,
  onSelect,
}: {
  asset: AssetRow;
  selectable: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect?: (ticker: string) => void;
}) {
  return (
    <tr
      className={
        isHighlighted ? "bg-emerald-50" : isSelected ? "bg-equixity-mist" : undefined
      }
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {asset.logo_url ? (
            /* Hotlinked from the issuer's CDN (spec section 3: no re-hosting),
               so a plain img element is intentional here. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.logo_url}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 rounded-full"
              loading="lazy"
            />
          ) : (
            <span className="h-5 w-5 rounded-full bg-gray-200" />
          )}
          <span className="text-gray-900">
            {cleanDisplayName(asset.display_name, asset.ticker)}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-gray-700">{asset.ticker}</td>
      <td className="px-3 py-2 text-right text-gray-900">
        {formatUsdPrice(asset.token_price_usd)}
      </td>
      {selectable ? (
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={() => onSelect?.(asset.ticker)}
            className={
              isSelected
                ? "rounded-full bg-equixity-deep px-3 py-1 text-xs font-medium text-white transition hover:bg-equixity-deepDark"
                : "rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-ink transition hover:bg-equixity-mist"
            }
          >
            {isSelected ? "Selected" : "Select"}
          </button>
        </td>
      ) : null}
    </tr>
  );
}