import { requireMerchant } from "@/lib/auth/require-merchant";
import {
  getSettings,
  updateSettings,
  validateSettings,
} from "@/lib/services/merchant";
import { jsonError, jsonOk, withApi } from "@/lib/http";

export async function GET() {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    const settings = await getSettings(merchant.id);
    return jsonOk(settings);
  });
}

export async function POST(req: Request) {
  return withApi(async () => {
    const { merchant } = await requireMerchant();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }
    const validated = validateSettings(body);
    if (!validated.ok) {
      return jsonError(
        `Invalid settings: ${validated.issues.join("; ")}`,
        400,
      );
    }
    const saved = await updateSettings(merchant.id, validated.value);
    return jsonOk({ settings: saved });
  });
}