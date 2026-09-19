import { getServiceClient } from "@/lib/supabase/service";

/**
 * Reward-asset catalog reads (spec sections 2, 3, 4).
 *
 * SERVER-ONLY. `reward_assets` has RLS enabled with ZERO policies, so only the
 * service role can read it — every consumer (merchant dashboard table, reward
 * calculation, claim page) goes through this module.
 *
 * Everything here reads the CACHED table, never the upstream APIs at request
 * time; the scheduled sync is what keeps it fresh (spec section 3).
 */

export type AssetType = "xstock" | "prestock";

export type RewardAsset = {
  ticker: string;
  asset_type: AssetType;
  display_name: string;
  mint_address: string;
  decimals: number;
  logo_url: string;
  /** numeric(20,8) transported as text so it never round-trips through a float. */
  token_price_usd: string;
  price_updated_at: string;
};

const ASSET_COLUMNS =
  "ticker, asset_type, display_name, mint_address, decimals, logo_url, token_price_usd::text, price_updated_at";

/** All active assets — the 50 that make up the shipped catalog. */
export async function listActiveAssets(): Promise<RewardAsset[]> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("reward_assets")
    .select(ASSET_COLUMNS)
    .eq("is_active", true)
    .order("asset_type")
    .order("ticker");
  if (error) throw new Error(`Asset catalog read failed: ${error.message}`);
  return (data ?? []) as unknown as RewardAsset[];
}

/**
 * One active asset by ticker. Returns null when the asset is missing OR
 * inactive: the catalog's `is_active` flag is the curation gate, and a
 * non-curated asset must not be selectable as a reward even if the ticker
 * happens to exist in the table.
 */
export async function getActiveAsset(ticker: string): Promise<RewardAsset | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("reward_assets")
    .select(ASSET_COLUMNS)
    .eq("ticker", ticker)
    .eq("is_active", true)
    .maybeSingle();
  return (data as unknown as RewardAsset) ?? null;
}

/** Every active ticker — used to validate merchant asset selection. */
export async function listActiveTickers(): Promise<string[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("reward_assets")
    .select("ticker")
    .eq("is_active", true);
  return (data ?? []).map((r) => r.ticker);
}