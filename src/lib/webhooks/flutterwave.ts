import { timingSafeEqual } from "crypto";

/**
 * Flutterwave webhook verification (reward-delivery spec section 5, second
 * provider). Flutterwave's scheme is deliberately simpler than Stripe's: the
 * merchant invents a "secret hash" in their dashboard, and every webhook
 * carries it verbatim in the `verif-hash` header. Our job is only to compare
 * it, timing-safely, against the hash the merchant saved with us.
 *
 * Deliberate deviation from Flutterwave's own guidance: their docs suggest
 * re-querying their verify endpoint with the merchant's SECRET KEY before
 * giving value. That key can move money on the merchant's account, and we do
 * not hold money-moving credentials for a webhook. The verif-hash check plus
 * the (merchant_id, external_order_id) idempotency constraint is what this
 * integration relies on.
 *
 * Two payload facts this module encodes (from developer.flutterwave.com):
 *   * `data.amount` is the MAJOR unit as a number ("54600" NGN means
 *     54600 naira), unlike Stripe's integer cents. We convert to cents here so
 *     the rest of the pipeline only ever sees Stripe-shaped integers.
 *   * Non-USD charges are REFUSED, not converted: rewards are priced in USD
 *     and guessing an FX rate would silently misprice every reward.
 */

export type FlutterwaveParseResult =
  | {
      handled: false;
      /** Acknowledge (200) so Flutterwave does not retry the event. */
      ignoredReason: string;
    }
  | { handled: true; orderId: string; amountCents: bigint; email: string | null };

function hashesMatch(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Header name Flutterwave sends the merchant's secret hash in. */
export const FLUTTERWAVE_SIGNATURE_HEADER = "verif-hash";

/**
 * Compares the `verif-hash` header against the stored secret hash. The raw
 * body is NOT part of Flutterwave's scheme (their sample code compares the
 * header only), so no body digest is computed here.
 */
export function verifyFlutterwaveSignature(params: {
  secretHash: string;
  receivedHeader: string | null;
}): boolean {
  return hashesMatch(params.secretHash, params.receivedHeader);
}

/**
 * Extracts the purchase from a `charge.completed` event. Everything else
 * (transfers, refunds, failed charges, the "check all the boxes" dashboard
 * defaults) is acknowledged and ignored.
 */
export function parseFlutterwaveEvent(rawBody: string): {
  ok: true;
  result: FlutterwaveParseResult;
} | {
  ok: false;
  /** 400-worthy: the event claims to be a completed charge but is malformed. */
  error: string;
} {
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: "Invalid JSON body." };
  }

  const body = event as {
    event?: string;
    "event.type"?: string;
    data?: {
      status?: string;
      tx_ref?: string;
      amount?: number | string;
      currency?: string;
      customer?: { email?: string | null } | null;
    };
  };

  if (body.event !== "charge.completed") {
    return {
      ok: true,
      result: { handled: false, ignoredReason: body.event ?? "unknown event" },
    };
  }
  // charge.completed also fires for FAILED charges (their docs say they send
  // one per failed attempt), so the status field decides.
  if (body.data?.status !== "successful") {
    return {
      ok: true,
      result: {
        handled: false,
        ignoredReason: `charge.completed with status ${body.data?.status ?? "unknown"}`,
      },
    };
  }

  const orderId = typeof body.data.tx_ref === "string" ? body.data.tx_ref.trim() : "";
  if (!orderId) {
    return { ok: false, error: "Completed charge is missing tx_ref." };
  }

  const currency = (body.data.currency ?? "").toUpperCase();
  if (currency !== "USD") {
    return {
      ok: false,
      error:
        "Only USD charges can create a reward. This charge was in " +
        (currency || "an unknown currency") + ".",
    };
  }

  // Major unit (a float like 42.10) -> integer cents. Number dance avoids the
  // classic 42.10 * 100 = 4209.999... float trap, which would silently
  // underprice the reward.
  const parsedAmount =
    typeof body.data.amount === "string"
      ? Number.parseFloat(body.data.amount)
      : body.data.amount;
  if (typeof parsedAmount !== "number" || !Number.isFinite(parsedAmount) || parsedAmount < 0) {
    return { ok: false, error: "Completed charge is missing a usable amount." };
  }
  const amountCents = BigInt(Math.round(parsedAmount * 100));

  return {
    ok: true,
    result: {
      handled: true,
      orderId,
      amountCents,
      email: body.data.customer?.email ?? null,
    },
  };
}
