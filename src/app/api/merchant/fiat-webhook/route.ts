import { requireMerchant } from "@/lib/auth/require-merchant";
import { jsonError, jsonOk, withApi } from "@/lib/http";
import {
  getWebhookSecretStatus,
  saveWebhookSecret,
  markWebhookSetupComplete,
  clearWebhookSecret,
  parseProvider,
  type WebhookProvider,
} from "@/lib/services/merchant-webhook-secrets";

/**
 * POST /api/merchant/fiat-webhook — Path A setup (reward-delivery spec 5),
 * for each hosted payment webhook: Stripe today, Flutterwave alongside it.
 *
 * GET  -> whether a signing secret is configured, plus whether the merchant has
 *         pressed Done (never the secret itself).
 * POST -> save or replace the signing secret from the processor's dashboard
 *         (encrypted at rest; only its presence is ever reported), or mark the
 *         setup finished with {"complete": true} when the merchant presses Done.
 * DELETE -> clear it (merchant rotating or leaving Path A).
 *
 * The secret shape depends on the provider: Stripe generates `whsec_...`,
 * Flutterwave has the merchant invent their own secret hash (any non-empty
 * string, 6 to 40 characters by their convention). Validation below matches
 * what each processor will actually send us in the signature header.
 */

/** Flutterwave's secret hash is merchant-chosen; only obviously-empty values are rejected. */
function validateSecret(
  provider: WebhookProvider,
  secret: string,
): string | null {
  if (provider === "stripe") {
    if (!secret.startsWith("whsec_")) {
      return "That does not look like a Stripe signing secret. Copy the value that starts with whsec_ from the webhook endpoint page in Stripe.";
    }
    return null;
  }
  // flutterwave
  if (secret.length < 6 || secret.length > 200) {
    return "Choose a secret hash between 6 and 200 characters, and paste the exact same value into the webhook section of your Flutterwave dashboard.";
  }
  return null;
}

export async function GET(req: Request) {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    const provider = parseProvider(
      new URL(req.url).searchParams.get("provider"),
    );
    const status = await getWebhookSecretStatus(merchant.id, provider);
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
    const parsed = body as {
      webhookSecret?: unknown;
      provider?: unknown;
      complete?: unknown;
    };
    const provider = parseProvider(parsed?.provider);

    // Done in the setup guide: record the finish, and refuse if there is nothing
    // stored to finish. The tabs read "Set up" off this, never off the save.
    if (parsed?.complete === true) {
      const status = await markWebhookSetupComplete(merchant.id, provider);
      if (!status) {
        return jsonError(
          provider === "stripe"
            ? "No Stripe signing secret is saved yet. Paste the secret Stripe showed you, then try again."
            : "No Flutterwave secret hash is saved yet. Paste the hash into Flutterwave, then try again.",
          400,
        );
      }
      return jsonOk(status);
    }

    const secret = parsed?.webhookSecret;
    if (typeof secret !== "string" || secret.trim() === "") {
      return jsonError("A signing secret is required.", 400);
    }
    const invalid = validateSecret(provider, secret.trim());
    if (invalid) return jsonError(invalid, 400);
    await saveWebhookSecret(merchant.id, secret.trim(), provider);
    const status = await getWebhookSecretStatus(merchant.id, provider);
    return jsonOk(status);
  });
}

export async function DELETE(req: Request) {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    const provider = parseProvider(
      new URL(req.url).searchParams.get("provider"),
    );
    await clearWebhookSecret(merchant.id, provider);
    return jsonOk({ configured: false, updatedAt: null });
  });
}
