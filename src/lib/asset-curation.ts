/**
 * Curated reward-asset catalog (spec section 3).
 *
 * Plain config, not a migration — swapping a ticker in or out is a one-line
 * edit here, deliberately.
 *
 * IMPORTANT — ticker conventions, verified against the live APIs:
 *   * These entries are the UNDERLYING plain tickers ('AAPL'). The xStocks API
 *     returns `symbol: 'AAPLx'` alongside `underlyingSymbol: 'AAPL'`, so this
 *     list is matched against `underlyingSymbol`.
 *   * What gets STORED in `reward_assets.ticker` is the upstream API's own
 *     `symbol` string ('AAPLx'), which is what the three rows already live in
 *     the database use. Storing the API's own value avoids a needless
 *     convention change for no benefit.
 *   * PreStocks are not curated at all (section 3: "whatever they list is what
 *     shows"), so none of their symbols appear here.
 *
 * Two substitutions were made against the spec's original 42, because
 * verification against the live catalog showed those two do not exist:
 *   COST (Costco, no xStock exists) -> PLTR (Palantir)
 *   SHOP (Shopify, no xStock exists) -> SBUX (Starbucks)
 * Every entry below was confirmed present in the live 928-asset response with
 * a Solana deployment.
 */
export const CURATED_XSTOCK_TICKERS: readonly string[] = [
  // Spec order, with the two substitutions in place:
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'NFLX', 'AMD', 'INTC',
  'AVGO', 'ORCL', 'CRM', 'ADBE', 'PYPL', 'COIN', 'MSTR', 'DIS', 'NKE', 'MCD',
  'KO', 'PEP', 'WMT', 'PLTR', 'HD', 'JPM', 'BAC', 'V', 'MA', 'PFE',
  'JNJ', 'UNH', 'XOM', 'CVX', 'BA', 'CAT', 'GE', 'IBM', 'UBER', 'ABNB',
  'SBUX', 'SPY',
];

/** Fast membership test for the curation step in the sync. */
const CURATED_SET = new Set(CURATED_XSTOCK_TICKERS);

export function isCuratedXstock(underlyingSymbol: string): boolean {
  return CURATED_SET.has(underlyingSymbol);
}

/**
 * Display-facing ticker: stored `ticker` for xStocks ('AAPLx') -> 'AAPLx' shown
 * as-is; PreStocks are already unsuffixed. Kept as a function so the display
 * rule lives in exactly one place if it ever changes.
 */
export function displayTicker(ticker: string): string {
  return ticker;
}