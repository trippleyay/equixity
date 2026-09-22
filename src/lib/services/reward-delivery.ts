import { getServiceClient } from "@/lib/supabase/service";
import { cleanDisplayName } from "@/lib/format";
import { first } from "@/lib/services/claims";

/**
 * Reward delivery reads (equixity-reward-delivery-spec.md sections 3, 3a, 4).
 *
 * SERVER-ONLY, service-role: `reward_claims` is RLS-protected with merchant
 * policies only. The public hosted reward page reads exactly ONE row by its
 * unguessable UUID, and the notification's existence check reads one event by
 * the (merchant public id, external order id) pair. Neither exposes an
 * enumerable table to the internet (spec section 7).
 *
 * This module replaces the old claim-page reader: the delivery flow now lives
 * on /reward/[rewardEventId], a page under Equixity's own domain.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HostedRewardView = {
  claim_id: string;
  reward_event_id: string;
  status: "unclaimed" | "claiming" | "delivered" | "failed" | "ineligible";
  claim_method: string | null;
  customer_wallet_address: string | null;
  swap_transaction_signature: string | null;
  failure_reason: string | null;
  merchant_name: string;
  reward_asset: string;
  reward_amount_units: string | null;
  reward_usdc_units: string | null;
  asset_display_name: string | null;
  asset_ticker: string | null;
  asset_logo_url: string | null;
  asset_decimals: number | null;
};

/** One reward, by the UUID that acts as its access control. Null when unknown. */
export async function getRewardForHostedPage(
  rewardEventId: string,
): Promise<HostedRewardView | null> {
  if (!UUID_RE.test(rewardEventId)) return null;

  const service = getServiceClient();
  const { data } = await service
    .from("reward_claims")
    .select(
      "id, reward_event_id, status, claim_method, customer_wallet_address, " +
        "swap_transaction_signature, failure_reason, " +
        "reward_events(merchant_id, reward_asset, reward_amount_units::text, reward_usdc_units::text, merchants(name), reward_assets(display_name, ticker, decimals, logo_url))",
    )
    .eq("reward_event_id", rewardEventId)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as {
    id: string;
    reward_event_id: string;
    status: HostedRewardView["status"];
    claim_method: string | null;
    customer_wallet_address: string | null;
    swap_transaction_signature: string | null;
    failure_reason: string | null;
    reward_events:
      | {
          merchant_id: string;
          reward_asset: string | null;
          reward_amount_units: string | null;
          reward_usdc_units: string | null;
          merchants: { name: string } | Array<{ name: string }> | null;
          reward_assets:
            | {
                display_name: string;
                ticker?: string;
                decimals?: number;
                logo_url?: string;
              }
            | Array<{
                display_name: string;
                ticker?: string;
                decimals?: number;
                logo_url?: string;
              }>
            | null;
        }
      | Array<never>
      | null;
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
    merchant_name: merchant?.name ?? "",
    reward_asset: event.reward_asset ?? "",
    reward_amount_units: event.reward_amount_units ?? null,
    reward_usdc_units: event.reward_usdc_units ?? null,
    asset_display_name: asset
      ? cleanDisplayName(asset.display_name, asset.ticker ?? "")
      : null,
    asset_ticker: asset?.ticker ?? event.reward_asset,
    asset_logo_url: asset?.logo_url ?? null,
    asset_decimals: asset?.decimals ?? null,
  };
}

export type RewardExistsResult =
  | { exists: false }
  | {
      exists: true;
      rewardEventId: string;
      amountUsd: string;
      assetTicker: string;
      assetName: string;
    };

/**
 * Existence ONLY (spec section 4): does a claimable reward exist for this
 * (merchant, external order) pair yet. Never evaluates eligibility, never
 * touches any status column — the notification's poll asks nothing else.
 */
export async function findClaimableByOrderId(
  merchantId: string,
  externalOrderId: string,
): Promise<RewardExistsResult> {
  return findClaimable(merchantId, "external_order_id", externalOrderId);
}

/**
 * The crypto equivalent: the same question, asked with the payment's
 * transaction signature instead of an order id (spec sections 3, 4). That
 * signature is what the reward was recorded against on the on-chain path, and
 * it is public chain data. Existence only, exactly as above — this never
 * verifies the payment itself; verification stays in /api/public/complete.
 */
export async function findClaimableBySignature(
  merchantId: string,
  transactionSignature: string,
): Promise<RewardExistsResult> {
  return findClaimable(merchantId, "transaction_signature", transactionSignature);
}

/** One implementation for both paths, so they cannot drift apart. */
async function findClaimable(
  merchantId: string,
  column: "external_order_id" | "transaction_signature",
  value: string,
): Promise<RewardExistsResult> {
  const service = getServiceClient();
  const { data } = await service
    .from("reward_events")
    .select(
      "id, status, reward_usdc_units::text, merchants!inner(public_id), reward_assets(display_name, ticker, decimals, logo_url)",
    )
    .eq("merchants.public_id", merchantId)
    .eq(column, value)
    .maybeSingle();

  if (!data) return { exists: false };
  const row = data as unknown as {
    id: string;
    status: string;
    reward_usdc_units: string | null;
    reward_assets:
      | { display_name: string; ticker?: string }
      | Array<{ display_name: string; ticker?: string }>
      | null;
  };

  // Only a still-unclaimed reward is worth notifying about; terminal or
  // non-claimable states exist but there is nothing left to do.
  if (row.status !== "pending") return { exists: false };

  const asset = first(row.reward_assets);
  return {
    exists: true,
    rewardEventId: row.id,
    amountUsd: row.reward_usdc_units ?? "",
    assetTicker: asset?.ticker ?? "",
    assetName: asset
      ? cleanDisplayName(asset.display_name, asset.ticker ?? "")
      : "",
  };
}

/**
 * Resolves the internal merchant id from the PUBLIC id that appears in the
 * webhook URL path. Returns null when the public id is not a real merchant.
 */
export async function getMerchantIdByPublicId(
  publicId: string,
): Promise<string | null> {
  if (!UUID_RE.test(publicId)) return null;
  const service = getServiceClient();
  const { data } = await service
    .from("merchants")
    .select("id")
    .eq("public_id", publicId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Records one geo read against a claim (spec section 4 step 2). The terminal
 * write, if any, happens inside the RPC, never here — this is bookkeeping.
 */
export async function recordGeoCheck(params: {
  claimId: string;
  viewId: string;
  detectedCountryCode: string | null;
  blocked: boolean;
}): Promise<number> {
  const service = getServiceClient();
  // Untyped client, like every other RPC call in this codebase: the signature
  // matches record_geo_check(uuid, text, text, boolean).
  const { data, error } = await service.rpc("record_geo_check", {
    p_claim_id: params.claimId,
    p_view_id: params.viewId,
    p_detected_country_code: params.detectedCountryCode,
    p_blocked: params.blocked,
  });
  if (error) throw new Error(`Geo check record failed: ${error.message}`);
  return typeof data === "number" ? data : -1;
}