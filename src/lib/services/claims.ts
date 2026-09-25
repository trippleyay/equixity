import { getServiceClient } from "@/lib/supabase/service";

/**
 * Claim reads for the DELIVERY path (spec sections 5, 6, 7).
 *
 * SERVER-ONLY, service-role: `reward_claims` is RLS-protected with merchant
 * policies only, so every read here is an exact-id lookup with the service
 * client and no table is ever enumerable from the internet.
 *
 * The customer-facing read (one reward, by its unguessable UUID, for the hosted
 * reward page) lives in services/reward-delivery.ts — the old claim-page reader
 * that used to be here was deleted along with /claim/[rewardEventId].
 */

type EmbeddedAsset = {
  display_name: string;
  logo_url: string;
  decimals: number;
  mint_address: string;
};

type EmbeddedEvent = {
  merchant_id: string;
  reward_asset: string | null;
  reward_amount_units: string | null;
  reward_usdc_units: string | null;
  merchants: { name: string } | Array<{ name: string }> | null;
  reward_assets: EmbeddedAsset | EmbeddedAsset[] | null;
};

export function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type ClaimableRewardForExecution = {
  claim_id: string;
  merchant_id: string;
  reward_usdc_units: bigint;
  reward_amount_units: bigint;
  asset_mint: string;
  asset_decimals: number;
};

/** Loads exactly what the swap executor needs, or null if not claimable. */
export async function getClaimForExecution(
  claimId: string,
): Promise<ClaimableRewardForExecution | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("reward_claims")
    .select(
      "id, reward_events(merchant_id, reward_usdc_units::text, reward_amount_units::text, reward_assets(mint_address, decimals))",
    )
    .eq("id", claimId)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    reward_events: EmbeddedEvent | EmbeddedEvent[] | null;
  };
  const event = first(row.reward_events);
  if (!event) return null;

  const asset = first(event.reward_assets);
  if (!asset) return null;
  if (!event.reward_usdc_units || !event.reward_amount_units) return null;

  return {
    claim_id: row.id,
    merchant_id: event.merchant_id,
    reward_usdc_units: BigInt(event.reward_usdc_units),
    reward_amount_units: BigInt(event.reward_amount_units),
    asset_mint: asset.mint_address,
    asset_decimals: asset.decimals,
  };
}

export type MerchantClaimRow = {
  id: string;
  reward_event_id: string;
  status: string;
  customer_wallet_address: string | null;
  swap_transaction_signature: string | null;
  failure_reason: string | null;
  created_at: string;
};

/** Claims belonging to one merchant — dashboard reward activity (spec section 8). */
export async function listClaimsForMerchant(
  merchantId: string,
): Promise<MerchantClaimRow[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("reward_claims")
    .select(
      "id, reward_event_id, status, customer_wallet_address, swap_transaction_signature, failure_reason, created_at, reward_events!inner(merchant_id)",
    )
    .eq("reward_events.merchant_id", merchantId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as MerchantClaimRow[];
}

/** Claims stuck mid-flight, for poll-on-view reconciliation (spec section 6.8). */
export type StaleClaimRow = {
  id: string;
  reward_event_id: string;
  merchant_id: string;
  swap_transaction_signature: string | null;
  reward_usdc_units: string | null;
  reward_amount_units: string | null;
  asset_mint: string | null;
  asset_decimals: number | null;
  customer_wallet_address: string | null;
  updated_at: string;
};

/**
 * Everything reconciliation needs to FINISH a delivery, not just judge it.
 *
 * The first version pulled only the signature and the amount, which was enough
 * to mark a row delivered but not enough to actually deliver anything. Observed
 * live: a row sat in 'claiming' while the asset had in fact reached the
 * customer, and the only thing the reconciler could have done with that row was
 * claim an outcome it had not verified. The mint, the decimals and the customer's
 * address are here so the delivery leg can be re-run safely instead.
 */
export async function listStaleClaimingClaims(): Promise<StaleClaimRow[]> {
  const service = getServiceClient();
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { data } = await service
    .from("reward_claims")
    .select(
      "id, reward_event_id, swap_transaction_signature, customer_wallet_address, updated_at, reward_events(merchant_id, reward_usdc_units::text, reward_amount_units::text, reward_assets(mint_address, decimals))",
    )
    .eq("status", "claiming")
    .lt("updated_at", cutoff);
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      reward_event_id: string;
      swap_transaction_signature: string | null;
      customer_wallet_address: string | null;
      updated_at: string;
      reward_events: EmbeddedEvent | EmbeddedEvent[] | null;
    };
    const event = first(row.reward_events);
    const asset = event ? first(event.reward_assets) : null;
    return {
      id: row.id,
      reward_event_id: row.reward_event_id,
      merchant_id: event?.merchant_id ?? "",
      swap_transaction_signature: row.swap_transaction_signature,
      reward_usdc_units: event?.reward_usdc_units ?? null,
      reward_amount_units: event?.reward_amount_units ?? null,
      asset_mint: asset?.mint_address ?? null,
      asset_decimals: asset?.decimals ?? null,
      customer_wallet_address: row.customer_wallet_address ?? null,
      updated_at: row.updated_at,
    };
  });
}