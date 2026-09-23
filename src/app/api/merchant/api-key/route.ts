import { requireMerchant } from "@/lib/auth/require-merchant";
import {
  generateApiKey,
  getApiKeyStatus,
  deleteApiKey,
} from "@/lib/services/api-keys";
import { jsonOk, withApi } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Merchant API key management (spec section 4a).
 *
 * SERVER-RESOLVED MERCHANT, as with every dashboard route: the merchant comes
 * from the authenticated session, never from the request body.
 *
 * GET    -> whether a key exists, and only its last four characters.
 * POST   -> generate (or regenerate) a key, returning the plaintext EXACTLY ONCE.
 *           There is deliberately no dual-key grace period: the previous key stops
 *           working immediately.
 * DELETE -> revoke the key (one key max per merchant in this build). The key
 *           stops authenticating the moment this commits.
 *
 * The plaintext key is never stored and never retrievable again — only its
 * SHA-256 hash and last four characters are persisted.
 */

export async function GET() {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    const status = await getApiKeyStatus(merchant.id);
    return jsonOk(status);
  });
}

export async function POST() {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    const generated = await generateApiKey(merchant.id);
    return jsonOk({
      api_key: generated.apiKey,
      last_four: generated.lastFour,
      created_at: new Date().toISOString(),
      // Stated explicitly so the UI can warn honestly rather than implying the
      // key can be looked up again later.
      message:
        "Copy this key now. It will not be shown again. Only the last four characters are stored.",
    });
  });
}

export async function DELETE() {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    await deleteApiKey(merchant.id);
    return jsonOk({ deleted: true });
  });
}