import { requireMerchant } from "@/lib/auth/require-merchant";
import { jsonError, jsonOk, withApi } from "@/lib/http";
import {
  getWebhookSecretStatus,
  saveWebhookSecret,
  clearWebhookSecret,
} from "@/lib/services/stripe-webhook-secret";

/**
 * POST /api/merchant/fiat-webhook — Path A setup (reward-delivery spec 5).
 *
 * GET  -> whether a signing secret is configured (never the secret itself).
 * POST -> save or replace the signing secret from the merchant's Stripe
 *         dashboard. Encrypted at rest; only its presence is ever reported.
 * DELETE -> clear it (merchant rotating or leaving Path A).
 */
export async function GET() {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    const status = await getWebhookSecretStatus(merchant.id);
    return jsonOk(status);
  });
}

export async function POST(req: Request) {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }
    const secret = (body as { webhookSecret?: unknown })?.webhookSecret;
    if (typeof secret !== "string" || secret.trim() === "") {
      return jsonError("A Stripe signing secret is required.", 400);
    }
    if (!secret.startsWith("whsec_")) {
      return jsonError(
        "That does not look like a Stripe signing secret. Copy the value that starts with whsec_ from the webhook endpoint page in Stripe.",
        400,
      );
    }
    await saveWebhookSecret(merchant.id, secret.trim());
    const status = await getWebhookSecretStatus(merchant.id);
    return jsonOk(status);
  });
}

export async function DELETE() {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    await clearWebhookSecret(merchant.id);
    return jsonOk({ configured: false, updatedAt: null });
  });
}
