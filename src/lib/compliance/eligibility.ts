import { PublicKey } from "@solana/web3.js";
import { getServiceClient } from "@/lib/supabase/service";
import { getActiveAsset } from "@/lib/services/assets";
import { isRestrictedCountry, restrictedCountryMessage } from "@/lib/compliance/restricted-countries";
import {
  isSanctionedWallet,
  SANCTIONED_WALLET_REASON,
} from "@/lib/compliance/sanctioned-addresses";
import { evaluateGeoGate, detectGeo } from "@/lib/compliance/geo";

/**
 * Section 6a — the eligibility gate. Section 6 must NEVER run until this passes,
 * and it runs on EVERY claim, not just a merchant's or customer's first one.
 *
 * Two layers, both mandatory:
 *   1. country   — from Vercel geolocation, checked against a config deny list;
 *   2. wallet    — static sanctioned-address screening.
 * plus the shopper's own attestation, which the caller supplies.
 *
 * The `ineligible` status is a TERMINAL state distinct from `failed`: one is a
 * compliance block, the other a technical failure. Conflating them would
 * corrupt reporting and any future audit, so they are never merged anywhere in
 * the code or the data.
 *
 * SEQUENCING (reward-delivery spec section 4 step 2): the hosted reward page's
 * status reads record the detected country and a blocked streak, but the
 * TERMINAL 'ineligible' is persisted only after two independently confirmed
 * blocked reads on DIFFERENT page loads (a refresh re-checks; a repeat inside
 * one load does not). A single VPN blip must never permanently poison a
 * legitimate claim — and since 'ineligible' is terminal, "permanently" is
 * literal. The confirm call ALWAYS re-checks geo fresh at the moment of
 * delivery, whatever the status read said.
 */

export type EligibilityInput = {
  claimId: string;
  customerWalletAddress: string;
  /** The shopper's explicit attestation checkbox (spec section 6a point 3). */
  attestationAccepted: boolean;
  request: Request;
};

export type EligibilityResult =
  | { eligible: true; country: string | null; unknownCountry: boolean }
  | { eligible: false; country: string | null; reason: string };

export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const detection = detectGeo(input.request);
  const geo = evaluateGeoGate(detection, process.env.VERCEL_ENV === "production");

  if (!geo.allowed) {
    return { eligible: false, country: geo.country, reason: geo.reason };
  }

  // Wallet must be a real base58 public key before it goes any further.
  try {
    new PublicKey(input.customerWalletAddress);
  } catch {
    return {
      eligible: false,
      country: geo.country,
      reason: "That is not a valid Solana wallet address.",
    };
  }

  // Layer 2: static sanctioned-address screening (spec section 6a point 6).
  if (isSanctionedWallet(input.customerWalletAddress)) {
    return { eligible: false, country: geo.country, reason: SANCTIONED_WALLET_REASON };
  }

  // The attestation is required, and required EVERY time (spec section 7).
  if (!input.attestationAccepted) {
    return {
      eligible: false,
      country: geo.country,
      reason:
        "You must confirm the attestation before this reward can be delivered.",
    };
  }

  return {
    eligible: true,
    country: geo.country,
    unknownCountry: geo.unknownCountry,
  };
}

/** Marks a claim ineligible — terminal, and touches no balance at all. */
export async function markClaimIneligible(
  claimId: string,
  country: string | null,
  reason: string,
): Promise<void> {
  const service = getServiceClient();
  await service.rpc("mark_claim_ineligible", {
    p_claim_id: claimId,
    p_detected_country_code: country,
    p_reason: reason,
  });
}

/** True when a country code is on the deny list (used for page-load display). */
export { isRestrictedCountry, restrictedCountryMessage };

/** Country detection, re-exported so route handlers import from one place. */
export { detectGeo };

/**
 * Resolves the reward asset attached to a claim, for the display on the claim
 * page. Reads the cached catalog only — never an upstream API at request time.
 */
export async function getClaimAssetForDisplay(ticker: string) {
  return getActiveAsset(ticker);
}