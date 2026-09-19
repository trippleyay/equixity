import { NextResponse } from "next/server";
import { ipAddress } from "@vercel/functions";
import { PrivyClient } from "@privy-io/node";
import { env } from "@/lib/env";
import { checkPrivyVerifyRateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/public/privy-wallet — resolve the Solana address behind a Privy login.
 *
 * WHY THIS EXISTS: the Privy React SDK creates/resolves an embedded Solana wallet
 * client-side, and the browser knows the address — but the browser is not a
 * trusted source for the destination of real money. This endpoint verifies the
 * Privy access token SERVER-SIDE and reads the linked wallet address from
 * Privy's own response, so a caller cannot simply claim "my wallet is X" for
 * someone else's address without a valid token for that user.
 *
 * VERIFIED against Privy's current docs and the installed @privy-io/node types
 * (the package the deprecated @privy-io/server-auth now tells you to use):
 *   const privy = new PrivyClient({ appId, appSecret });
 *   await privy.utils().auth().verifyAccessToken(accessToken)   // ES256 JWT
 *   await privy.users().get({ id_token })                       // verifies AND
 *                                                               // returns the user
 * Note `verifyAuthToken` still exists but is marked @deprecated in favour of
 * `verifyAccessToken`, so the non-deprecated name is used here.
 */

const TOO_MANY = "Too many requests. Please try again shortly.";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function buildClient(): PrivyClient | null {
  if (!env.nextPublicPrivyAppId || !env.privyAppSecret) return null;
  return new PrivyClient({
    appId: env.nextPublicPrivyAppId,
    appSecret: env.privyAppSecret,
  });
}

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

  const privy = buildClient();
  if (!privy) {
    return json(
      { error: "Privy is not configured on this deployment." },
      503,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const raw = body as { accessToken?: unknown; idToken?: unknown };
  const accessToken =
    typeof raw?.accessToken === "string" ? raw.accessToken.trim() : "";
  const idToken = typeof raw?.idToken === "string" ? raw.idToken.trim() : "";

  if (!accessToken && !idToken) {
    return json({ error: "A Privy token is required." }, 400);
  }

  try {
    // A verified access token proves the caller IS that Privy user. It carries
    // the DID in `sub`, which is what the user lookup is keyed on.
    if (accessToken) {
      await privy.utils().auth().verifyAccessToken(accessToken);
    }

    // The identity token verifies AND returns the full user object (including
    // linked wallets). Privy's docs note the access token alone does not carry
    // the linked accounts, which is why the id token is used for the lookup.
    if (!idToken) {
      return json(
        {
          error:
            "A Privy identity token is required to read the linked wallet. The access token alone does not carry linked accounts.",
        },
        400,
      );
    }

    const user = await privy.users().get({ id_token: idToken });
    const address = solanaAddressFromUser(user);
    if (!address) {
      return json(
        { error: "No Solana wallet is linked to this Privy account." },
        422,
      );
    }

    return json({ address, claimMethod: "privy_embedded" });
  } catch (e) {
    // Invalid/expired token. Privy's docs advise the client to refresh via
    // getAccessToken() and retry, so this is a 401 the client can act on.
    console.warn("Privy token verification failed:", (e as Error).message);
    return json(
      { error: "Your sign-in could not be verified. Please sign in again." },
      401,
    );
  }
}