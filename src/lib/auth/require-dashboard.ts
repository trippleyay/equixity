import { redirect } from "next/navigation";
import {
  requireMerchant,
  UnauthorizedError,
  type MerchantContext,
} from "@/lib/auth/require-merchant";

/**
 * Server-side auth guard for dashboard pages and the dashboard layout: resolves
 * + provisions the merchant, redirecting to /login when not signed in. Throw
 * any other error upward.
 */
export async function requireDashboardMerchant(): Promise<MerchantContext> {
  try {
    return await requireMerchant();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/login");
    throw e;
  }
}