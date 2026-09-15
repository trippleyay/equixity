import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 "proxy" (the successor to middleware.ts) — Supabase's current
 * App Router server-side auth pattern. Runs once per navigation to refresh the
 * Supabase session and write refreshed auth cookies + cache-busting headers.
 *
 * No authorization logic lives here; pages/routes gate themselves via
 * requireMerchant().
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher:
    "/((?!_next/static|_next/image|favicon.ico|equixity\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
};