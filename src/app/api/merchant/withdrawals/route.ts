import { requireMerchant } from "@/lib/auth/require-merchant";
import { getBalance } from "@/lib/services/merchant";
import { listWithdrawals } from "@/lib/services/withdrawals";
import {
  executeWithdrawal,
  reconcileWithdrawals,
  FeePayerNotConfiguredError,
  InsufficientFundsError,
  InvalidDestinationError,
} from "@/lib/solana/withdraw";
import { hasFeePayerConfigured } from "@/lib/solana/fee-payer";
import { hasAlchemyRpcConfigured } from "@/lib/solana/connection";
import { validateWithdraw } from "@/lib/validation/withdraw";
import { jsonError, jsonOk, withApi } from "@/lib/http";

/**
 * GET  /api/merchant/withdrawals — list + balance. Also reconciles any rows
 *      stuck in 'submitted' (mirrors poll-on-view funding; no cron).
 * POST /api/merchant/withdrawals — self-service withdrawal: reserve the
 *      balance atomically, sign with the merchant's OWN deposit keypair,
 *      broadcast, and await confirmation. Merchant is always resolved from the
 *      session — never from the request body.
 */
export async function GET() {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    let reconciled = 0;
    if (hasAlchemyRpcConfigured() && hasFeePayerConfigured()) {
      reconciled = await reconcileWithdrawals(merchant.id);
    }
    const withdrawals = await listWithdrawals(merchant.id);
    const balance = await getBalance(merchant.id);
    return jsonOk({ balance, reconciled, withdrawals });
  });
}

export async function POST(req: Request) {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    if (!hasFeePayerConfigured()) {
      return jsonError(
        "Withdrawals are disabled (FEE_PAYER_SECRET_KEY is unset).",
        503,
      );
    }
    if (!hasAlchemyRpcConfigured()) {
      return jsonError(
        "Withdrawals are disabled (ALCHEMY_SOLANA_RPC_URL is unset).",
        503,
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const validated = validateWithdraw(body);
    if (!validated.ok) {
      return jsonError(
        `Invalid withdrawal: ${validated.issues.join("; ")}`,
        400,
      );
    }

    let amount: bigint;
    try {
      amount = BigInt(validated.value.amount_usdc_units);
    } catch {
      return jsonError("amount_usdc_units is not a valid integer.", 400);
    }

    try {
      const result = await executeWithdrawal(
        merchant.id,
        amount,
        validated.value.destination_address,
      );
      return jsonOk(result);
    } catch (e) {
      if (e instanceof InvalidDestinationError) return jsonError(e.message, 400);
      if (e instanceof InsufficientFundsError) return jsonError(e.message, 409);
      if (e instanceof FeePayerNotConfiguredError) return jsonError(e.message, 503);
      throw e; // signing/internal errors -> 500 (withApi)
    }
  });
}