import { NextResponse } from "next/server";
import { getClaimForClaimPage } from "@/lib/services/claims";
import { recordClaimPageCountry, detectGeo } from "@/lib/compliance/eligibility";

export const dynamic = "force-dynamic";

/**
 * POST /api/public/claim-view — record the geo-check result on a claim page LOAD.
 *
 * WHY A SEPARATE, HARMLESS ENDPOINT: section 6a calls for the check on every page
 * load, but `ineligible` is a TERMINAL status. If a page load set it, merely
 * viewing the page from a restricted country — or through a stray VPN blip or a
 * flaky corporate proxy — would permanently kill that claim, including for a
 * later legitimate attempt from an allowed country.
 *
 * So the page load only RECORDS the detected country (spec section 6a point 5:
 * "record what was actually checked"), and the actual gate runs on claim submit
 * in /api/public/claim with a fresh re-check. This still satisfies section 7's
 * "re-checks the shopper side fresh on every claim".
 *
 * Deliberately read-only with respect to claim status: it never marks anything
 * ineligible, so it is safe to call from a page view.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rewardEventId =
    typeof (body as { rewardEventId?: unknown })?.rewardEventId === "string"
      ? ((body as { rewardEventId: string }).rewardEventId || "").trim()
      : "";

  if (!UUID_RE.test(rewardEventId)) {
    return NextResponse.json(
      { error: "Unknown reward." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const claim = await getClaimForClaimPage(rewardEventId);
  if (!claim) {
    return NextResponse.json(
      { error: "Unknown reward." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Record only. No status change, no money involved.
  await recordClaimPageCountry(claim.claim_id, req);

  const detection = detectGeo(req);
  return NextResponse.json(
    { detectedCountryCode: detection.country },
    { headers: { "Cache-Control": "no-store" } },
  );
}