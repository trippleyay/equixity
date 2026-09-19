import { geolocation } from "@vercel/functions";
import { isRestrictedCountry, restrictedCountryMessage } from "./restricted-countries";

/**
 * Visitor country detection for the section 6a shopper-side gate.
 *
 * VERIFIED against current Vercel docs (not assumed):
 *   * `@vercel/functions` exposes `geolocation(request)`, returning
 *     `{ city, country, latitude, longitude, region }` — each a string or
 *     undefined. Its `country` is the same value as the raw header below.
 *   * The raw headers are `x-vercel-ip-country` (ISO 3166-1 alpha-2),
 *     `x-vercel-ip-country-region` (ISO 3166-2), `x-vercel-ip-city`.
 *   * Documented caveats that directly shape this module: the headers are NOT
 *     set when testing locally, and geolocation "does not work if you're using
 *     a proxy in front of your deployment" (Trusted Proxy is Enterprise-only).
 *
 * Because of those caveats the country can legitimately be UNKNOWN, and what to
 * do then is a real decision rather than an edge case:
 *   * production  -> unknown country FAILS CLOSED (we cannot verify, so we do
 *                    not distribute a restricted asset);
 *   * anywhere else -> unknown country is allowed but still recorded, so local
 *                    development and previews remain testable.
 * This is the confirmed policy decision for this build.
 */

export type GeoDetection = {
  country: string | null;
  source: "geolocation" | "header" | "none";
};

/** True only for the real production deployment (Vercel's own signal). */
export function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function detectGeo(request: Request): GeoDetection {
  const headerCountry = request.headers.get("x-vercel-ip-country");
  if (headerCountry && headerCountry.trim() !== "") {
    return { country: headerCountry.trim().toUpperCase(), source: "header" };
  }

  // Fall back to the helper in case only it can see the value in some runtime.
  try {
    const geo = geolocation(request as Parameters<typeof geolocation>[0]);
    const c = geo?.country;
    if (c && String(c).trim() !== "") {
      return { country: String(c).trim().toUpperCase(), source: "geolocation" };
    }
  } catch {
    // Helper unavailable (e.g. outside the Vercel runtime) — treated as unknown.
  }

  return { country: null, source: "none" };
}

export type GeoGateResult =
  | { allowed: true; country: string | null; unknownCountry: boolean }
  | { allowed: false; country: string | null; reason: string };

/**
 * Evaluate the country layer of the 6a gate.
 *
 * Pure function of the detection + the deny list + whether this is production,
 * so the whole policy is testable without a live request or a deployment.
 */
export function evaluateGeoGate(
  detection: GeoDetection,
  isProduction: boolean,
): GeoGateResult {
  const { country } = detection;

  if (country === null) {
    if (isProduction) {
      return {
        allowed: false,
        country: null,
        reason:
          "We could not determine your location, so this restricted reward cannot be issued. " +
          "Please disable any VPN or proxy and try again.",
      };
    }
    // Non-production: allow but record, so local/preview stays testable.
    return { allowed: true, country: null, unknownCountry: true };
  }

  if (isRestrictedCountry(country)) {
    return {
      allowed: false,
      country,
      reason: restrictedCountryMessage(country),
    };
  }

  return { allowed: true, country, unknownCountry: false };
}