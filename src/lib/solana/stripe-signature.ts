import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe webhook signature verification, implemented with node:crypto.
 *
 * No `stripe` SDK dependency: the scheme is stable and small (Stripe's
 * documented "verifying webhooks manually" procedure), and a dependency is
 * not worth it for 40 lines. VERIFIED against Stripe's current docs:
 *   * header `Stripe-Signature: t=<unix>,v1=<hex hmac>` (possibly multiple v1);
 *   * the signed payload is `${t}.${rawRequestBody}` (the RAW body, exactly as
 *     received — reparsing JSON first would break the MAC);
 *   * HMAC-SHA256 keyed on the endpoint's signing secret, hex-encoded;
 *   * reject when |now - t| exceeds ~5 minutes (replay protection).
 *
 * Uses timingSafeEqual so a forged signature's byte distance never leaks.
 */

const TIMESTAMP_TOLERANCE_SECONDS = 300;

export type StripeSignatureResult =
  | { ok: true }
  | { ok: false; reason: string };

function hmacHex(t: string, payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${t}.${payload}`).digest();
}

export function verifyStripeSignature(params: {
  signatureHeader: string | null;
  rawBody: string;
  secret: string;
}): StripeSignatureResult {
  const { signatureHeader, rawBody, secret } = params;
  if (!signatureHeader) {
    return { ok: false, reason: "Missing Stripe-Signature header." };
  }

  const timestamp = /(?:^|,)\s*t=([^,\s]+)/.exec(signatureHeader)?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp)) {
    return { ok: false, reason: "Missing or malformed timestamp." };
  }

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, reason: "Signature timestamp is too old." };
  }

  const v1s = [...signatureHeader.matchAll(/v1=([^,\s]+)/g)].map(
    (m) => m[1],
  );
  if (v1s.length === 0) {
    return { ok: false, reason: "Missing v1 signature." };
  }

  const expected = hmacHex(timestamp, rawBody, secret);
  for (const v1 of v1s) {
    const provided = Buffer.from(v1, "hex");
    if (
      provided.length === expected.length &&
      timingSafeEqual(provided, expected)
    ) {
      return { ok: true };
    }
  }

  return { ok: false, reason: "Signature verification failed." };
}

/** Build a valid signature header — used by local verification tests only. */
export function buildStripeSignatureHeader(
  rawBody: string,
  secret: string,
  timestampSeconds = Math.floor(Date.now() / 1000),
): string {
  const t = String(timestampSeconds);
  return `t=${t},v1=${hmacHex(t, rawBody, secret).toString("hex")}`;
}