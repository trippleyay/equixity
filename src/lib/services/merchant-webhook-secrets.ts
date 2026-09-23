import { getServiceClient } from "@/lib/supabase/service";
import { encryptPayload, decryptPayload } from "@/lib/crypto/deposit-keys";

/**
 * Per-merchant, per-provider payment webhook secrets (reward-delivery spec
 * section 5), for the Equixity-hosted webhooks: Stripe today, Flutterwave
 * alongside it.
 *
 * SERVER-ONLY. Each merchant's secret is independent (never shared), encrypted
 * at rest with AES-256-GCM using the same key material as the deposit private
 * keys, and treated with the same care (spec section 7). The ciphertext lives
 * in `merchant_webhook_secrets`, a table with RLS ENABLED AND ZERO POLICIES,
 * exactly like merchant_deposit_accounts. That is deliberate: a column-level
 * REVOKE cannot carve a hole out of Supabase's table-level GRANT to the
 * authenticated role, so a merchant's own session could still have read the
 * column via PostgREST. With no policy at all, only the service role can touch
 * the table.
 *
 * The plaintext is returned ONLY to the webhook signature verifier, and is
 * never included in any API response.
 */

const TABLE = "merchant_webhook_secrets";

export type WebhookProvider = "stripe" | "flutterwave";

export type StoredWebhookSecret = {
  configured: boolean;
  updatedAt: string | null;
};

function isProvider(value: string): value is WebhookProvider {
  return value === "stripe" || value === "flutterwave";
}

/** Accepts only the two providers we host webhooks for; defaults to Stripe. */
export function parseProvider(value: unknown): WebhookProvider {
  if (typeof value === "string" && isProvider(value)) return value;
  return "stripe";
}

export async function getWebhookSecretStatus(
  merchantId: string,
  provider: WebhookProvider = "stripe",
): Promise<StoredWebhookSecret> {
  const service = getServiceClient();
  const { data } = await service
    .from(TABLE)
    .select("webhook_secret, updated_at")
    .eq("merchant_id", merchantId)
    .eq("provider", provider)
    .maybeSingle();
  return {
    // Presence only, the ciphertext itself never leaves this module.
    configured: Boolean(data?.webhook_secret),
    updatedAt: data?.updated_at ?? null,
  };
}

/**
 * Reads AND decrypts the secret. Also reports whether it is set, so a route
 * can 400 before doing any body work when the webhook was never configured.
 */
export async function loadDecryptedWebhookSecret(
  merchantId: string,
  provider: WebhookProvider = "stripe",
): Promise<{ configured: boolean; secret: string | null }> {
  const service = getServiceClient();
  const { data } = await service
    .from(TABLE)
    .select("webhook_secret")
    .eq("merchant_id", merchantId)
    .eq("provider", provider)
    .maybeSingle();

  const ciphertext = data?.webhook_secret ?? null;
  if (!ciphertext) return { configured: false, secret: null };
  try {
    return { configured: true, secret: decryptPayload(ciphertext) };
  } catch (e) {
    // A wrong/rotated DEPOSIT_KEY_ENCRYPTION_SECRET must read as "not
    // configured" rather than crashing the webhook with a 500.
    console.error(
      `${provider} webhook secret decryption failed:`,
      (e as Error).message,
    );
    return { configured: false, secret: null };
  }
}

export async function saveWebhookSecret(
  merchantId: string,
  plaintextSecret: string,
  provider: WebhookProvider = "stripe",
): Promise<void> {
  const service = getServiceClient();
  const { error } = await service.from(TABLE).upsert(
    {
      merchant_id: merchantId,
      provider,
      webhook_secret: encryptPayload(plaintextSecret),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "merchant_id,provider" },
  );
  if (error) throw new Error(`Could not save the webhook secret: ${error.message}`);
}

export async function clearWebhookSecret(
  merchantId: string,
  provider: WebhookProvider = "stripe",
): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from(TABLE)
    .delete()
    .eq("merchant_id", merchantId)
    .eq("provider", provider);
  if (error) throw new Error(`Could not clear the webhook secret: ${error.message}`);
}
