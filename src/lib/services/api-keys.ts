import { createHash, randomBytes } from "node:crypto";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * Merchant API keys for the traditional-processor path (spec section 4a).
 *
 * A 256-bit random secret, so a FAST hash is the right choice — this is not a
 * low-entropy human password, and a bcrypt-style slow hash would only add
 * per-request latency for no security gain (spec section 4a says exactly this).
 *
 * The plaintext key is returned ONCE at generation, is never persisted, and is
 * never retrievable again. Only the SHA-256 hash and the last four characters
 * are stored.
 */

const KEY_PREFIX = "eqx_";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export type GeneratedApiKey = {
  /** Full plaintext key — shown to the merchant once, then never again. */
  apiKey: string;
  lastFour: string;
};

/**
 * Generate (or regenerate) a merchant's API key. There is deliberately no
 * dual-key grace period: the old key stops working the moment this returns
 * (spec section 4a).
 */
export async function generateApiKey(merchantId: string): Promise<GeneratedApiKey> {
  const service = getServiceClient();
  const apiKey = `${KEY_PREFIX}${randomBytes(32).toString("hex")}`;
  const lastFour = apiKey.slice(-4);

  const { error } = await service
    .from("merchants")
    .update({
      api_key_hash: hashApiKey(apiKey),
      api_key_last_four: lastFour,
      updated_at: new Date().toISOString(),
    })
    .eq("id", merchantId);
  if (error) throw new Error(`Could not generate API key: ${error.message}`);

  return { apiKey, lastFour };
}

/** Dashboard display state: whether a key exists, and only its last four. */
export async function getApiKeyStatus(
  merchantId: string,
): Promise<{ has_key: boolean; last_four: string | null }> {
  const service = getServiceClient();
  const { data } = await service
    .from("merchants")
    .select("api_key_hash, api_key_last_four")
    .eq("id", merchantId)
    .maybeSingle();
  return {
    has_key: Boolean(data?.api_key_hash),
    last_four: data?.api_key_last_four ?? null,
  };
}

/**
 * Resolve a merchant from a presented bearer key.
 *
 * Returns null for anything that does not match — the caller must respond 401,
 * never 404, so the response does not reveal whether a key was merely
 * malformed vs simply not found (spec section 4a).
 */
export async function resolveMerchantByApiKey(
  rawKey: string,
): Promise<{ id: string; public_id: string } | null> {
  if (!rawKey) return null;
  const service = getServiceClient();
  const { data } = await service
    .from("merchants")
    .select("id, public_id")
    .eq("api_key_hash", hashApiKey(rawKey))
    .maybeSingle();
  return data ?? null;
}