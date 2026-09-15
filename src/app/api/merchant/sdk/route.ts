import { requireMerchant } from "@/lib/auth/require-merchant";
import { getSdkSnippet } from "@/lib/services/merchant";
import { jsonOk, withApi } from "@/lib/http";

export async function GET() {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    // Snippet carries only the merchant's public_id (spec sections 2 & 6).
    return jsonOk({ snippet: getSdkSnippet(merchant.public_id) });
  });
}