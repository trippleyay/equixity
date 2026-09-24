/**
 * POST /api/customer/transfer — leg 1: build a transfer for the customer to sign.
 *
 * Auth is a Privy token resolved server-side (lib/auth/customer-session), so the
 * source wallet is never a client-supplied value.
 *
 * The asset is selected by rewardEventId rather than by ticker or mint, because
 * a delivered reward is the unit of ownership here: the customer's own token
 * balance for that mint is read from the chain, and a claim that was never
 * delivered to THIS wallet is refused. That prevents a customer from naming an
 * asset they were never sent, and ties the outgoing transfer back to the reward
 * that produced it.
 *
 * What this leg does NOT do is broadcast anything. It validates, records the
 * `pending` row, and returns a transaction the server has signed ONLY as fee
 * payer. The customer co-signs it as the owner through Privy in their browser,
 * then posts the signed bytes back to /api/customer/transfer/submit.
 */

import { NextResponse } from "next/server";
import { ipAddress } from "@vercel/functions";
import { resolveCustomerWallet } from "@/lib/auth/customer-session";
import { checkCustomerTransferRateLimit, clientIp } from "@/lib/rate-limit";
import {
  createCustomerTransfer,
  markTransferFailed,
  type CustomerTransferRow,
} from "@/lib/services/customer-wallet";
import {
  buildCustomerTransfer,
  getCustomerTokenBalance,
  InsufficientHoldingsError,
  InvalidAmountError,
  parseDestinationAddress,
  toRawBaseUnits,
} from "@/lib/solana/customer-transfer";
import { getServiceClient } from "@/lib/supabase/service";
import { cleanMessage } from "@/lib/text/sanitize";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** The customer's own DELIVERED claim for one reward, or null. */
async function findDeliveredHolding(
  walletAddress: string,
  rewardEventId: string,
): Promise<{ rewardEventId: string; mint: string; decimals: number; ticker: string } | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("reward_claims")
    .select(
      "reward_event_id, reward_events(reward_assets(ticker, mint_address, decimals))",
    )
    .eq("customer_wallet_address", walletAddress)
    .eq("status", "delivered")
    .eq("reward_event_id", rewardEventId)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as {
    reward_event_id: string;
    reward_events: {
      reward_assets: {
        ticker: string;
        mint_address: string;
        decimals: number;
      } | { ticker: string; mint_address: string; decimals: number }[] | null;
    } | null;
  };
  const asset = Array.isArray(row.reward_events?.reward_assets)
    ? row.reward_events?.reward_assets[0]
    : row.reward_events?.reward_assets;
  if (!asset) return null;

  return {
    rewardEventId: row.reward_event_id,
    mint: asset.mint_address,
    decimals: asset.decimals,
    ticker: asset.ticker,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const limit = await checkCustomerTransferRateLimit(clientIp(req, ipAddress));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
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

  // The session resolver consumes the body, so the raw body is read once here
  // and both the tokens and the transfer parameters come from the same parse.
  const rawBody = await req.text();
  let parsed: Record<string, unknown> = {};
  try {
    const v = JSON.parse(rawBody);
    if (v && typeof v === "object") parsed = v as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const session = await resolveCustomerWallet(parsed);
  if ("error" in session) return json({ error: session.error }, session.status);

  const rewardEventId =
    typeof parsed.rewardEventId === "string" ? parsed.rewardEventId.trim() : "";
  const amountInput =
    typeof parsed.amount === "string" ? parsed.amount.trim() : "";
  const destinationInput =
    typeof parsed.destination === "string" ? parsed.destination.trim() : "";

  if (!rewardEventId || !amountInput || !destinationInput) {
    return json({ error: "Choose what to send, how much, and where to." }, 400);
  }

  // Destination is validated BEFORE any row is written or RPC is touched, so an
  // invalid address never creates a stray transfer row.
  let destination;
  try {
    destination = parseDestinationAddress(destinationInput);
  } catch (e) {
    return json({ error: cleanMessage((e as Error).message, "Invalid address.") }, 400);
  }
  if (destination.toBase58() === session.address) {
    return json({ error: "That is your own wallet." }, 400);
  }

  const holding = await findDeliveredHolding(session.address, rewardEventId);
  if (!holding) {
    return json({ error: "That reward is not in this wallet." }, 404);
  }

  let rawAmount: bigint;
  try {
    rawAmount = await toRawBaseUnits(holding.mint, amountInput);
  } catch {
    return json({ error: "Enter a valid amount." }, 400);
  }
  if (rawAmount <= 0n) {
    return json({ error: "Enter an amount greater than zero." }, 400);
  }

  const held = await getCustomerTokenBalance(session.address, holding.mint);
  if (rawAmount > held) {
    return json(
      { error: "You do not hold that much of this asset." },
      400,
    );
  }

  let row: CustomerTransferRow;
  try {
    row = await createCustomerTransfer({
      walletAddress: session.address,
      rewardEventId: holding.rewardEventId,
      assetTicker: holding.ticker,
      assetMint: holding.mint,
      assetDecimals: holding.decimals,
      amountRawBaseUnits: rawAmount,
      destinationAddress: destination.toBase58(),
    });
  } catch (e) {
    console.error("Customer transfer row failed:", (e as Error).message);
    return json({ error: "We could not start that transfer. Please try again." }, 500);
  }

  try {
    const built = await buildCustomerTransfer({
      customerWallet: session.address,
      mintAddress: holding.mint,
      assetDecimals: holding.decimals,
      amountRawBaseUnits: rawAmount,
      destination,
    });
    return json({
      transferId: row.id,
      serializedTransaction: built.serializedTransaction,
      destination: row.destination_address,
    });
  } catch (e) {
    // The row exists as `pending` and nothing was broadcast, so it goes straight
    // to a terminal `failed` with the reason. It is never left dangling.
    const message = cleanMessage((e as Error).message, "We could not build that transfer.");
    await markTransferFailed(row.id, message);
    if (e instanceof InsufficientHoldingsError) return json({ error: message }, 400);
    if (e instanceof InvalidAmountError) return json({ error: message }, 400);
    console.error("Customer transfer build failed:", (e as Error).message);
    return json({ error: "We could not build that transfer. Please try again." }, 500);
  }
}


