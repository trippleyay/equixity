/**
 * Restricted jurisdictions for the section 6a eligibility gate.
 *
 * Plain config, not a migration — this is a compliance list that may need to
 * change without a schema change (spec section 6a point 2).
 *
 * Codes are ISO 3166-1 alpha-2, matching the format of Vercel's
 * `x-vercel-ip-country` header (verified against current Vercel docs; the
 * `geolocation()` helper returns the same value as `country`).
 *
 * THE LIST BELOW IS A DRAFT, NOT A LEGAL DETERMINATION — exactly as the spec
 * states. It blends the four markets named explicitly for xStocks/PreStocks
 * restrictions with the standing OFAC-sanctioned jurisdictions. It should be
 * reviewed before this is relied on in production.
 */
export const RESTRICTED_COUNTRY_CODES: readonly string[] = [
  // Named explicitly by the spec as restricted markets.
  'US', // United States
  'GB', // United Kingdom
  'CA', // Canada
  'AU', // Australia
  // Standing OFAC-sanctioned jurisdictions.
  'CU', // Cuba
  'IR', // Iran
  'KP', // North Korea
  'SY', // Syria
];

const RESTRICTED_SET = new Set(RESTRICTED_COUNTRY_CODES);

/** True when a country code is on the deny list. Case-insensitive. */
export function isRestrictedCountry(code: string | null | undefined): boolean {
  if (!code) return false;
  return RESTRICTED_SET.has(code.trim().toUpperCase());
}

/**
 * Human-readable reason shown to a blocked shopper (spec section 6a point 4:
 * "Show a clear message explaining why").
 */
export function restrictedCountryMessage(code: string | null): string {
  return (
    `Reward claims are not available to persons located in this jurisdiction` +
    (code ? ` (detected region: ${code})` : '') +
    `. xStocks and PreStocks are restricted for residents of the United States, ` +
    `United Kingdom, Canada, Australia, and OFAC-sanctioned jurisdictions.`
  );
}