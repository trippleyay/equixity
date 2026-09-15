import { requireMerchant } from "@/lib/auth/require-merchant";
import { syncFunding } from "@/lib/solana/sync-deposits";
import { jsonError, jsonOk, withApi } from "@/lib/http";
import { hasAlchemyRpcConfigured } from "@/lib/solana/connection";

/**
 * GET /api/merchant/funding — poll-on-view deposit detection (spec section 5).
 * Synchronizes the merchant's deposit address against chain data, credits any
 * new confirmed USDC transfers, then returns the updated balance + history.
 * Same logic powers a page load and the "Check for new deposits" button.
 */
export async function GET() {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    if (!hasAlchemyRpcConfigured()) {
      return jsonError(
        "Funding sync is not configured (ALCHEMY_SOLANA_RPC_URL is unset).",
        503,
      );
    }
    const result = await syncFunding(merchant.id);
    return jsonOk(result);
  });
}