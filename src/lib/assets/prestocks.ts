/**
 * PreStocks catalog adapter (spec section 3).
 *
 * Response shape verified against the LIVE endpoint, not assumed: a bare JSON
 * ARRAY (no wrapper object, no pagination) of currently 8 items, each with:
 *   symbol           -> 'ANDURIL'
 *   name             -> 'Anduril PreStocks'
 *   image            -> hotlinkable logo URL
 *   contract_address -> <mint>
 *   tokenPrice       -> traded price (USE THIS)
 *   markPrice        -> issuer's mark price (IGNORE, per spec section 1)
 *
 * Unlike xStocks there is no curation step: "whatever they list is what shows",
 * and the full list is synced live rather than capping at today's 8.
 */

const ENDPOINT = "https://prestocks.com/api/prestocks";

export type PrestockAsset = {
  /** Stored ticker — already unsuffixed, e.g. 'ANDURIL'. */
  ticker: string;
  displayName: string;
  logoUrl: string;
  mintAddress: string;
  tokenPriceUsd: string | null;
};

type PrestockItem = {
  symbol?: string;
  name?: string;
  image?: string;
  contract_address?: string;
  tokenPrice?: number | string;
  markPrice?: number | string;
};

function toPriceString(value: number | string | undefined): string | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(8);
}

export async function fetchPrestockCatalog(): Promise<PrestockAsset[]> {
  const res = await fetch(ENDPOINT, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`PreStocks catalog failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as unknown;

  if (!Array.isArray(json)) {
    throw new Error(
      "PreStocks catalog returned a non-array body (expected a bare JSON array).",
    );
  }

  const out: PrestockAsset[] = [];
  for (const raw of json as PrestockItem[]) {
    const ticker = raw.symbol?.trim();
    const mint = raw.contract_address?.trim();
    if (!ticker || !mint) continue;
    out.push({
      ticker,
      displayName: raw.name?.trim() || ticker,
      logoUrl: raw.image?.trim() || "",
      mintAddress: mint,
      // tokenPrice, never markPrice (spec section 1).
      tokenPriceUsd: toPriceString(raw.tokenPrice),
    });
  }

  if (out.length === 0) {
    throw new Error("PreStocks catalog parsed to 0 usable assets.");
  }

  return out;
}