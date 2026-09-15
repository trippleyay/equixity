import { getServiceClient } from "@/lib/supabase/service";
import { settingsSchema, type SettingsInput } from "@/lib/validation/settings";
import { buildSdkSnippet } from "@/lib/sdk/snippet";

/**
 * Merchant-scoped service layer. SERVER-ONLY. Every function takes a merchantId
 * resolved server-side from the authenticated session (see
 * lib/auth/require-merchant.ts) — never a client-supplied merchant ID
 * (spec sections 5 & 8).
 */

export type AssetOption = {
  ticker: string;
  display_name: string;
  decimals: number;
};

/** The fixed asset_config catalog — merchants pick exactly one (spec section 2). */
export async function listAssets(): Promise<AssetOption[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("asset_config")
    .select("ticker, display_name, decimals")
    .order("ticker");
  return data ?? [];
}

export type Settings = {
  reward_asset: string;
  reward_bps: number;
  display_name: string;
  decimals: number;
};

export function getSdkSnippet(publicId: string): string {
  return buildSdkSnippet(publicId);
}

export async function getSettings(merchantId: string): Promise<Settings> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("merchant_settings")
    .select(
      "reward_asset, reward_bps, asset_config(display_name, decimals, mint_address)",
    )
    .eq("merchant_id", merchantId)
    .maybeSingle();
  // PostgREST embeds a to-one FK as an object; supabase-js types it as an array,
  // so cast to the actual single-row shape.
  const assetConfig = data
    ? (data.asset_config as unknown as {
        display_name: string;
        decimals: number;
        mint_address: string;
      })
    : undefined;
  if (error || !data || !assetConfig) {
    throw new Error("Merchant settings not found.");
  }
  return {
    reward_asset: data.reward_asset,
    reward_bps: data.reward_bps,
    display_name: assetConfig.display_name,
    decimals: assetConfig.decimals,
  };
}

export function validateSettings(body: unknown):
  | { ok: true; value: SettingsInput }
  | { ok: false; issues: string[] } {
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => i.message) };
  }
  return { ok: true, value: parsed.data };
}

export async function updateSettings(
  merchantId: string,
  input: SettingsInput,
): Promise<{ reward_asset: string; reward_bps: number }> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("merchant_settings")
    .update({
      reward_asset: input.reward_asset,
      reward_bps: input.reward_bps,
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_id", merchantId)
    .select("reward_asset, reward_bps")
    .single();
  if (error) {
    // The DB CHECK constraint is the gate that actually matters; surface it.
    throw new Error(`Settings update rejected: ${error.message}`);
  }
  return data;
}

export async function getBalance(merchantId: string): Promise<string> {
  const service = getServiceClient();
  // ::text keeps the bigint exact across JSON (avoids PostgREST JS-number casts).
  const { data } = await service
    .from("merchant_balances")
    .select("available_usdc_units::text")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  return data?.available_usdc_units ?? "0";
}

export async function getDepositAddress(merchantId: string): Promise<string> {
  const service = getServiceClient();
  // Selects deposit_address and NEVER encrypted_private_key (spec section 8).
  const { data, error } = await service
    .from("merchant_deposit_accounts")
    .select("deposit_address")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error || !data) throw new Error("No deposit account for this merchant.");
  return data.deposit_address;
}

export type RewardEventRow = {
  id: string;
  event_type: string;
  transaction_signature: string | null;
  purchase_amount_cents: string | null;
  reward_asset: string | null;
  reward_amount_units: string | null;
  status: string;
  created_at: string;
};

/** List this merchant's reward_events. Empty by construction in this build. */
export async function listRewards(
  merchantId: string,
): Promise<RewardEventRow[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("reward_events")
    .select(
      "id, event_type, transaction_signature, purchase_amount_cents::text, reward_asset, reward_amount_units::text, status, created_at",
    )
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id,
    event_type: r.event_type,
    transaction_signature: r.transaction_signature,
    purchase_amount_cents: r.purchase_amount_cents,
    reward_asset: r.reward_asset,
    reward_amount_units: r.reward_amount_units,
    status: r.status,
    created_at: r.created_at,
  }));
}

/** Aggregate "total rewards issued" from reward_events (spec section 7). */
export async function totalRewardsIssued(merchantId: string): Promise<{
  count: number;
  reward_amount_units: string;
}> {
  const service = getServiceClient();
  const { data: totalsRaw } = await service
    .rpc("total_rewards_issued", { p_merchant_id: merchantId })
    .maybeSingle();
  const totals = totalsRaw as { count: number; reward_amount_units: string } | null;
  if (!totals) return { count: 0, reward_amount_units: "0" };
  return {
    count: Number(totals.count ?? 0),
    reward_amount_units: totals.reward_amount_units ?? "0",
  };
}