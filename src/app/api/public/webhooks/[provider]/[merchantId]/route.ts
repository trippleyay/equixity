import { NextResponse } from "next/server";
import { getMerchantIdByPublicId } from "@/lib/services/reward-delivery";
import { loadDecryptedWebhookSecret, parseProvider } from "@/lib/services/merchant-webhook-secrets";
import { recordPurchaseAndReward } from "@/lib/services/completion";
import { getPublicMerchantContext } from "@/lib/services/public-merchant";
import {
  verifyFlutterwaveSignature,
  parseFlutterwaveEvent,
  FLUTTERWAVE_SIGNATURE_HEADER,
} from "@/lib/webhooks/flutterwave";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/public/webhooks/[provider]/[merchantId] — fiat Path A, second
 * provider (reward-delivery spec section 5). Same pipeline as the Stripe
 * webhook one directory over: resolve merchant -> verify with THAT merchant's
 * own stored secret -> extract order id, cents and currency from the
 * processor's own event -> recordPurchaseAndReward.
 *
 * Differences from Stripe, all intentional and documented in
 * src/lib/webhooks/flutterwave.ts:
 *   * verification compares the merchant's `verif-hash` header timing-safely;
 *   * amounts arrive in the MAJOR unit and are converted to integer cents;
 *   * non-USD charges are refused, never converted;
 *   * everything that is not a successful charge is acknowledged with 200 so
 *     Flutterwave (which receives an "all events" dashboard subscription)
 *     does not retry transfers, refunds and failed-charge notifications.
 *
 * AUTH MODEL: the merchantId in the path selects the merchant AND their own
 * stored secret, never a shared secret across merchants. Unknown merchant or
 * provider => 404. Bad/missing signature => 400.
 */

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string; merchantId: string }> },
): Promise<NextResponse> {
  const { provider: rawProvider, merchantId } = await ctx.params;
  const provider = parseProvider(rawProvider);
  // parseProvider falls back to "stripe" for unknown names; Stripe has its own
  // static route one directory over, so an unknown provider here is a 404
  // rather than a silent ride on the wrong verifier.
  if (provider !== "flutterwave" || rawProvider !== "flutterwave") {
    return json({ error: "Not found." }, 404);
  }

  // Step 1: resolve the merchant. 404 when unknown (spec section 5 step 1).
  const internalId = await getMerchantIdByPublicId(merchantId);
  if (!internalId) return json({ error: "Not found." }, 404);

  // Step 2: verify with THAT merchant's own secret hash.
  const rawBody = await req.text();
  const { configured, secret } = await loadDecryptedWebhookSecret(
    internalId,
    "flutterwave",
  );
  if (!configured || !secret) {
    return json({ error: "Webhook not configured for this merchant." }, 400);
  }
  if (
    !verifyFlutterwaveSignature({
      secretHash: secret,
      receivedHeader: req.headers.get(FLUTTERWAVE_SIGNATURE_HEADER),
    })
  ) {
    return json({ error: "Signature verification failed." }, 400);
  }

  // Step 3: extract. Irrelevant events (transfers, refunds, failed charges)
  // are acknowledged so Flutterwave does not retry them.
  const parsed = parseFlutterwaveEvent(rawBody);
  if (!parsed.ok) {
    return json({ error: parsed.error }, 400);
  }
  if (!parsed.result.handled) {
    return json({ received: true, ignored: parsed.result.ignoredReason });
  }

  // Spec section 5 step 4: the same verification and reward logic as
  // complete-card, with the same idempotency on (merchant, external order).
  const ctxMerchant = await getPublicMerchantContext(merchantId);
  if (!ctxMerchant) return json({ error: "Not found." }, 404);

  const result = await recordPurchaseAndReward({
    merchantId: internalId,
    settings: ctxMerchant.settings,
    transactionSignature: null,
    externalOrderId: parsed.result.orderId,
    purchaseUsdcUnits: parsed.result.amountCents * 10_000n,
    purchaseCents: parsed.result.amountCents,
    // No wallet is known from a card payment; the customer chooses on the
    // hosted reward page (claim_method stays null until then).
    customerWalletAddress: null,
    backupEmail: parsed.result.email,
  });

  if (!result.ok) {
    // A duplicate delivery of the same tx_ref is a SUCCESS for the sender:
    // answering non-2xx here would make Flutterwave retry the same event.
    if (result.duplicate) {
      return json({ received: true, duplicate: true });
    }
    return json({ error: result.error }, result.httpStatus);
  }

  return json({
    received: true,
    rewardEventId: result.reward_event_id,
    status: result.status,
  });
}
