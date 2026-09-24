/**
 * POST /api/customer/holdings — what one customer's wallet holds.
 *
 * WHY POST AND NOT GET: this route needs the customer's Privy tokens, and a
 * bearer token in a query string ends up in URLs, browser history, proxy logs
 * and referrer headers. They travel in the body instead, exactly as they do for
 * both transfer legs. The method is also load-bearing: this route previously
 * exported GET only while the wallet page posted to it, so every signed-in
 * customer got a 405 with an empty body and the page showed the generic
 * "We could not load your rewards." A method mismatch is invisible in a
 * typecheck and only ever shows up in a browser.
 *
 * Auth is a Privy token, resolved SERVER-SIDE to a Solana address through the
 * same verified path as /api/public/privy-wallet. There is deliberately NO
 * wallet address parameter: a caller can only ever read their OWN holdings, so
 * there is no way to ask about someone else's wallet by passing a different
 * address. The browser is never the trusted source of whose wallet this is.
 *
 * Holdings are the customer's DELIVERED rewards joined to the asset catalog,
 * with the displayed amount read from the LIVE on-chain token balance so a
 * transfer they have since made is reflected. A claim whose chain read fails is
 * still listed, flagged with a zero amount, rather than silently disappearing.
 */
import { NextResponse } from "next/server";
import { ipAddress } from "@vercel/functions";
import { listCustomerHoldings } from "@/lib/services/customer-wallet";
import { getCustomerTokenBalance, toDisplayAmount } from "@/lib/solana/customer-transfer";
import { checkCustomerHoldingsRateLimit, clientIp } from "@/lib/rate-limit";
import { resolveCustomerWallet } from "@/lib/auth/customer-session";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const noStore = { "Cache-Control": "no-store" };

  const limit = await checkCustomerHoldingsRateLimit(clientIp(req, ipAddress));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      {
        status: 429,
        headers: {
          ...noStore,
          ...(limit.retryAfterSeconds
            ? { "Retry-After": String(limit.retryAfterSeconds) }
            : {}),
        },
      },
    );
  }

  const session = await resolveCustomerWallet(req);
  if ("error" in session) {
    return NextResponse.json({ error: session.error }, { status: session.status, headers: noStore });
  }

  let holdings;
  try {
    holdings = await listCustomerHoldings(session.address);
  } catch (e) {
    console.error("Customer holdings read failed:", (e as Error).message);
    return NextResponse.json(
      { error: "We could not load your rewards just now. Please try again." },
      { status: 500, headers: noStore },
    );
  }

  // The on-chain balance is the truth about what they hold. Read it per mint;
  // one failing read must not take the whole page down, so it degrades to a zero
  // amount with a flag rather than an error.
  const withBalances = await Promise.all(
    holdings.map(async (h) => {
      try {
        const raw = await getCustomerTokenBalance(session.address, h.assetMint);
        const display = await toDisplayAmount(h.assetMint, raw);
        return {
          rewardEventId: h.rewardEventId,
          ticker: h.assetTicker,
          displayName: h.assetDisplayName,
          logoUrl: h.assetLogoUrl,
          amount: display,
          amountUsd: h.amountUsd,
          merchantName: h.merchantName,
          deliveredAt: h.deliveredAt,
          balanceReadable: true,
        };
      } catch {
        return {
          rewardEventId: h.rewardEventId,
          ticker: h.assetTicker,
          displayName: h.assetDisplayName,
          logoUrl: h.assetLogoUrl,
          amount: null,
          amountUsd: h.amountUsd,
          merchantName: h.merchantName,
          deliveredAt: h.deliveredAt,
          balanceReadable: false,
        };
      }
    }),
  );

  return NextResponse.json(
    { address: session.address, holdings: withBalances },
    { headers: noStore },
  );
}
