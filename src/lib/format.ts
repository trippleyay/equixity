import { USDC_DECIMALS } from "@/lib/solana/constants";

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
 * Reward rate as a percent string, integer math only. 100 bps -> "1%",
 * 150 bps -> "1.5%", 25 bps -> "0.25%".
 */
export function formatBps(bps: number): string {
  const w = bps / 100;
  const f = bps % 100;
  const frac = f.toString().padStart(2, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${w}.${frac}%` : `${w}%`;
}