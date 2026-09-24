import { NextResponse } from "next/server";
import { ipAddress } from "@vercel/functions";
import { resolveCustomerWallet } from "@/lib/auth/customer-session";
import { checkPrivyVerifyRateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/public/privy-wallet - resolve the Solana address behind a Privy login.
 *
 * WHY THIS EXISTS: the Privy React SDK creates/resolves an embedded Solana wallet
 * client-side, and the browser knows the address - but the browser is not a
 * trusted source for the destination of real money. This endpoint verifies the
 * Privy token SERVER-SIDE and reads the linked wallet address from Privy's own
 * response, so a caller cannot simply claim "my wallet is X" for someone else's
 * address without a valid token for that user.
 *
 * This route is a thin, rate-limited front door for `resolveCustomerWallet`
 * (src/lib/auth/customer-session.ts), the same resolver the holdings read and
 * both transfer legs use. Keeping ONE implementation means the claim page and
 * the wallet page can never drift apart in how they decide whose wallet this is.
 *
 * Two tokens are accepted, and the resolver tries them in order:
 *   * IDENTITY token - verified in-process against the app's JWKS and turned
 *     straight into the user object. Zero Privy API requests, so it cannot be
 *     rate limited;
 *   * ACCESS token - verified locally, then the user object is read by the DID
 *     the token carries. One request, cached for a minute, made from the server.
 *
 * The second path is the one that matters in production. Live, this page failed
 * with `GET auth.privy.io/api/v1/users/me 429` in the console, because Privy's
 * browser-side call to obtain an identity token is rate limited per endpoint.
 * The access token is already in the browser's store at that point, which is why
 * the client now sends it and no longer waits on Privy for a second token. See
 * `resolveCustomerWallet` for the full reasoning.
 *
 * VERIFIED against Privy's current docs and the installed @privy-io/node types:
 *   await privy.utils().auth().verifyAccessToken(accessToken)  // ES256 JWT
 *   await privy.users()._get(userId)                           // user by DID
 *   await privy.users().get({ id_token: idToken })             // verifies AND
 *                                                              // returns the user
 * `verifyAuthToken` still exists but is marked @deprecated in favour of
 * `verifyAccessToken`, so the non-deprecated name is used.
 */

const TOO_MANY = "Too many requests. Please try again shortly.";

/**
 * The identity token cookie.
 *
 * Privy's docs: with "Return user data in an identity token" enabled (and a base
 * domain set), Privy attaches the identity token as a cookie to EVERY request the
 * browser makes to our own domain. That means the token can arrive here with no
 * client-side Privy call at all, which is the one path nothing in the browser can
 * rate limit. Reading it costs nothing, so it is used whenever the body did not
 * already carry an identity token.
 */
function identityTokenCookie(req: Request): string {
  const header = req.headers.get("cookie");
  if (!header) return "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq);
    // Matches `privy-id-token` and any prefixed form of it.
    if (name === "privy-id-token" || name.endsWith("-privy-id-token")) {
      try {
        return decodeURIComponent(trimmed.slice(eq + 1)).trim();
      } catch {
        return trimmed.slice(eq + 1).trim();
      }
    }
  }
  return "";
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const limit = await checkPrivyVerifyRateLimit(clientIp(req, ipAddress));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: TOO_MANY },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          ...(limit.retryAfterSeconds
            ? { "Retry-After": String(limit.retryAfterSeconds) }
            : {}),
        },
      },
    );
  }

  // The body is read here rather than inside the resolver so the identity token
  // cookie can be folded in as a fallback.
  let raw: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object") {
      raw = parsed as Record<string, unknown>;
    }
  } catch {
    // A body that will not parse is not fatal: the cookie path can still carry
    // the whole request, and the resolver reports "please sign in again" if
    // neither source produced a token.
  }

  if (typeof raw.idToken !== "string" || !raw.idToken.trim()) {
    const fromCookie = identityTokenCookie(req);
    if (fromCookie) raw.idToken = fromCookie;
  }

  const session = await resolveCustomerWallet(raw);
  if ("error" in session) {
    return json({ error: session.error }, session.status);
  }

  return json({ address: session.address, claimMethod: "privy_embedded" });
}

