/**
 * xStocks catalog adapter (spec section 3).
 *
 * Response shape verified against the LIVE v2 endpoint, not assumed:
 *   { nodes: [...], page: { currentPage, hasNextPage } }
 * and each node carries:
 *   symbol            -> 'AAPLx'   (the suffixed API symbol)
 *   underlyingSymbol  -> 'AAPL'    (what the curation list matches on)
 *   name              -> 'Apple xStock'
 *   logo              -> hotlinkable CDN URL
 *   deployments[]     -> { network: 'Solana', address: <mint>, ... }
 *
 * Two live-API traps this adapter exists to handle:
 *   1. `pageSize` above 100 SILENTLY returns an empty `nodes` array with HTTP
 *      200 (pageSize=2000 -> 0 nodes). So we page at 100 and treat an empty
 *      page as a hard failure rather than "the catalog is empty", which would
 *      otherwise quietly deactivate every asset.
 *   2. There is NO price field in this response at all. Prices come from a
 *      separate per-asset endpoint (see fetchXstockPrice).
 */

const BASE = "https://api.xstocks.fi/api/v2/public/assets";
const PAGE_SIZE = 100;
const MAX_PAGES = 40; // 928 assets / 100 = 10 pages today; generous headroom.

export type XstockAsset = {
  /** Stored ticker — the API's own `symbol`, e.g. 'AAPLx'. */
  ticker: string;
  /** Plain ticker used for curation matching, e.g. 'AAPL'. */
  underlying: string;
  displayName: string;
  logoUrl: string;
  mintAddress: string;
};

type XstockNode = {
  symbol?: string;
  underlyingSymbol?: string;
  name?: string;
  logo?: string;
  deployments?: Array<{ address?: string; network?: string }>;
};

function solanaMint(node: XstockNode): string | null {
  const deployments = node.deployments ?? [];
  const sol = deployments.find((d) => d?.network === "Solana" && d?.address);
  return sol?.address ?? null;
}

export async function fetchXstockCatalog(): Promise<XstockAsset[]> {
  const out: XstockAsset[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${BASE}?pageSize=${PAGE_SIZE}&page=${page}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`xStocks catalog page ${page} failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      nodes?: XstockNode[];
      page?: { hasNextPage?: boolean };
    };
    const nodes = json.nodes ?? [];

    // Trap 1: an empty page with hasNextPage=true, or an empty first page,
    // means the request shape was rejected — NOT that there are no assets.
    if (nodes.length === 0) {
      throw new Error(
        `xStocks catalog page ${page} returned 0 nodes (unexpected; refusing to treat as an empty catalog).`,
      );
    }

    for (const node of nodes) {
      const ticker = node.symbol?.trim();
      const underlying = node.underlyingSymbol?.trim();
      const mint = solanaMint(node);
      // Skip anything without the fields the catalog requires.
      if (!ticker || !underlying || !mint) continue;
      out.push({
        ticker,
        underlying,
        displayName: node.name?.trim() || ticker,
        logoUrl: node.logo?.trim() || "",
        mintAddress: mint,
      });
    }

    if (!json.page?.hasNextPage) break;
  }

  return out;
}

/**
 * Live traded price for one xStocks asset: `{ quote: 762.885 }`.
 * Deliberately NOT the issuer's mark/implied valuation (spec section 1:
 * "token price, not mark price").
 */
export async function fetchXstockPrice(symbol: string): Promise<string | null> {
  const res = await fetch(
    `${BASE}/${encodeURIComponent(symbol)}/price-data`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { quote?: number | string };
  const quote = json.quote;
  if (quote === undefined || quote === null) return null;
  const n = typeof quote === "number" ? quote : Number(quote);
  if (!Number.isFinite(n)) return null;
  // token_price_usd is a display/calc value (numeric(20,8)), not a ledger
  // entry, so a JS number is acceptable here — unlike every money movement in
  // this app, which is bigint base units.
  return n.toFixed(8);
}