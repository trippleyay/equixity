import { NextResponse } from "next/server";
import { ipAddress } from "@vercel/functions";
import {
  findClaimableByOrderId,
  findClaimableBySignature,
} from "@/lib/services/reward-delivery";
import { checkRewardExistsRateLimit, clientIp } from "@/lib/rate-limit";
import { formatUsdcUnits } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/reward-exists — the notification's ONLY data source
 * (reward-delivery spec section 4).
 *
 * The success page says which purchase it belongs to in exactly ONE way, and
 * this endpoint accepts exactly one of the two, matching the snippet attribute:
 *   * `externalOrderId`      — fiat (Stripe session id, or the order id their
 *                              own backend posted);
 *   * `transactionSignature` — crypto (the Solana payment's signature).
 *
 * Existence only: does a still-claimable reward exist for this (merchant, that
 * purchase) pair yet. It NEVER evaluates eligibility, NEVER reads or writes any
 * status, and never runs the geo check — eligibility is decided entirely on the
 * hosted reward page. This is what lets the notification stay a dumb poll that
 * cannot leak compliance state onto a merchant's site.
 *
 * PUBLIC and cross-origin by design: it is polled from the merchant's own
 * success page, so CORS is open with no credentials, same as /complete.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function corsJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request): Promise<NextResponse> {
  const limit = await checkRewardExistsRateLimit(clientIp(req, ipAddress));
  if (!limit.allowed) {
    return corsJson(
      { error: "Too many requests. Please try again shortly." },
      429,
    );
  }

  const url = new URL(req.url);
  const merchantId = (url.searchParams.get("merchantId") ?? "").trim();
  const externalOrderId = (url.searchParams.get("externalOrderId") ?? "").trim();
  const transactionSignature = (
    url.searchParams.get("transactionSignature") ?? ""
  ).trim();

  if (!merchantId) {
    return corsJson({ error: "merchantId is required." }, 400);
  }
  // Exactly one purchase reference, matching the single snippet attribute the
  // page used. Both at once would be ambiguous, and neither is unanswerable.
  if (Boolean(externalOrderId) === Boolean(transactionSignature)) {
    return corsJson(
      { error: "Provide exactly one of externalOrderId or transactionSignature." },
      400,
    );
  }
  // The merchant id in the snippet is the public UUID; anything else can
  // never match, so do not spend a lookup on it.
  if (!UUID_RE.test(merchantId)) {
    return corsJson({ error: "Unknown merchant." }, 404);
  }

  const result = externalOrderId
    ? await findClaimableByOrderId(merchantId, externalOrderId)
    : await findClaimableBySignature(merchantId, transactionSignature);
  if (!result.exists) {
    // The webhook has not landed yet, or the reward is no longer claimable.
    // Either way the notification simply does not appear.
    return corsJson({ exists: false });
  }

  return corsJson({
    exists: true,
    rewardEventId: result.rewardEventId,
    amountUsd: result.amountUsd
      ? formatUsdcUnits(result.amountUsd)
      : null,
    assetTicker: result.assetTicker || null,
    assetName: result.assetName || null,
  });
}