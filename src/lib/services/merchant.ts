import { PublicKey } from "@solana/web3.js";
import { createHash, randomBytes } from "node:crypto";
import { getServiceClient } from "@/lib/supabase/service";
import { settingsSchema, type SettingsInput } from "@/lib/validation/settings";
import { buildSdkSnippet } from "@/lib/sdk/snippet";
import { listActiveAssets, type RewardAsset } from "@/lib/services/assets";

/**
 * Merchant-scoped service layer. SERVER-ONLY. Every function takes a merchantId
 * resolved server-side from the authenticated session (see
 * lib/auth/require-merchant.ts) — never a client-supplied merchant ID
 * (spec sections 5 & 8).
 */

/** Re-exported so callers get the catalog type from one place. */
export type { RewardAsset };

/**
 * Active reward assets — now the synced, curated catalog (spec section 2)
 * rather than the fixed 3-row `asset_config` table, which the asset-catalog
 * migration replaced. Merchants pick exactly one.
 */
export async function listAssets(): Promise<RewardAsset[]> {
  return listActiveAssets();
}

export type Settings = {
  reward_asset: string;
  reward_bps: number;
  is_enabled: boolean;
  display_name: string;
  decimals: number;
  mint_address: string;
  logo_url: string;
  /** Null until the merchant registers the wallet their checkout pays into. */
  receiving_wallet_address: string | null;
  /** Spec section 6a merchant attestation — gates is_enabled === true. */
  confirmed_customer_eligibility: boolean;
};

export function getSdkSnippet(publicId: string): string {
  return buildSdkSnippet(publicId);
}

export async function getSettings(merchantId: string): Promise<Settings> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("merchant_settings")
    .select(
      "reward_asset, reward_bps, is_enabled, receiving_wallet_address, reward_assets(display_name, decimals, mint_address, logo_url), merchants(confirmed_customer_eligibility)",
    )
    .eq("merchant_id", merchantId)
    .maybeSingle();
  // PostgREST embeds a to-one FK as an object; supabase-js types it as an array,
  // so cast to the actual single-row shape.
  const asset = data
    ? (data.reward_assets as unknown as {
        display_name: string;
        decimals: number;
        mint_address: string;
        logo_url: string;
      })
    : undefined;
  const merchant = data
    ? (data.merchants as unknown as { confirmed_customer_eligibility: boolean })
    : undefined;
  if (error || !data || !asset) {
    throw new Error("Merchant settings not found.");
  }
  return {
    reward_asset: data.reward_asset,
    reward_bps: data.reward_bps,
    is_enabled: data.is_enabled,
    display_name: asset.display_name,
    decimals: asset.decimals,
    mint_address: asset.mint_address,
    logo_url: asset.logo_url,
    receiving_wallet_address: data.receiving_wallet_address ?? null,
    confirmed_customer_eligibility:
      merchant?.confirmed_customer_eligibility ?? false,
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

/** Thrown when a settings update is rejected on its merits (mapped to HTTP 400). */
export class SettingsValidationError extends Error {}

/**
 * Validates a merchant-supplied receiving wallet as a real Solana public key.
 * `new PublicKey(...)` is the authoritative check — it rejects strings that
 * merely look base58 but are the wrong length or not a valid curve point.
 * Empty string clears the field.
 */
function parseReceivingWallet(value: string): string | null {
  if (value === "") return null;
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new SettingsValidationError(
      "Receiving wallet is not a valid Solana address.",
    );
  }
}

export async function updateSettings(
  merchantId: string,
  input: SettingsInput,
): Promise<{ reward_asset: string; reward_bps: number; is_enabled: boolean }> {
  const service = getServiceClient();

  // --- (a) reward_asset must be an ACTIVE asset in the synced catalog ------
  // The FK guarantees the ticker exists; `is_active` is the curation gate, and
  // it has to be checked here because a foreign key cannot express it.
  const { data: asset } = await service
    .from("reward_assets")
    .select("ticker")
    .eq("ticker", input.reward_asset)
    .eq("is_active", true)
    .maybeSingle();
  if (!asset) {
    throw new SettingsValidationError(
      `'${input.reward_asset}' is not an available reward asset.`,
    );
  }

  // --- (b) receiving wallet, validated for real ----------------------------
  const patch: Record<string, unknown> = {
    reward_asset: input.reward_asset,
    reward_bps: input.reward_bps,
    is_enabled: input.is_enabled,
    updated_at: new Date().toISOString(),
  };
  if (
    input.receiving_wallet_address !== undefined &&
    input.receiving_wallet_address !== null
  ) {
    patch.receiving_wallet_address = parseReceivingWallet(
      input.receiving_wallet_address,
    );
  }

  // --- (c) section 6a merchant gate, enforced SERVER-SIDE -----------------
  // Enabling rewards requires the attestation. Ticking the box writes it to
  // `merchants`; enabling rewards reads it back and refuses if absent. A
  // disabled checkbox in the UI is not the control, so neither is a
  // client-supplied `is_enabled: true`.
  if (input.confirmed_customer_eligibility === true) {
    const { error: attestError } = await service
      .from("merchants")
      .update({
        confirmed_customer_eligibility: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", merchantId);
    if (attestError) {
      throw new Error(`Eligibility confirmation rejected: ${attestError.message}`);
    }
  }

  if (input.is_enabled) {
    const { data: merchant } = await service
      .from("merchants")
      .select("confirmed_customer_eligibility")
      .eq("id", merchantId)
      .maybeSingle();
    if (!merchant?.confirmed_customer_eligibility) {
      throw new SettingsValidationError(
        "Rewards cannot be enabled until you confirm that your business does not " +
          "primarily serve customers in the United States, United Kingdom, Canada, " +
          "Australia, or any OFAC-sanctioned jurisdiction.",
      );
    }
    // NOTE: the receiving wallet is deliberately NOT required here. Fiat-only
    // merchants never need one — the gate that matters is per-verification: a
    // Solana completion call without a wallet on record fails at verify time,
    // not at toggle time.
  }

  const { data, error } = await service
    .from("merchant_settings")
    .update(patch)
    .eq("merchant_id", merchantId)
    .select("reward_asset, reward_bps, is_enabled")
    .single();
  if (error) {
    // The DB CHECK constraint is the gate that actually matters; surface it.
    throw new SettingsValidationError(`Settings update rejected: ${error.message}`);
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

export type DepositAccountSigningMaterial = {
  deposit_address: string;
  encrypted_private_key: string;
};

/**
 * SERVER-ONLY. Fetches the merchant's encrypted deposit private key so the
 * withdrawal path can reconstruct the signing keypair. This material is NEVER
 * returned by any API route — the only caller is the server-side withdrawal
 * executor, which decrypts in memory for the duration of one signing call.
 */
export async function getDepositAccountForSigning(
  merchantId: string,
): Promise<DepositAccountSigningMaterial> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("merchant_deposit_accounts")
    .select("deposit_address, encrypted_private_key")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error || !data) throw new Error("No deposit account for this merchant.");
  return {
    deposit_address: data.deposit_address,
    encrypted_private_key: data.encrypted_private_key,
  };
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