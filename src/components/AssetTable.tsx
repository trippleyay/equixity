"use client";

import { useMemo, useState } from "react";
import { formatUsdPrice } from "@/lib/format";

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

  const visible = useMemo(
    () => (filter === "all" ? assets : assets.filter((a) => a.asset_type === filter)),
    [assets, filter],
  );

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
                  ? "rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              }
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Asset</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Symbol</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Price</th>
              {selectable ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
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
        isHighlighted ? "bg-emerald-50" : isSelected ? "bg-blue-50" : undefined
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
          <span className="text-gray-900">{asset.display_name}</span>
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
                ? "rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white"
                : "rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            }
          >
            {isSelected ? "Selected" : "Select"}
          </button>
        </td>
      ) : null}
    </tr>
  );
}