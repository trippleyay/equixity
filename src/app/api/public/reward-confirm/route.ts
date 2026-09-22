import { NextResponse } from "next/server";
import { ipAddress } from "@vercel/functions";
import { PublicKey } from "@solana/web3.js";
import {
  getRewardForHostedPage,
  recordGeoCheck,
} from "@/lib/services/reward-delivery";
import {
  detectGeo,
  evaluateGeoGate,
  isProductionDeployment,
} from "@/lib/compliance/geo";
import { executeRewardClaim, ClaimNotExecutableError } from "@/lib/solana/reward-swap";
import { checkRewardConfirmRateLimit, clientIp } from "@/lib/rate-limit";
import { validateRewardConfirm } from "@/lib/validation/reward-confirm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/public/reward-confirm — trigger delivery from the hosted reward
 * page (reward-delivery spec section 4; replaces the old claim-page route).
 *
 * PUBLIC by design; access control is the unguessable reward UUID. ORDERING IS
 * THE POINT: the fresh geo check runs FIRST and delivery runs only if it
 * passes, whatever an earlier status read on this page said.
 *
 * Crypto claims deliver to the wallet already on the row ('same_wallet', the
 * one that paid) — no wallet entry, ever. Fiat claims carry a customer-chosen
 * address, validated server-side as a real public key before anything moves.
 */

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const limit = await checkRewardConfirmRateLimit(clientIp(req, ipAddress));
  if (!limit.allowed) {
    return json(
      { error: "Too many requests. Please try again shortly." },
      429,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const validated = validateRewardConfirm(body);
  if (!validated.ok) {
    return json({ error: validated.issues.join("; ") }, 400);
  }
  const { rewardEventId, walletAddress, claimMethod, attestationAccepted, view } =
    validated.value;

  const row = await getRewardForHostedPage(rewardEventId);
  if (!row) return json({ error: "Unknown reward." }, 404);

  // Already in a terminal state? Report it rather than re-running anything.
  if (row.status !== "unclaimed") {
    return json(
      {
        status: row.status,
        reason:
          row.status === "delivered"
            ? "This reward has already been delivered."
            : row.status === "ineligible"
              ? row.failure_reason
              : row.failure_reason,
      },
      409,
    );
  }

  // ---- FRESH GEO GATE: must pass before delivery is allowed ----------------
  const detection = detectGeo(req);
  const gate = evaluateGeoGate(detection, isProductionDeployment());
  if (!gate.allowed) {
    // Recorded as a blocked read (same page load => the streak holds), never
    // persisted as terminal from a single submit.
    await recordGeoCheck({
      claimId: row.claim_id,
      viewId: view,
      detectedCountryCode: gate.country ?? null,
      blocked: true,
    });
    return json({ status: "blocked", reason: gate.reason }, 403);
  }

  // ---- Resolve the destination wallet --------------------------------------
  let customerWalletAddress: string;
  let resolvedClaimMethod: "same_wallet" | "pasted_address" | "privy_embedded";

  if (row.customer_wallet_address) {
    // Crypto: the paying wallet is already on the row. A client-sent address
    // is refused — the destination is not the browser's to choose.
    if (walletAddress) {
      return json(
        {
          error:
            "This reward is already set to arrive in the wallet that made the payment.",
        },
        400,
      );
    }
    customerWalletAddress = row.customer_wallet_address;
    resolvedClaimMethod = "same_wallet";
  } else {
    // Fiat: an address is required, and it must be a real Solana public key
    // (the authoritative check, same as the withdrawal destination).
    if (!walletAddress) {
      return json(
        { error: "A wallet address is required to receive this reward." },
        400,
      );
    }
    try {
      customerWalletAddress = new PublicKey(walletAddress).toBase58();
    } catch {
      return json(
        { error: "That is not a valid Solana wallet address." },
        400,
      );
    }
    // Fiat: two options and only two. A pasted address (validated here as a
    // real Solana wallet address, the same authoritative check as the
    // withdrawal destination) or the Privy-resolved address. No wallet connect.
    resolvedClaimMethod = claimMethod ?? "pasted_address";
  }

  // The attestation is required on every confirm.
  if (!attestationAccepted) {
    return json(
      { error: "You must confirm the attestation before the reward can be delivered." },
      403,
    );
  }

  // ---- Delivery: the same swap machinery as before, unchanged ---------------
  try {
    const outcome = await executeRewardClaim({
      claimId: row.claim_id,
      customerWalletAddress,
      claimMethod: resolvedClaimMethod,
      detectedCountryCode: gate.country,
    });

    const status =
      outcome.status === "delivered" ? 200 : outcome.status === "claiming" ? 202 : 422;
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
    console.error("Reward confirm execution error:", e);
    return json(
      {
        error:
          "We could not complete this claim right now. No reward was lost — it can be retried.",
      },
      500,
    );
  }
}