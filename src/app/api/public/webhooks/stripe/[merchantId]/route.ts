import { NextResponse } from "next/server";
import { getMerchantIdByPublicId } from "@/lib/services/reward-delivery";
import { loadDecryptedWebhookSecret } from "@/lib/services/stripe-webhook-secret";
import { recordPurchaseAndReward } from "@/lib/services/completion";
import { getPublicMerchantContext } from "@/lib/services/public-merchant";
import { verifyStripeSignature } from "@/lib/solana/stripe-signature";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/public/webhooks/stripe/[merchantId] — fiat Path A
 * (reward-delivery spec section 5): the Equixity-hosted webhook, usable by a
 * merchant with zero developer.
 *
 * AUTH MODEL: the merchantId in the path selects the merchant AND their own
 * stored signing secret — never a shared secret across merchants. Unknown
 * merchant => 404. Bad/missing signature => 400, verified with a timing-safe
 * compare over the RAW body (never the reparsed JSON).
 *
 * On checkout.session.completed: the amount is read from Stripe's own event
 * (amount_total, cents), the session id becomes the idempotency key, and an
 * optional customer email lands in backup_email for the future backup notice.
 * A receiving wallet is NOT required on this path (spec section 5: Stripe's
 * own webhook is the proof of purchase; that check does not apply).
 */

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

type StripeEvent = {
  type?: string;
  data?: {
    object?: {
      id?: string;
      amount_total?: number;
      currency?: string;
      customer_details?: { email?: string | null } | null;
      payment_status?: string;
    };
  };
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ merchantId: string }> },
): Promise<NextResponse> {
  const { merchantId } = await ctx.params;

  // Step 1: resolve the merchant. 404 when unknown (spec section 5 step 1).
  const internalId = await getMerchantIdByPublicId(merchantId);
  if (!internalId) return json({ error: "Not found." }, 404);

  // Step 2: verify with THAT merchant's own secret. The raw body is read as
  // text BEFORE any parsing so the HMAC covers exactly what Stripe signed.
  const rawBody = await req.text();
  const { configured, secret } = await loadDecryptedWebhookSecret(internalId);
  if (!configured || !secret) {
    // Path A was never set up (or the secret was cleared): nothing can be
    // verified, so the event is refused rather than trusted.
    return json({ error: "Webhook not configured for this merchant." }, 400);
  }
  const signature = verifyStripeSignature({
    signatureHeader: req.headers.get("stripe-signature"),
    rawBody,
    secret,
  });
  if (!signature.ok) {
    return json({ error: "Signature verification failed." }, 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (event.type !== "checkout.session.completed") {
    // Acknowledge everything else so Stripe does not retry it.
    return json({ received: true, ignored: event.type ?? null });
  }

  const session = event.data?.object;
  const externalOrderId =
    typeof session?.id === "string" ? session.id.trim() : "";
  const amountTotalCents =
    typeof session?.amount_total === "number" ? session.amount_total : null;

  // amount_total is in the currency's SMALLEST unit, and the reward is priced in
  // USDC. Treating a zero-decimal currency (JPY, KRW) as cents would multiply
  // the purchase 100x, so anything that is not USD is refused rather than
  // guessed at.
  const currency = (session?.currency ?? "").toLowerCase();
  if (currency !== "usd") {
    return json(
      {
        error:
          "Only USD checkout sessions can create a reward (amount_total would not be in cents).",
      },
      400,
    );
  }

  if (!externalOrderId || amountTotalCents === null || amountTotalCents < 0) {
    return json({ error: "Event is missing a session id or amount." }, 400);
  }

  // Spec section 5 step 4: the same verification and reward logic as
  // complete-card, with the same idempotency on (merchant, external order).
  const ctxMerchant = await getPublicMerchantContext(merchantId);
  if (!ctxMerchant) return json({ error: "Not found." }, 404);

  const result = await recordPurchaseAndReward({
    merchantId: internalId,
    settings: ctxMerchant.settings,
    transactionSignature: null,
    externalOrderId,
    purchaseUsdcUnits: BigInt(Math.round(amountTotalCents)) * 10_000n,
    purchaseCents: BigInt(Math.round(amountTotalCents)),
    // No wallet is known from a card payment; the customer chooses on the
    // hosted reward page (claim_method stays null until then).
    customerWalletAddress: null,
    backupEmail: session?.customer_details?.email ?? null,
  });

  if (!result.ok) {
    // A duplicate delivery of the same session is a SUCCESS for the sender:
    // answering non-2xx here would make Stripe retry the same event for days.
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