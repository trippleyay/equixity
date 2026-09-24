/**
 * Customer session: resolve a Privy token to a Solana wallet address, SERVER-SIDE.
 *
 * This is the single source of truth for "who is this customer", shared by the
 * holdings read and both transfer legs. The logic is the one already proven in
 * /api/public/privy-wallet:
 *
 *   * the ACCESS token proves the caller IS that Privy user (ES256 JWT, verified
 *     with Privy's own `verifyAccessToken`);
 *   * the IDENTITY token both verifies AND returns the user object including
 *     linked wallets, which the access token alone does not carry, per Privy's
 *     own documentation;
 *   * the Solana address is read from that response, never from the request body.
 *
 * That last point is the whole security property: the browser is never the
 * trusted source of whose wallet this is, so there is no parameter a caller could
 * tamper with to read or move someone else's assets.
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

  try {
    if (accessToken) {
      await privy.utils().auth().verifyAccessToken(accessToken);
    }
    if (!idToken) {
      return { error: "Please sign in again.", status: 401 };
    }

    const user = await privy.users().get({ id_token: idToken });
    const address = solanaAddressFromUser(user);
    if (!address) {
      return { error: "No wallet is linked to this account yet.", status: 422 };
    }
    return { address };
  } catch (e) {
    console.warn("Customer session verification failed:", (e as Error).message);
    return { error: "Your sign-in could not be verified. Please sign in again.", status: 401 };
  }
}
