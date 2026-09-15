import { requireMerchant } from "@/lib/auth/require-merchant";
import { getBalance } from "@/lib/services/merchant";
import { jsonOk, withApi } from "@/lib/http";

export async function GET() {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    const availableUsdcUnits = await getBalance(merchant.id);
    // bigint travels as a decimal string — never a JS number (spec: no floats).
    return jsonOk({ available_usdc_units: availableUsdcUnits });
  });
}