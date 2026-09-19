/**
 * Minimal fixed-point decimal helpers, BigInt-only.
 *
 * Used for the ONE place in this app where genuine decimal arithmetic is
 * unavoidable: converting a USDC reward value into a reward asset's quantity by
 * dividing by `token_price_usd`. Everything that moves money stays bigint base
 * units; `token_price_usd` is an explicit display/calc value (numeric(20,8)),
 * not a ledger entry, which is why it is not a bigint.
 *
 * No floats anywhere: parsing, division and formatting are all integer ops on
 * scaled BigInts.
 */

const TEN = 10n;

export function pow10(n: number): bigint {
  return TEN ** BigInt(n);
}

/** Parse "762.885" into a BigInt scaled by `scale` (e.g. 8 -> 76288500000n). */
export function parseDecimal(value: string | number, scale: number): bigint {
  const s = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Not a decimal number: ${JSON.stringify(value)}`);
  }
  const negative = s.startsWith("-");
  const body = negative ? s.slice(1) : s;
  const [intPart = "0", fracPart = ""] = body.split(".");
  const frac = (fracPart + "0".repeat(scale)).slice(0, scale);
  const scaled = BigInt((intPart || "0") + frac);
  return negative ? -scaled : scaled;
}

/** Format a scaled BigInt back into a decimal string, trimming trailing zeros. */
export function formatDecimal(scaled: bigint, scale: number): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const padded = abs.toString().padStart(scale + 1, "0");
  const intPart = padded.slice(0, padded.length - scale);
  const fracPart = scale > 0 ? padded.slice(padded.length - scale) : "";
  const trimmed = fracPart.replace(/0+$/, "");
  const out = trimmed === "" ? intPart : `${intPart}.${trimmed}`;
  return negative ? `-${out}` : out;
}

/**
 * a / b as a decimal string with `outScale` fraction digits (truncated toward
 * zero, never rounded up — the caller treats the result as a reward quantity,
 * and rounding up would hand out more than the USDC value covers).
 */
export function divideDecimal(a: string, b: string, outScale = 12): string {
  const workScale = outScale + 8; // guard digits so the division stays precise
  const aScaled = parseDecimal(a, workScale);
  const bScaled = parseDecimal(b, workScale);
  if (bScaled === 0n) throw new Error("divideDecimal: division by zero");
  const quotient = (aScaled * pow10(outScale)) / bScaled;
  return formatDecimal(quotient, outScale);
}