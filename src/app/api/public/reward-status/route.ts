import { NextResponse } from "next/server";
import { ipAddress } from "@vercel/functions";
import {
  getRewardForHostedPage,
  recordGeoCheck,
} from "@/lib/services/reward-delivery";
import { checkRewardStatusRateLimit, clientIp } from "@/lib/rate-limit";
import {
  detectGeo,
  evaluateGeoGate,
  isProductionDeployment,
} from "@/lib/compliance/geo";
import { formatUsdcUnits } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/reward-status — the HOSTED reward page's read
 * (reward-delivery spec section 4; never called by the notification).
 *
 * Geo is evaluated FRESH on every call against this request's IP and is never
 * cached across calls (spec section 7). A blocked read records the country and
 * advances a per-page-load streak; the terminal 'ineligible' write happens
 * only inside record_geo_check when two DIFFERENT page loads have both been
 * blocked — a single VPN blip must not permanently lock a claim.
 */

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request): Promise<NextResponse> {
  const limit = await checkRewardStatusRateLimit(clientIp(req, ipAddress));
  if (!limit.allowed) {
    return json(
      { error: "Too many requests. Please try again shortly." },
      429,
    );
  }

  const url = new URL(req.url);
  const rewardEventId = (url.searchParams.get("rewardEventId") ?? "").trim();
  // Identifies this page load, so repeated reads within one load do not march
  // the streak forward (a refresh produces a fresh view id).
  const view = (url.searchParams.get("view") ?? "").trim();

  const row = await getRewardForHostedPage(rewardEventId);
  if (!row) return json({ error: "Unknown reward." }, 404);

  // Terminal or in-flight states are reported as-is; nothing is re-evaluated.
  // The amount and asset travel with EVERY state the panel renders text from,
  // because the approved copy names them ("You earned $2.40 of Apple stock...").
  const display = {
    amountUsd: row.reward_usdc_units
      ? formatUsdcUnits(row.reward_usdc_units)
      : null,
    assetTicker: row.asset_ticker,
    assetName: row.asset_display_name,
  };

  if (row.status === "delivered") {
    return json({
      status: "delivered",
      transactionSignature: row.swap_transaction_signature,
      ...display,
    });
  }
  if (row.status === "ineligible") {
    return json({ status: "blocked", ...display });
  }
  if (row.status === "failed") {
    return json({ status: "failed", reason: row.failure_reason, ...display });
  }
  if (row.status === "claiming") {
    return json({ status: "claiming", ...display });
  }

  // Fresh geo check, every single call.
  const detection = detectGeo(req);
  const gate = evaluateGeoGate(detection, isProductionDeployment());
  const blocked = !gate.allowed;

  // Record the read. Same view id => same load => streak does not move.
  if (view) {
    await recordGeoCheck({
      claimId: row.claim_id,
      viewId: view,
      detectedCountryCode: gate.country ?? null,
      blocked,
    });
  }

  if (blocked) {
    return json({ status: "blocked", ...display });
  }

  // needsWallet: true only when no destination is on the row yet — fiat.
  return json({
    status: "ready",
    ...display,
    needsWallet: !row.customer_wallet_address,
  });
}