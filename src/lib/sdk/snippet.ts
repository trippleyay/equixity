import { env } from "@/lib/env";

/**
 * SDK snippets (spec section 6): the <script> tag a merchant pastes into their
 * own SUCCESS PAGE, the page the customer lands on after paying. It carries
 * ONLY the merchant's public id, never the internal primary key, never any
 * secret, and never a per-order value (spec sections 2, 6, 8).
 *
 * One snippet serves every payment method. The purchase reference travels in
 * the customer's page address instead of the tag, and each provider supplies
 * it without the merchant editing anything per order:
 *
 *   Stripe       the redirect address includes ?session_id={CHECKOUT_SESSION_ID},
 *                a literal string Stripe replaces itself at redirect time.
 *   Flutterwave  appends ?status=...&tx_ref=... to the redirect automatically.
 *   Own backend  the merchant adds ?order_id= with the id they posted to
 *                complete-card.
 *
 * There is deliberately no checkout-page snippet and no function for the
 * merchant to call: the success page is the one page that can say which order
 * was just placed, so one paste is the whole integration.
 *
 * The base URL is env-driven so the copied snippet works against a local or
 * preview deploy; it defaults to the production value from spec section 6.
 */
const DEFAULT_SDK_BASE_URL = "https://equixity.vercel.app";

function snippetBaseUrl(): string {
  return (env.nextPublicAppUrl || DEFAULT_SDK_BASE_URL).replace(/\/+$/, "");
}

/**
 * The success-page snippet for every payment method. No per-order values:
 * the page address carries the purchase reference (see module comment).
 */
export function buildSuccessPageSnippet(publicId: string): string {
  return `<script src="${snippetBaseUrl()}/equixity.js" data-merchant-id="${publicId}"></script>`;
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
