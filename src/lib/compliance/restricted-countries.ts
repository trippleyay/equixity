// ============================================================
// Restricted jurisdictions for the section 6a eligibility gate.
//
// Plain config, not a migration — this is a compliance list that may need to
// change without a schema change (spec section 6a point 2).
//
// Codes are ISO 3166-1 alpha-2, matching the format of Vercel's
// `x-vercel-ip-country` header (verified against current Vercel docs; the
// `geolocation()` helper returns the same value as `country`).
//
// TWO DISTINCT GROUPS (they must never be conflated in copy):
//   * restricted MARKETS — the jurisdictions the reward products are not
//     available in, and the list enumerated in the attestation copy;
//   * OFAC-SANCTIONED jurisdictions — enforced, but referenced generically in
//     the attestation ("or any OFAC sanctions list"), never enumerated.
//
// THE LIST BELOW IS A DRAFT, NOT A LEGAL DETERMINATION — exactly as the spec
// states. It should be reviewed before this is relied on in production.
// ============================================================

export const RESTRICTED_MARKET_CODES: readonly string[] = [
  // Named explicitly by the spec as restricted markets.
  'US', // United States
  'GB', // United Kingdom
  'CA', // Canada
  'AU', // Australia
  'CN', // Mainland China (HK, MO and TW carry their own ISO codes)
];

const RESTRICTED_MARKET_NAMES: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  CN: 'Mainland China',
};

export const OFAC_COUNTRY_CODES: readonly string[] = [
  // Standing OFAC-sanctioned jurisdictions.
  'CU', // Cuba
  'IR', // Iran
  'KP', // North Korea
  'SY', // Syria
];

/** Every enforced code: restricted markets plus OFAC jurisdictions. */
export const RESTRICTED_COUNTRY_CODES: readonly string[] = [
  ...RESTRICTED_MARKET_CODES,
  ...OFAC_COUNTRY_CODES,
];

const RESTRICTED_SET = new Set(RESTRICTED_COUNTRY_CODES);

/**
 * The enumerated jurisdiction list for the attestation copy, derived from the
 * enforced market list so the printed list can never drift from the gate.
 * Format: "United States, United Kingdom, Canada, Australia, or Mainland China".
 */
export function restrictedMarketListLabel(): string {
  const names = RESTRICTED_MARKET_CODES.map(
    (code) => RESTRICTED_MARKET_NAMES[code] ?? code,
  );
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
}

/**
 * The exact customer-facing attestation sentence (spec section 6a point 3),
 * approved word for word. It is BUILT HERE rather than typed into the page so
 * the printed jurisdiction list is literally derived from the enforced list:
 * the copy can never drift from the gate. Deliberately no em or en dashes, and
 * no interpolation of anything user-supplied.
 */
export function rewardAttestationText(): string {
  return (
    'By proceeding, you attest that you are not a U.S. Person, a resident of, ' +
    'or located in, any of the following jurisdictions or any OFAC sanctions ' +
    `list: ${restrictedMarketListLabel()}.`
  );
}

/** True when a country code is on the deny list (either group). Case-insensitive. */
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
    `. Stock rewards are restricted for residents of ${restrictedMarketListLabel().replace(', or', ' and')} and OFAC-sanctioned jurisdictions.`
  );
}