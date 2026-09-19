import { listActiveAssets } from "@/lib/services/assets";
import type { AssetRow } from "@/components/AssetTable";

/**
 * Catalog rows shaped for the shared AssetTable (spec section 1).
 *
 * Both the claim page and the merchant Rewards view use this, so the table has a
 * single source of shape. Reads the cached table only.
 */
export async function getRecentClaimAssets(): Promise<AssetRow[]> {
  const assets = await listActiveAssets();
  return assets.map((a) => ({
    ticker: a.ticker,
    asset_type: a.asset_type,
    display_name: a.display_name,
    logo_url: a.logo_url,
    token_price_usd: a.token_price_usd,
  }));
}