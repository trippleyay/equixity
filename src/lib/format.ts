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
 * Reward rate as a percent string, integer math only. 100 bps -> "1%",
 * 150 bps -> "1.5%", 25 bps -> "0.25%".
 */
export function formatBps(bps: number): string {
  const w = bps / 100;
  const f = bps % 100;
  const frac = f.toString().padStart(2, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${w}.${frac}%` : `${w}%`;
}