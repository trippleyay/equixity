/**
 * POST /api/customer/transfer/submit — leg 2: broadcast the signed transfer.
 *
 * The browser took the fee-payer-signed transaction from /api/customer/transfer,
 * had Privy co-sign it as the owner in the customer's wallet, and posts the
 * fully-signed bytes back here. The server broadcasts and drives the row to a
 * terminal state.
 *
 * Auth is the same Privy session, and the row is checked to belong to THAT
 * wallet: a customer cannot submit another customer's transfer id, because the
 * lookup is scoped by `customer_wallet_address` as well as the id.
 *
 * The signature is verified as belonging to the customer's own wallet before
 * anything is broadcast, so a tampered or replayed payload cannot move tokens
 * out of a wallet the caller does not control. Broadcast failures move the row to
 * `failed` with the reason; nothing is refunded because nothing was reserved.
 */

import { NextResponse } from "next/server";
import { ipAddress } from "@vercel/functions";
import { PublicKey, Transaction } from "@solana/web3.js";
import { resolveCustomerWallet } from "@/lib/auth/customer-session";
import { checkCustomerTransferRateLimit, clientIp } from "@/lib/rate-limit";
import {
  getCustomerTransfer,
  markTransferConfirmed,
  markTransferFailed,
  markTransferSubmitted,
} from "@/lib/services/customer-wallet";
import { broadcastCustomerTransfer } from "@/lib/solana/customer-transfer";
import { cleanMessage } from "@/lib/text/sanitize";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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

  let parsed: Record<string, unknown>;
  try {
    const v = await req.json();
    parsed = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const session = await resolveCustomerWallet(parsed);
  if ("error" in session) return json({ error: session.error }, session.status);

  const transferId =
    typeof parsed.transferId === "string" ? parsed.transferId.trim() : "";
  const signed =
    typeof parsed.signedTransaction === "string" ? parsed.signedTransaction.trim() : "";
  if (!transferId || !signed) {
    return json({ error: "That transfer is incomplete. Please try again." }, 400);
  }

  const row = await getCustomerTransfer(transferId);
  // Scoped by wallet as well as id: one customer cannot submit another's row.
  if (!row || row.customer_wallet_address !== session.address) {
    return json({ error: "That transfer was not found." }, 404);
  }
  if (row.status === "confirmed") {
    return json({ status: "confirmed", signature: row.transfer_signature });
  }
  if (row.status !== "pending") {
    return json({ error: "That transfer can no longer be submitted." }, 409);
  }

  // The transaction must be signed by the customer's own wallet.
  let transaction: Transaction;
  try {
    transaction = Transaction.from(Buffer.from(signed, "base64"));
  } catch {
    await markTransferFailed(row.id, "The signed transfer could not be read.");
    return json({ error: "That transfer could not be read. Please try again." }, 400);
  }

  const customer = new PublicKey(session.address);
  const signedByCustomer = transaction.signatures.some((sig) =>
    sig.publicKey.equals(customer),
  );
  if (!signedByCustomer) {
    await markTransferFailed(row.id, "The transfer was not signed by this wallet.");
    return json({ error: "Please approve the transfer in your wallet first." }, 400);
  }

  let signature: string;
  try {
    signature = await broadcastCustomerTransfer(signed);
  } catch (e) {
    const message = cleanMessage(
      (e as Error).message,
      "The transfer could not be completed.",
    );
    await markTransferFailed(row.id, message);
    return json({ error: "The transfer did not go through. Nothing was sent." }, 400);
  }

  // pending -> submitted -> confirmed. Both steps are guarded on the previous
  // status, so a double submit cannot move a confirmed row backwards.
  const movedToSubmitted = await markTransferSubmitted(row.id, signature);
  if (!movedToSubmitted) {
    return json({ status: row.status, signature: row.transfer_signature });
  }
  await markTransferConfirmed(row.id, signature);

  return json({ status: "confirmed", signature });
}
