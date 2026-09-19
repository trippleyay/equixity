import { USDC_BASE_UNITS_PER_TOKEN, USDC_DECIMALS } from "@/lib/solana/constants";

/**
 * Formatting helpers for money. Every stored/transported amount is a bigint in
 * base units (spec: "all amounts stored as integer base units, never float").
 * These helpers use only integer arithmetic — there is deliberately no
 * Number()/parseFloat/Math.* anywhere near a money value.
 */

const SCALE = 10n ** BigInt(USDC_DECIMALS); // 1_000_000n

/**
 * Convert base units (a bigint, or its decimal-string form) into a human string,
 * e.g. 1_000_000n -> "1.00", 250_000n -> "0.25", 0n -> "0.00".
 * USD-style cents (2 decimals) with thousands separators, integer math only.
 */
export function formatUsdcUnits(units: string | bigint | number): string {
  const n = BigInt(units);
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  const whole = abs / SCALE;
  const cents = (abs % SCALE) / (SCALE / 100n); // integer cents (1c = 10_000 units)
  const wholeStr = whole
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${wholeStr}.${cents.toString().padStart(2, "0")}`;
}

/** base units => token count with the full native precision as a decimal string. */
export function formatBaseUnitsWithDecimals(
  units: string | bigint,
  decimals: number,
): string {
  const n = BigInt(units);
  const scale = 10n ** BigInt(decimals);
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  const whole = abs / scale;
  const frac = (abs % scale).toString().padStart(decimals, "0");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed.length > 0 ? `${sign}${whole}.${trimmed}` : `${sign}${whole}`;
}

/**
 * Parse a human decimal USDC amount ("12.34") into base-unit bigint — integer
 * math only, no floats. Rejects non-numeric input, empty values, and more than
 * 6 decimals (silent rounding is not allowed). 0 and negative throw.
 */
export function parseUsdcToUnits(input: string | number): bigint {
  const s = String(input).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error("Invalid USDC amount.");
  }
  const [whole, frac = ""] = s.split(".");
  if (frac.length > USDC_DECIMALS) {
    throw new Error("Too many decimal places (max 6 for USDC).");
  }
  const fracPadded = frac.padEnd(USDC_DECIMALS, "0");
  const units = BigInt(whole) * USDC_BASE_UNITS_PER_TOKEN + BigInt(fracPadded);
  if (units <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }
  return units;
}

/**
 * Upstream issuer names carry a vendor suffix ("Apple Inc. xStock",
 * "Anduril Industries PreStock"). The symbol column (AAPLx / ANDURIL) already
 * says which kind it is, so the display name is shown without the suffix.
 * Shared by the catalog sync writer (server) and the asset table (client).
 */
export function cleanDisplayName(raw: string, ticker: string): string {
  const stripped = raw
    .replace(/\s+xStock$/i, "")
    .replace(/\s+PreStock$/i, "")
    .trim();
  return stripped || ticker;
}

/**
 * Reward rate as a percent string, integer math only. 100 bps -> "1%",
 * 150 bps -> "1.5%", 125 bps -> "1.25%", 5 bps -> "0.05%".
 */
export function formatBps(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  if (frac === 0) {
    return `${whole}%`;
  }
  const fracStr = frac.toString().padStart(2, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}%`;
}

/**
 * Format a `token_price_usd` value (numeric(20,8) transported as text) for
 * display: thousands separators + 2 decimals, integer math only.
 *
 * The price is a display/calc value rather than a ledger amount, but it still
 * arrives as a decimal string, so it is parsed and rounded with BigInt rather
 * than parseFloat to keep the no-floats rule intact end to end.
 */
export function formatUsdPrice(priceText: string | null | undefined): string {
  if (!priceText) return "—";
  const s = String(priceText).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return "—";

  const [whole, frac = ""] = s.split(".");
  const cents = Number((frac + "00").slice(0, 2)); // 0-99, safe as a Number
  // Round half-up on the third decimal, using integer arithmetic only.
  const third = Number((frac + "000").charAt(2));
  let centsFinal = cents;
  let wholeBig = BigInt(whole);
  if (third >= 5) {
    centsFinal += 1;
    if (centsFinal === 100) {
      centsFinal = 0;
      wholeBig += 1n;
    }
  }
  const wholeStr = wholeBig.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${wholeStr}.${centsFinal.toString().padStart(2, "0")}`;
}