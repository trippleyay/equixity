import { env } from "@/lib/env";

/**
 * SDK snippets (spec section 6). Each returns the <script> tag a merchant pastes
 * into their own SUCCESS PAGE. It carries ONLY the merchant's public ID — never
 * the internal primary key, never any secret (spec sections 2, 6, 8).
 *
 * There is deliberately no checkout-page snippet. For both payment paths the
 * script belongs on the page the customer lands on AFTER paying, because that
 * is the page that can say which order was just placed. Nothing has to be
 * called from the merchant's own checkout code any more, so a merchant pastes
 * one tag and writes no code at all.
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

/**
 * The payment placeholder in the crypto snippet, same reasoning and the same
 * rule: one value per payment, rendered by the merchant's own success page.
 * It is the signature of the Solana payment the customer just made, which is
 * what on-chain verification reads the amount from.
 */
export const CRYPTO_TRANSACTION_PLACEHOLDER = "TRANSACTION_SIGNATURE";

function snippetBaseUrl(): string {
  return (env.nextPublicAppUrl || DEFAULT_SDK_BASE_URL).replace(/\/+$/, "");
}

/**
 * Crypto success-page snippet (spec sections 3, 4).
 *
 * The page says WHICH payment it belongs to with `data-transaction-signature`.
 * The script then verifies that payment on-chain, records the reward and shows
 * the badge, so the customer reaches the hosted reward page without the
 * merchant calling anything.
 *
 * The value must be the SAME transaction the purchase was paid with. With the
 * attribute absent the script finds no payment, does nothing, and the customer
 * never reaches the hosted reward page at all.
 */
export function buildCryptoSdkSnippet(publicId: string): string {
  const base = snippetBaseUrl();
  return [
    `<script src="${base}/equixity.js"`,
    `        data-merchant-id="${publicId}"`,
    `        data-transaction-signature="${CRYPTO_TRANSACTION_PLACEHOLDER}"></script>`,
  ].join("\n");
}

/**
 * Fiat success-page snippet (spec sections 3, 5) — the crypto snippet with
 * `data-order-id` instead of `data-transaction-signature`, and the difference
 * is not cosmetic.
 *
 * On fiat the purchase was already recorded by a Stripe webhook or by the
 * merchant's own backend, so the page only has to say WHICH order it is and
 * wait for the reward to show up. `data-order-id` is how. With the attribute
 * absent the script finds no order, does nothing, and the customer never
 * reaches the hosted reward page at all.
 *
 * The order id must be the SAME value the reward was recorded against:
 *   * Path A (Stripe)  -> the Checkout Session id, i.e. what Stripe sends as
 *                         session.id on checkout.session.completed;
 *   * Path B (own API) -> the externalOrderId that was posted.
 */
export function buildFiatSdkSnippet(publicId: string): string {
  const base = snippetBaseUrl();
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