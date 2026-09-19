import { getServiceClient } from "@/lib/supabase/service";
import { getSolanaConnection } from "@/lib/solana/connection";
import { CURATED_XSTOCK_TICKERS } from "@/lib/asset-curation";
import { fetchXstockCatalog, fetchXstockPrice } from "@/lib/assets/xstocks";
import { fetchPrestockCatalog } from "@/lib/assets/prestocks";
import { fetchMintDecimals } from "@/lib/assets/decimals";
import { cleanDisplayName } from "@/lib/format";

/**
 * The scheduled catalog sync (spec section 3).
 *
 * Runs on a schedule, NOT on page view: this catalog is shared, public data
 * that every merchant dashboard and every customer claim page reads, so
 * poll-on-view would hit both upstream APIs on every page load. Every part of
 * the app reads the cached `reward_assets` table instead, never the upstream
 * APIs at request time.
 *
 * Two upstream shapes are normalized here behind one row type:
 *   xStocks    -> paginated { nodes, page }, suffixed `symbol`, mint nested in
 *                 `deployments[]`, price via a SECOND per-asset endpoint.
 *   PreStocks  -> a bare array, unsuffixed `symbol`, `contract_address` mint,
 *                 price inline as `tokenPrice`.
 *
 * The two upstream fetches are independent: if one API is down, the other's
 * assets still sync. Prices are written in a second phase so a price failure
 * can never blank out prices already stored.
 */

const CURATED = new Set(CURATED_XSTOCK_TICKERS);

/** Bounded concurrency for the ~42 per-asset price calls. */
const PRICE_CONCURRENCY = 8;

export type CatalogSyncResult = {
  discovered: number;
  active: number;
  decimalsFetched: number;
  pricesUpdated: number;
  upstreamErrors: string[];
  rowErrors: string[];
};

type UpsertRow = {
  ticker: string;
  asset_type: "xstock" | "prestock";
  display_name: string;
  mint_address: string;
  decimals: number;
  logo_url: string;
  is_active: boolean;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
export async function syncRewardAssets(): Promise<CatalogSyncResult> {
  const service = getServiceClient();
  const connection = getSolanaConnection();

  const result: CatalogSyncResult = {
    discovered: 0,
    active: 0,
    decimalsFetched: 0,
    pricesUpdated: 0,
    upstreamErrors: [],
    rowErrors: [],
  };

  // --- 1. Fetch both upstream catalogs independently ------------------------
  const [xRes, pRes] = await Promise.allSettled([
    fetchXstockCatalog(),
    fetchPrestockCatalog(),
  ]);

  const xstocks = xRes.status === "fulfilled" ? xRes.value : [];
  if (xRes.status === "rejected") {
    result.upstreamErrors.push(`xStocks: ${String(xRes.reason)}`);
  }

  const prestocks = pRes.status === "fulfilled" ? pRes.value : [];
  if (pRes.status === "rejected") {
    result.upstreamErrors.push(`PreStocks: ${String(pRes.reason)}`);
  }

  // --- 2. Normalize into rows; curation decides is_active -------------------
  // xStocks: only the curated tickers are active, but everything discovered is
  // still upserted (as inactive) so the table can grow without a schema change.
  const xRows = xstocks.map((a) => ({
    ticker: a.ticker,
    asset_type: "xstock" as const,
    display_name: cleanDisplayName(a.displayName, a.ticker),
    mint_address: a.mintAddress,
    logo_url: a.logoUrl,
    is_active: CURATED.has(a.underlying),
  }));

  // PreStocks: no curation — whatever they list is what shows.
  const pRows = prestocks.map((a) => ({
    ticker: a.ticker,
    asset_type: "prestock" as const,
    display_name: cleanDisplayName(a.displayName, a.ticker),
    mint_address: a.mintAddress,
    logo_url: a.logoUrl,
    is_active: true,
  }));

  result.discovered = xRows.length + pRows.length;

  // --- 3. Decimals: reuse what we already have, RPC only for new mints ------
  const { data: existing } = await service
    .from("reward_assets")
    .select("ticker, mint_address, decimals");
  const decimalsByMint = new Map<string, number>();
  for (const row of existing ?? []) {
    if (row.mint_address && typeof row.decimals === "number") {
      decimalsByMint.set(row.mint_address, row.decimals);
    }
  }

  const upsertRows: UpsertRow[] = [];
  // Decimals lookups run with bounded concurrency: a COLD run (first-ever
  // sync) needs this RPC for every discovered mint (~936 today), and even at
  // ~150ms per call a sequential loop blows Vercel's 60s function cap. Warm
  // runs hit this same path for 0 mints (all cached), so this only costs on
  // genuinely new listings.
  const needingDecimals = [...xRows, ...pRows].filter(
    (row) => !decimalsByMint.has(row.mint_address),
  );
  await mapWithConcurrency(needingDecimals, 10, async (row) => {
    try {
      const decimals = await fetchMintDecimals(row.mint_address, connection);
      decimalsByMint.set(row.mint_address, decimals);
      result.decimalsFetched++;
    } catch (e) {
      result.rowErrors.push(
        `${row.ticker}: could not read mint decimals (${String(e)})`,
      );
    }
  });
  for (const row of [...xRows, ...pRows]) {
    const decimals = decimalsByMint.get(row.mint_address);
    // No decimals -> no row. Without them no unit conversion in the app can
    // ever be correct for this asset, so skipping is the only safe move.
    if (decimals === undefined) continue;
    upsertRows.push({ ...row, decimals });
  }

  // --- 4. Upsert the catalog. token_price_usd is deliberately NOT in this
  //        row set, so an upsert never resets a stored price to its default. -
  if (upsertRows.length > 0) {
    const { error } = await service
      .from("reward_assets")
      .upsert(upsertRows, { onConflict: "ticker" });
    if (error) {
      result.rowErrors.push(`upsert failed: ${error.message}`);
    }
  }

  result.active = upsertRows.filter((r) => r.is_active).length;

  // --- 5. Prices for ACTIVE rows only (~50 calls), separate phase ----------
  const activeXstocks = xRows.filter((r) => r.is_active);
  await mapWithConcurrency(activeXstocks, PRICE_CONCURRENCY, async (row) => {
    try {
      const price = await fetchXstockPrice(row.ticker);
      if (price === null) {
        result.rowErrors.push(`${row.ticker}: no price returned`);
        return;
      }
      const { error } = await service
        .from("reward_assets")
        .update({
          token_price_usd: price,
          price_updated_at: new Date().toISOString(),
        })
        .eq("ticker", row.ticker);
      if (error) {
        result.rowErrors.push(`${row.ticker}: price update failed (${error.message})`);
      } else {
        result.pricesUpdated++;
      }
    } catch (e) {
      result.rowErrors.push(`${row.ticker}: price fetch threw (${String(e)})`);
    }
  });

  // PreStocks prices arrive inline with the catalog, so no extra call is needed.
  for (const p of prestocks) {
    if (p.tokenPriceUsd === null) continue;
    const { error } = await service
      .from("reward_assets")
      .update({
        token_price_usd: p.tokenPriceUsd,
        price_updated_at: new Date().toISOString(),
      })
      .eq("ticker", p.ticker);
    if (!error) result.pricesUpdated++;
  }

  return result;
}