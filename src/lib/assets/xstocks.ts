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
/** Per-request ceilings so a slow upstream can never blow the function cap. */
const PAGE_TIMEOUT_MS = 10_000;
const PRICE_TIMEOUT_MS = 6_000;
/** Catalog pages are independent — fetched in chunks, not one-by-one. */
const PAGE_CHUNK = 5;

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

async function fetchPage(page: number): Promise<{
  nodes: XstockNode[];
  hasNextPage: boolean;
}> {
  const res = await fetch(`${BASE}?pageSize=${PAGE_SIZE}&page=${page}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`xStocks catalog page ${page} failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    nodes?: XstockNode[];
    page?: { hasNextPage?: boolean };
  };
  const nodes = json.nodes ?? [];

  // Trap 1: an empty page means the request shape was rejected — NOT that
  // there are no assets. Refuse to treat it as an empty catalog.
  if (nodes.length === 0) {
    throw new Error(
      `xStocks catalog page ${page} returned 0 nodes (unexpected; refusing to treat as an empty catalog).`,
    );
  }
  return { nodes, hasNextPage: json.page?.hasNextPage === true };
}

function toAssets(nodes: XstockNode[], out: XstockAsset[]): void {
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
}

export async function fetchXstockCatalog(): Promise<XstockAsset[]> {
  const out: XstockAsset[] = [];

  // Chunked parallel pagination: pages are independent GETs by offset, so we
  // fetch PAGE_CHUNK at a time and stop once the highest fetched page reports
  // no next page. A sequential loop costs ~10 x 3s against this API (~30s of
  // the function's 60s budget); chunking costs ~ceil(pages/chunk) x 3s.
  let firstUnfetched = 0;
  while (firstUnfetched < MAX_PAGES) {
    const chunkIndexes: number[] = [];
    for (let i = 0; i < PAGE_CHUNK && firstUnfetched + i < MAX_PAGES; i++) {
      chunkIndexes.push(firstUnfetched + i);
    }
    const pages = await Promise.all(chunkIndexes.map((p) => fetchPage(p)));
    firstUnfetched += chunkIndexes.length;

    for (const page of pages) toAssets(page.nodes, out);

    // Stop when the HIGHEST fetched page says the catalog is exhausted.
    if (!pages[pages.length - 1].hasNextPage) break;
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
    {
      cache: "no-store",
      // This endpoint has been observed at ~21s per call when the upstream is
      // degraded. A hard 6s ceiling keeps the whole price phase inside the
      // function budget; a timed-out price just keeps the previous value and
      // is retried on the next sync tick.
      signal: AbortSignal.timeout(PRICE_TIMEOUT_MS),
    },
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