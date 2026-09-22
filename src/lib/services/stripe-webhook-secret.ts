import { getServiceClient } from "@/lib/supabase/service";
import { encryptPayload, decryptPayload } from "@/lib/crypto/deposit-keys";

/**
 * Path A per-merchant Stripe signing secrets (reward-delivery spec section 5).
 *
 * SERVER-ONLY. Each merchant's webhook secret is independent (never shared),
 * encrypted at rest with AES-256-GCM using the same key material as the
 * deposit private keys, and treated with the same care (spec section 7).
 * The ciphertext lives in `merchant_stripe_webhooks`, a table with RLS ENABLED
 * AND ZERO POLICIES, exactly like merchant_deposit_accounts. That is
 * deliberate: a column-level REVOKE cannot carve a hole out of Supabase's
 * table-level GRANT to the authenticated role, so a merchant's own session
 * could still have read the column via PostgREST. With no policy at all, only
 * the service role can touch the table.
 *
 * The plaintext is returned ONLY to the webhook signature verifier, and is
 * never included in any API response.
 */

const TABLE = "merchant_stripe_webhooks";

export type StoredWebhookSecret = {
  configured: boolean;
  updatedAt: string | null;
};

export async function getWebhookSecretStatus(
  merchantId: string,
): Promise<StoredWebhookSecret> {
  const service = getServiceClient();
  const { data } = await service
    .from(TABLE)
    .select("webhook_secret, updated_at")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  return {
    // Presence only — the ciphertext itself never leaves this module.
    configured: Boolean(data?.webhook_secret),
    updatedAt: data?.updated_at ?? null,
  };
}

/**
 * Reads AND decrypts the secret. Also reports whether it is set, so a route
 * can 400 before doing any body work when Path A was never configured.
 */
export async function loadDecryptedWebhookSecret(
  merchantId: string,
): Promise<{ configured: boolean; secret: string | null }> {
  const service = getServiceClient();
  const { data } = await service
    .from(TABLE)
    .select("webhook_secret")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  const ciphertext = data?.webhook_secret ?? null;
  if (!ciphertext) return { configured: false, secret: null };
  try {
    return { configured: true, secret: decryptPayload(ciphertext) };
  } catch (e) {
    // A wrong/rotated DEPOSIT_KEY_ENCRYPTION_SECRET must read as "not
    // configured" rather than crashing the webhook with a 500.
    console.error("Stripe webhook secret decryption failed:", (e as Error).message);
    return { configured: false, secret: null };
  }
}

export async function saveWebhookSecret(
  merchantId: string,
  plaintextSecret: string,
): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from(TABLE)
    .upsert(
      {
        merchant_id: merchantId,
        webhook_secret: encryptPayload(plaintextSecret),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "merchant_id" },
    );
  if (error) throw new Error(`Could not save the webhook secret: ${error.message}`);
}

export async function clearWebhookSecret(merchantId: string): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from(TABLE)
    .delete()
    .eq("merchant_id", merchantId);
  if (error) throw new Error(`Could not clear the webhook secret: ${error.message}`);
}