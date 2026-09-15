import { requireMerchant } from "@/lib/auth/require-merchant";
import { listRewards, totalRewardsIssued } from "@/lib/services/merchant";
import { jsonOk, withApi } from "@/lib/http";

export async function GET() {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    const events = await listRewards(merchant.id);
    const totals = await totalRewardsIssued(merchant.id);
    // Empty, correctly-shaped rewards activity for this build (spec section 10).
    return jsonOk({ events, totals });
  });
}