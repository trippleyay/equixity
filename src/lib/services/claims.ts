import { getServiceClient } from "@/lib/supabase/service";

/**
 * Claim reads (spec sections 5, 6, 7).
 *
 * SERVER-ONLY, service-role: `reward_claims` is RLS-protected with merchant
 * policies only, and the public claim page reads exactly ONE row by its
 * unguessable UUID. That keeps the public surface to a single exact-id lookup
 * (spec section 7: "don't put anything in the URL or response beyond what's
 * needed to display and act on that one claim") instead of exposing an
 * enumerable table to the internet.
 */

export type ClaimView = {
  claim_id: string;
  reward_event_id: string;
  status: "unclaimed" | "claiming" | "delivered" | "failed" | "ineligible";
  claim_method: string | null;
  customer_wallet_address: string | null;
  swap_transaction_signature: string | null;
  failure_reason: string | null;
  detected_country_code: string | null;
  merchant_id: string;
  reward_asset: string;
  reward_amount_units: string | null;
  reward_usdc_units: string | null;
  /** 0 once the claim is no longer 'unclaimed' — one claim per purchase. */
  claimable_balance_units: string;
  merchant_name: string;
  asset_display_name: string | null;
  asset_logo_url: string | null;
  asset_decimals: number | null;
  asset_mint: string | null;
};

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

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One claim, by the UUID that acts as its access control. Returns null when the
 * id is unknown, so the page can 404 rather than leaking whether it ever existed.
 */
export async function getClaimForClaimPage(
  rewardEventId: string,
): Promise<ClaimView | null> {
  if (!UUID_RE.test(rewardEventId)) return null;

  const service = getServiceClient();
  const { data } = await service
    .from("reward_claims")
    .select(
      "id, reward_event_id, status, claim_method, customer_wallet_address, swap_transaction_signature, failure_reason, detected_country_code, " +
        "reward_events(merchant_id, reward_asset, reward_amount_units::text, reward_usdc_units::text, merchants(name), reward_assets(display_name, logo_url, decimals, mint_address))",
    )
    .eq("reward_event_id", rewardEventId)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as {
    id: string;
    reward_event_id: string;
    status: ClaimView["status"];
    claim_method: string | null;
    customer_wallet_address: string | null;
    swap_transaction_signature: string | null;
    failure_reason: string | null;
    detected_country_code: string | null;
    reward_events: EmbeddedEvent | EmbeddedEvent[] | null;
  };

  const event = first(row.reward_events);
  if (!event) return null;
  const asset = first(event.reward_assets);
  const merchant = first(event.merchants);

  return {
    claim_id: row.id,
    reward_event_id: row.reward_event_id,
    status: row.status,
    claim_method: row.claim_method,
    customer_wallet_address: row.customer_wallet_address,
    swap_transaction_signature: row.swap_transaction_signature,
    failure_reason: row.failure_reason,
    detected_country_code: row.detected_country_code,
    merchant_id: event.merchant_id,
    reward_asset: event.reward_asset ?? "",
    reward_amount_units: event.reward_amount_units,
    reward_usdc_units: event.reward_usdc_units,
    // The reward's USDC value is what gets reserved and swapped. Reporting 0
    // once the claim is no longer 'unclaimed' is what makes a claim one-shot.
    claimable_balance_units:
      row.status === "unclaimed" ? (event.reward_usdc_units ?? "0") : "0",
    merchant_name: merchant?.name ?? "this merchant",
    asset_display_name: asset?.display_name ?? null,
    asset_logo_url: asset?.logo_url ?? null,
    asset_decimals: asset?.decimals ?? null,
    asset_mint: asset?.mint_address ?? null,
  };
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
export async function listStaleClaimingClaims(): Promise<
  Array<{ id: string; reward_event_id: string; merchant_id: string; swap_transaction_signature: string | null; reward_usdc_units: string | null }>
> {
  const service = getServiceClient();
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { data } = await service
    .from("reward_claims")
    .select(
      "id, reward_event_id, swap_transaction_signature, updated_at, reward_events(merchant_id, reward_usdc_units::text)",
    )
    .eq("status", "claiming")
    .lt("updated_at", cutoff);
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      reward_event_id: string;
      swap_transaction_signature: string | null;
      reward_events: EmbeddedEvent | EmbeddedEvent[] | null;
    };
    const event = first(row.reward_events);
    return {
      id: row.id,
      reward_event_id: row.reward_event_id,
      merchant_id: event?.merchant_id ?? "",
      swap_transaction_signature: row.swap_transaction_signature,
      reward_usdc_units: event?.reward_usdc_units ?? null,
    };
  });
}