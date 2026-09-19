import { getServiceClient } from "@/lib/supabase/service";
import type { CompletionSettings } from "@/lib/services/completion";

/**
 * Public, unauthenticated merchant lookup for the completion endpoints
 * (spec section 4).
 *
 * This is the ONE place a merchant is resolved WITHOUT a session — deliberately,
 * because `/api/public/complete` is called from arbitrary customer checkout
 * pages. It resolves by the PUBLIC id (`merchants.public_id`), which is the
 * snippet-safe identifier that already appears in the merchant's <script> tag;
 * the internal primary key is never exposed or accepted.
 *
 * Every other route in this app resolves the merchant from the authenticated
 * session server-side. This module does not weaken that rule — it is the
 * documented exception the spec calls for, confined to the public path.
 */

export type PublicMerchantContext = {
  merchantId: string;
  publicId: string;
  settings: CompletionSettings;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function getPublicMerchantContext(
  publicId: string,
): Promise<PublicMerchantContext | null> {
  if (!isUuid(publicId)) return null;

  const service = getServiceClient();
  const { data } = await service
    .from("merchants")
    .select(
      "id, public_id, merchant_settings(reward_bps, is_enabled, reward_asset, receiving_wallet_address)",
    )
    .eq("public_id", publicId)
    .maybeSingle();

  if (!data) return null;

  const settings = data.merchant_settings as unknown as
    | CompletionSettings
    | null;
  if (!settings) return null;

  return {
    merchantId: data.id,
    publicId: data.public_id,
    settings: {
      reward_bps: settings.reward_bps,
      is_enabled: settings.is_enabled,
      reward_asset: settings.reward_asset,
      receiving_wallet_address: settings.receiving_wallet_address ?? null,
    },
  };
}