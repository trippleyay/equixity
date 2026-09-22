import { NextResponse } from "next/server";
import { ipAddress } from "@vercel/functions";
import { getPublicMerchantContext } from "@/lib/services/public-merchant";
import { recordPurchaseAndReward } from "@/lib/services/completion";
import { verifyUsdcPurchaseToMerchant } from "@/lib/solana/verify-purchase";
import {
  checkCompleteIpLimit,
  checkCompleteMerchantLimit,
  clientIp,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/public/complete — the `Equixity.complete()` backend (spec section 4).
 *
 * PUBLIC AND UNAUTHENTICATED BY NECESSITY: it is called from arbitrary customer
 * checkout pages, so there is no session to resolve anything from. That is why
 * this route (a) resolves the merchant by PUBLIC id, (b) never reads a purchase
 * amount from the request body — the body carries only a signature — and
 * (c) is rate-limited per IP and per merchant.
 *
 * CORS is deliberately wide-open (`*`) with no credentials: the endpoint is
 * cross-origin by design, and it carries no cookies or session, so widening the
 * origin cannot leak another caller's data.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function corsJson(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...extraHeaders },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "Invalid JSON body." }, 400);
  }

  const raw = body as { merchantId?: unknown; transactionSignature?: unknown };
  const publicId =
    typeof raw?.merchantId === "string" ? raw.merchantId.trim() : "";
  const transactionSignature =
    typeof raw?.transactionSignature === "string"
      ? raw.transactionSignature.trim()
      : "";

  if (!publicId || !transactionSignature) {
    return corsJson(
      { error: "merchantId and transactionSignature are required." },
      400,
    );
  }

  // Per-IP limit FIRST, before any lookup work.
  const ipLimit = await checkCompleteIpLimit(clientIp(req, ipAddress));
  if (!ipLimit.allowed) {
    return corsJson({ error: TOO_MANY }, 429, retryHeader(ipLimit.retryAfterSeconds));
  }

  // Step 1: look up the merchant. 404 when unknown (spec section 4 step 1).
  const ctx = await getPublicMerchantContext(publicId);
  if (!ctx) {
    return corsJson({ error: "Unknown merchant." }, 404);
  }

  const merchantLimit = await checkCompleteMerchantLimit(ctx.merchantId);
  if (!merchantLimit.allowed) {
    return corsJson(
      { error: TOO_MANY },
      429,
      retryHeader(merchantLimit.retryAfterSeconds),
    );
  }

  // Step 2: the merchant must have finished setup (spec section 4 step 2).
  if (!ctx.settings.receiving_wallet_address) {
    return corsJson(
      {
        error:
          "This merchant has not registered a receiving wallet yet, so purchases cannot be verified.",
      },
      409,
    );
  }

  // Steps 4-5: verify the transaction on-chain and read the amount FROM IT.
  // The request body's amount, if any, is never consulted.
  const verification = await verifyUsdcPurchaseToMerchant({
    transactionSignature,
    receivingWalletAddress: ctx.settings.receiving_wallet_address,
  });
  if (!verification.ok) {
    return corsJson({ error: verification.reason }, 422);
  }

  // Steps 3, 6-9: idempotency, reward computation, recording, claim reference.
  const result = await recordPurchaseAndReward({
    merchantId: ctx.merchantId,
    settings: ctx.settings,
    transactionSignature,
    externalOrderId: null,
    purchaseUsdcUnits: verification.amountUsdcUnits,
    purchaseCents: null,
    // The wallet that paid IS the destination (reward-delivery spec section
    // 2: crypto delivers to the same wallet, no customer entry anywhere).
    customerWalletAddress: verification.payingWallet,
  });

  if (!result.ok) {
    return corsJson({ error: result.error }, result.httpStatus);
  }

  // What the SDK shows (spec section 4 step 9). The SDK itself calculates
  // nothing. rewardEventId links to the hosted reward page.
  return corsJson({
    rewardEventId: result.reward_event_id,
    status: result.status,
    rewardAsset: result.reward_asset,
    assetName: result.asset_name,
    rewardAmount: result.reward_asset_ui_amount,
    rewardUsdcValue: result.reward_usdc_ui_value,
  });
}

const TOO_MANY = "Too many requests. Please try again shortly.";

function retryHeader(seconds?: number): Record<string, string> {
  return seconds ? { "Retry-After": String(seconds) } : {};
}