import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

/**
 * Rate limiting for the two public endpoints (spec section 7).
 *
 * WHY THIS ONE IS BUILT FOR REAL, unlike the funding-sync gap that was
 * deliberately accepted earlier: those endpoints could only ever READ chain
 * data, so there was little to extract by hammering them. These two endpoints
 * directly gate real money leaving a merchant's balance — /complete decides
 * whether a reward is issued, and /complete-card spends a merchant's funded
 * USDC on the say-so of a bearer key. That is a meaningfully different risk.
 *
 * Backed by Upstash Redis because the app runs as serverless functions with no
 * shared memory: an in-process counter would be per-instance and effectively
 * useless under any real load.
 *
 * FAIL-CLOSED IN PRODUCTION: if Upstash is not configured on a production
 * deployment, these calls are refused rather than waved through. Silently
 * disabling a money-gating control because an env var is missing is exactly
 * the kind of quiet failure this build avoids. Outside production it allows
 * with a warning, so local development is not blocked.
 */

function makeLimiter(
  prefix: string,
  tokens: number,
  window: `${number} s` | `${number} m`,
): Ratelimit | null {
  if (!env.upstashRedisRestUrl || !env.upstashRedisRestToken) return null;
  return new Ratelimit({
    redis: new Redis({
      url: env.upstashRedisRestUrl,
      token: env.upstashRedisRestToken,
    }),
    limiter: Ratelimit.slidingWindow(tokens, window),
    analytics: true,
    prefix,
  });
}

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
  /** True when the limiter could not run at all (missing configuration). */
  unavailable?: boolean;
};

function unavailable(): RateLimitResult {
  if (process.env.VERCEL_ENV === "production") {
    return { allowed: false, unavailable: true, retryAfterSeconds: 60 };
  }
  console.warn(
    "[equixity] rate limiting inactive: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set (allowed outside production).",
  );
  return { allowed: true, unavailable: true };
}

async function check(
  limiter: Ratelimit | null,
  identifier: string,
): Promise<RateLimitResult> {
  if (!limiter) return unavailable();
  const { success, reset } = await limiter.limit(identifier);
  if (success) return { allowed: true };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
  };
}

/** Per-merchant and per-IP limits for /api/public/complete (spec section 7). */
const completeByMerchant = makeLimiter("equixity:rl:complete:m", 30, "60 s");
const completeByIp = makeLimiter("equixity:rl:complete:ip", 60, "60 s");

/**
 * Split into two calls rather than one combined check, so the IP limit can run
 * BEFORE the merchant lookup: an unauthenticated caller should not be able to
 * make us do work (even an indexed lookup) at an unbounded rate.
 */
export function checkCompleteIpLimit(ip: string): Promise<RateLimitResult> {
  return check(completeByIp, ip);
}

export function checkCompleteMerchantLimit(
  merchantId: string,
): Promise<RateLimitResult> {
  return check(completeByMerchant, merchantId);
}

/** Per-API-key limits for /api/public/complete-card (spec section 4a/7). */
const cardByKey = makeLimiter("equixity:rl:card:key", 60, "60 s");

export function checkCardRateLimit(apiKeyHash: string): Promise<RateLimitResult> {
  return check(cardByKey, apiKeyHash);
}

/** Per-IP limit for Privy token verification (abuse gate, not money-moving). */
const privyVerifyByIp = makeLimiter("equixity:rl:privy:ip", 20, "60 s");

export function checkPrivyVerifyRateLimit(ip: string): Promise<RateLimitResult> {
  return check(privyVerifyByIp, ip);
}

/**
 * Public reward-delivery endpoints (reward-delivery spec sections 3a, 4, 7).
 * reward-exists is the notification's poll (fiat, every couple of seconds, so
 * the loosest); reward-status is read by the hosted page; reward-confirm moves
 * real money and gets the tightest of the three.
 */
const rewardExistsByIp = makeLimiter("equixity:rl:rewexists:ip", 120, "60 s");
const rewardStatusByIp = makeLimiter("equixity:rl:rewstatus:ip", 60, "60 s");
const rewardConfirmByIp = makeLimiter("equixity:rl:rewconfirm:ip", 10, "60 s");

export function checkRewardExistsRateLimit(ip: string): Promise<RateLimitResult> {
  return check(rewardExistsByIp, ip);
}

export function checkRewardStatusRateLimit(ip: string): Promise<RateLimitResult> {
  return check(rewardStatusByIp, ip);
}

export function checkRewardConfirmRateLimit(ip: string): Promise<RateLimitResult> {
  return check(rewardConfirmByIp, ip);
}

/**
 * Client IP for the per-IP limiter. Uses Vercel's documented helper and falls
 * back to the forwarded-for chain so local/other runtimes still produce a
 * stable identifier.
 */
export function clientIp(
  request: Request,
  ipAddress: (input: Request | Headers) => string | undefined,
): string {
  try {
    const ip = ipAddress(request);
    if (ip) return ip;
  } catch {
    // helper unavailable outside the Vercel runtime
  }
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}