import { env } from "@/lib/env";

/**
 * SDK snippet (spec section 6). Returns the <script> tag a merchant pastes into
 * their checkout. It carries ONLY the merchant's public ID — never the internal
 * primary key, never any secret (spec sections 2, 6, 8).
 *
 * The base URL is env-driven so the copied snippet works against a local /
 * preview deploy; it defaults to the production value from spec section 6.
 */
const DEFAULT_SDK_BASE_URL = "https://equixity.vercel.app";

/**
 * The order-id placeholder in the fiat snippet. It cannot be baked in: the value
 * differs per order, so the merchant's own success page has to render it.
 * Exported so the settings copy can name it exactly.
 */
export const FIAT_ORDER_ID_PLACEHOLDER = "ORDER_ID";

export function buildSdkSnippet(publicId: string): string {
  const base = (env.nextPublicAppUrl || DEFAULT_SDK_BASE_URL).replace(/\/+$/, "");
  // Intentional raw HTML string; it is served as a literal snippet to copy.
  return `<script src="${base}/equixity.js" data-merchant-id="${publicId}"></script>`;
}

/**
 * Fiat notification snippet (spec section 3) — the crypto snippet plus
 * `data-order-id`, and the difference is not cosmetic.
 *
 * The crypto customer's browser gets a rewardEventId straight back from
 * complete(), so the badge can render with no help from the merchant. A fiat
 * customer's browser knows nothing at all: the purchase was recorded by a
 * Stripe webhook or by the merchant's own backend. The page therefore has to
 * say WHICH order it is, and `data-order-id` is how. With the attribute absent
 * the SDK finds no order, does nothing, and the customer never reaches the
 * hosted reward page at all.
 *
 * The order id must be the SAME value the reward was recorded against:
 *   * Path A (Stripe)  -> the Checkout Session id, i.e. what Stripe sends as
 *                         session.id on checkout.session.completed;
 *   * Path B (own API) -> the externalOrderId that was posted.
 */
export function buildFiatSdkSnippet(publicId: string): string {
  const base = (env.nextPublicAppUrl || DEFAULT_SDK_BASE_URL).replace(/\/+$/, "");
  return [
    `<script src="${base}/equixity.js"`,
    `        data-merchant-id="${publicId}"`,
    `        data-order-id="${FIAT_ORDER_ID_PLACEHOLDER}"></script>`,
  ].join("\n");
}

/**
 * The hosted reward page for one reward. Path B merchants who would rather not
 * run the snippet can link straight to this from the rewardEventId their own
 * backend already receives.
 */
export function buildRewardPageUrl(rewardEventId: string): string {
  const base = (env.nextPublicAppUrl || DEFAULT_SDK_BASE_URL).replace(/\/+$/, "");
  return `${base}/reward/${rewardEventId}`;
}