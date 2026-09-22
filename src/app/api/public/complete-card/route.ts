import { NextResponse } from "next/server";
import { resolveMerchantByApiKey, hashApiKey } from "@/lib/services/api-keys";
import { getPublicMerchantContext } from "@/lib/services/public-merchant";
import { recordPurchaseAndReward } from "@/lib/services/completion";
import { checkCardRateLimit } from "@/lib/rate-limit";
import { parseUsdcToUnits } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/public/complete-card — the traditional-processor path
 * (spec section 4a), which is the actual headline path for real merchants.
 *
 * AUTHENTICATION: `Authorization: Bearer <api_key>`. The API key IS the
 * merchant identity — there is no merchantId in the body — and the key is
 * looked up by HASH. An unrecognized or missing key returns 401, never 404, so
 * the response cannot be used to distinguish "wrong format" from "no such key".
 *
 * THE SECURITY TRADEOFF, stated plainly (spec section 4a): there is no on-chain
 * amount to read independently here, so this path trusts the merchant's own
 * backend's reported amount. That bound is acceptable rather than a hole — a
 * merchant abusing it only spends their own already-funded USDC reward balance,
 * never anyone else's.
 *
 * CORS is not opened here: this endpoint is server-to-server, called by the
 * merchant's backend, never by a browser on a customer's checkout page.
 */

const TOO_MANY = "Too many requests. Please try again shortly.";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

export async function POST(req: Request): Promise<NextResponse> {
  // --- Step 1: resolve the merchant from the API key. 401 if no match. ------
  const token = bearerToken(req);
  if (!token) {
    return json({ error: "Missing API key." }, 401);
  }

  // Per-API-key rate limit (spec section 4a: rate-limit per API key). Keyed on
  // the HASH so the raw secret never lands in Redis as an identifier.
  const limit = await checkCardRateLimit(hashApiKey(token));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: TOO_MANY },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          ...(limit.retryAfterSeconds
            ? { "Retry-After": String(limit.retryAfterSeconds) }
            : {}),
        },
      },
    );
  }

  const merchant = await resolveMerchantByApiKey(token);
  if (!merchant) {
    return json({ error: "Invalid API key." }, 401);
  }

  // --- Body ---------------------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const raw = body as {
    purchaseAmountUsd?: unknown;
    externalOrderId?: unknown;
  };

  const externalOrderId =
    typeof raw?.externalOrderId === "string" ? raw.externalOrderId.trim() : "";
  if (!externalOrderId) {
    return json({ error: "externalOrderId is required." }, 400);
  }

  // The reported amount is a USD figure from the merchant's own checkout. It is
  // converted to USDC base units with integer math only, then stored in the
  // cents column — this path never touches purchase_amount_usdc_units.
  let purchaseCents: bigint;
  let purchaseUsdcUnits: bigint;
  try {
    purchaseUsdcUnits = parseUsdcToUnits(
      typeof raw?.purchaseAmountUsd === "number"
        ? raw.purchaseAmountUsd.toFixed(6)
        : String(raw?.purchaseAmountUsd ?? ""),
    );
    purchaseCents = purchaseUsdcUnits / 10_000n; // 1 cent = 10_000 USDC base units
  } catch {
    return json(
      { error: "purchaseAmountUsd must be a positive number." },
      400,
    );
  }

  // --- Steps 2-4: same setup, idempotency and reward logic as section 4 ----
  const ctx = await getPublicMerchantContext(merchant.public_id);
  if (!ctx) {
    return json({ error: "Unknown merchant." }, 404);
  }

  const result = await recordPurchaseAndReward({
    merchantId: ctx.merchantId,
    settings: ctx.settings,
    transactionSignature: null,
    externalOrderId,
    purchaseUsdcUnits,
    purchaseCents,
    // Fiat: no wallet is known here — the customer chooses on the hosted
    // reward page. backup_email stays null in Path B (the merchant's own
    // backend never hands us one).
    customerWalletAddress: null,
    backupEmail: null,
  });

  if (!result.ok) {
    return json({ error: result.error }, result.httpStatus);
  }

  return json({
    rewardEventId: result.reward_event_id,
    status: result.status,
    rewardAsset: result.reward_asset,
    assetName: result.asset_name,
    rewardAmount: result.reward_asset_ui_amount,
    rewardUsdcValue: result.reward_usdc_ui_value,
  });
}