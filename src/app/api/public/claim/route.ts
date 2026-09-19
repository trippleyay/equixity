import { NextResponse } from "next/server";
import { ipAddress } from "@vercel/functions";
import { getClaimForClaimPage } from "@/lib/services/claims";
import { evaluateEligibility, markClaimIneligible } from "@/lib/compliance/eligibility";
import { executeRewardClaim, ClaimNotExecutableError } from "@/lib/solana/reward-swap";
import { checkClaimRateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/public/claim — act on one claim (spec sections 5, 6, 6a).
 *
 * PUBLIC by design (no Equixity account, spec section 5). Access control is the
 * unguessable claim UUID, exactly as section 7 specifies. The response never
 * contains more than is needed to act on THIS claim — no merchant internals, no
 * other claims, no session data.
 *
 * ORDERING IS THE POINT OF THIS ROUTE: section 6a runs FIRST and section 6 runs
 * only if it passes. That ordering is enforced here, at the single entry point
 * that can trigger a swap, so it cannot be bypassed by any other caller.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extra },
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  // Rate limit: this endpoint moves real money, so it is not left open (the
  // funding-sync gap was acceptable only because it could just READ chain data).
  const limit = await checkClaimRateLimit(clientIp(req, ipAddress));
  if (!limit.allowed) {
    return json(
      { error: "Too many requests. Please try again shortly." },
      429,
      limit.retryAfterSeconds
        ? { "Retry-After": String(limit.retryAfterSeconds) }
        : {},
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const raw = body as {
    rewardEventId?: unknown;
    customerWalletAddress?: unknown;
    claimMethod?: unknown;
    attestationAccepted?: unknown;
  };

  const rewardEventId =
    typeof raw?.rewardEventId === "string" ? raw.rewardEventId.trim() : "";
  const customerWalletAddress =
    typeof raw?.customerWalletAddress === "string"
      ? raw.customerWalletAddress.trim()
      : "";
  const claimMethod =
    raw?.claimMethod === "privy_embedded" ? "privy_embedded" : "wallet_connect";
  const attestationAccepted = raw?.attestationAccepted === true;

  if (!UUID_RE.test(rewardEventId)) {
    return json({ error: "Unknown reward." }, 404);
  }
  if (!customerWalletAddress) {
    return json({ error: "A wallet address is required to receive the reward." }, 400);
  }

  const claim = await getClaimForClaimPage(rewardEventId);
  if (!claim) return json({ error: "Unknown reward." }, 404);

  // Already in a terminal state? Report it rather than re-running anything.
  if (claim.status !== "unclaimed") {
    return json(
      {
        status: claim.status,
        reason:
          claim.status === "ineligible"
            ? claim.failure_reason
            : claim.status === "delivered"
              ? "This reward has already been delivered."
              : claim.failure_reason,
      },
      409,
    );
  }

  // ---- SECTION 6a GATE: must pass before section 6 is allowed to run -------
  const gate = evaluateEligibility({
    claimId: claim.claim_id,
    customerWalletAddress,
    attestationAccepted,
    request: req,
  });

  if (!gate.eligible) {
    // Recorded, not silently dropped (spec section 9). `ineligible` is terminal
    // and distinct from `failed`, and it touches no balance at all.
    await markClaimIneligible(claim.claim_id, gate.country, gate.reason);
    return json({ status: "ineligible", reason: gate.reason }, 403);
  }

  // ---- SECTION 6: swap execution, reached only after the gate passed -------
  try {
    const outcome = await executeRewardClaim({
      claimId: claim.claim_id,
      customerWalletAddress,
      claimMethod,
      detectedCountryCode: gate.country,
    });

    const status = outcome.status === "delivered" ? 200 : outcome.status === "claiming" ? 202 : 422;
    return json(
      {
        status: outcome.status,
        transactionSignature: outcome.signature,
        reason: outcome.reason,
      },
      status,
    );
  } catch (e) {
    if (e instanceof ClaimNotExecutableError) {
      return json({ error: e.message }, 409);
    }
    console.error("Claim execution error:", e);
    return json(
      {
        error:
          "We could not complete this claim right now. No reward was lost — it can be retried.",
      },
      500,
    );
  }
}