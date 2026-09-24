/**
 * Customer session: resolve a Privy token to a Solana wallet address, SERVER-SIDE.
 *
 * This is the single source of truth for "who is this customer", shared by the
 * holdings read, both transfer legs, and the claim page. Two token paths, tried
 * in this order:
 *
 *   * the IDENTITY token, if the browser has one: verified in-process against
 *     the app's JWKS and turned straight into the user object. No Privy API
 *     request, so it cannot be rate limited;
 *   * the ACCESS token, which every signed-in customer always has: verified
 *     locally (Privy-issued ES256 JWT), then the user object is read BY THE DID
 *     THAT TOKEN CARRIES, with the app secret. One request, cached for a minute.
 *
 * The Solana address is read out of the user object in both cases, never from
 * the request body. That is the whole security property: the browser is never
 * the trusted source of whose wallet this is, so there is no parameter a caller
 * could tamper with to read or move someone else's assets.
 *
 * WHY BOTH: the identity token is the cheap path, but it only exists on some
 * app configurations, and this page broke live with
 * `GET auth.privy.io/api/v1/users/me 429` coming from the browser. That 429 came
 * from asking Privy for an identity token, not from signing in, so the token the
 * browser always holds is now enough on its own.
 *
 * A returning customer who signs in with the SAME email gets the SAME Privy user
 * and therefore the SAME wallet, which is what makes a second reward land
 * alongside the first without creating a second account.
 */

import { PrivyClient } from "@privy-io/node";
import { env } from "@/lib/env";

export type CustomerSession =
  | { address: string }
  | { error: string; status: 401 | 400 | 422 | 503 };

/** Pull the first Solana wallet address out of a Privy user object. */
function solanaAddressFromUser(user: unknown): string | null {
  const linked = (user as { linked_accounts?: unknown[] })?.linked_accounts;
  if (!Array.isArray(linked)) return null;
  for (const account of linked) {
    const a = account as { type?: string; chain_type?: string; address?: string };
    // Privy reports Solana wallets with chain_type 'solana'.
    if (a?.type === "wallet" && a?.chain_type === "solana" && a.address) {
      return a.address;
    }
  }
  return null;
}

function buildClient(): PrivyClient | null {
  if (!env.nextPublicPrivyAppId || !env.privyAppSecret) return null;
  return new PrivyClient({
    appId: env.nextPublicPrivyAppId,
    appSecret: env.privyAppSecret,
  });
}

/**
 * Resolved addresses, keyed by Privy user id, held for a minute.
 *
 * WHY THIS EXISTS: the access-token path costs exactly one Privy API request
 * (GET /api/v1/users/:id). A single customer action asks for the same user id
 * two or three times in a row (holdings, then both transfer legs), and Privy
 * applies rate limits PER ENDPOINT, so a repeated lookup for a user we already
 * resolved a second ago is how a working page becomes a 429. Privy's own
 * "Optimize your setup" page names caching exactly this way as a best practice.
 * The cache is short-lived on purpose: a linked wallet does not change
 * mid-session.
 *
 * Only a SUCCESSFUL address is cached. A user whose embedded wallet Privy is
 * still creating is deliberately never cached, so a first-ever sign-in can
 * never be remembered as "no wallet linked".
 */
const ADDRESS_CACHE_TTL_MS = 60_000;
const ADDRESS_CACHE_MAX = 500;
const addressCache = new Map<string, { address: string; expiresAt: number }>();

/**
 * Reads the two Privy tokens. Accepts either a Request (body read here) or an
 * already-parsed body object, because the transfer route has to parse its body
 * once for the transfer parameters and passes the same object in rather than
 * re-reading a consumed stream.
 */
export async function resolveCustomerWallet(
  input: Request | Record<string, unknown>,
): Promise<CustomerSession> {
  const privy = buildClient();
  if (!privy) {
    return { error: "Sign-in is not available right now.", status: 503 };
  }

  let raw: Record<string, unknown>;
  if (typeof (input as Request).text === "function") {
    try {
      const v = await (input as Request).json();
      raw = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    } catch {
      return { error: "Invalid request.", status: 400 };
    }
  } else {
    raw = input as Record<string, unknown>;
  }

  const accessToken =
    typeof raw.accessToken === "string" ? raw.accessToken.trim() : "";
  const idToken = typeof raw.idToken === "string" ? raw.idToken.trim() : "";

  if (!accessToken && !idToken) {
    return { error: "Please sign in again.", status: 401 };
  }

  /**
   * PATH 1, tried first because it costs NO Privy API request at all: the
   * identity token is verified against the app's JWKS in-process and returns
   * the user object directly. Privy's own documentation calls this the
   * rate-limit-free way to read user data, and rate limiting is precisely what
   * broke this page live (the console showed
   * `GET auth.privy.io/api/v1/users/me 429`). Nothing on this path can 429.
   *
   * If it is absent or rejected we fall through rather than fail: the identity
   * token only exists when the app has "return user data in an identity token"
   * enabled, and an hour-old one expires.
   */
  if (idToken) {
    try {
      const user = await privy.users().get({ id_token: idToken });
      const address = solanaAddressFromUser(user);
      if (address) return { address };
    } catch (e) {
      console.warn("Customer identity token rejected:", (e as Error).message);
    }
  }

  if (!accessToken) {
    return {
      error: "Your sign-in could not be verified. Please sign in again.",
      status: 401,
    };
  }

  /**
   * PATH 2, the one that always works: the access token is a Privy-issued ES256
   * JWT, so verifying it locally proves the caller IS that Privy user and hands
   * us the DID in `user_id`. The access token does not carry linked accounts
   * (Privy says so explicitly), so the user object is then read BY THAT DID with
   * the app secret.
   *
   * The client never touches a user lookup: the browser was the thing being
   * rate limited. One request per signed-in session here, cached for a minute,
   * and the did is taken from a verified token, never from the request body.
   */
  let userId: string;
  try {
    const claims = await privy.utils().auth().verifyAccessToken(accessToken);
    userId = claims.user_id;
  } catch (e) {
    console.warn("Customer access token rejected:", (e as Error).message);
    return {
      error: "Your sign-in could not be verified. Please sign in again.",
      status: 401,
    };
  }

  const cached = addressCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return { address: cached.address };
  }

  try {
    const user = await privy.users()._get(userId);
    const address = solanaAddressFromUser(user);
    if (!address) {
      return { error: "No wallet is linked to this account yet.", status: 422 };
    }
    if (addressCache.size >= ADDRESS_CACHE_MAX) addressCache.clear();
    addressCache.set(userId, {
      address,
      expiresAt: Date.now() + ADDRESS_CACHE_TTL_MS,
    });
    return { address };
  } catch (e) {
    // Privy unreachable, or its own rate limit hit. This is NOT a bad sign-in,
    // so it must not be reported as one: a customer who just paid should never
    // be told to sign in again because Privy had a moment.
    console.warn("Privy user lookup failed:", (e as Error).message);
    return {
      error: "We could not reach your account just now. Please try once more.",
      status: 503,
    };
  }
}
