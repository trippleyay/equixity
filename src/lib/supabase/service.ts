import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Admin (service-role) client. SERVER-ONLY — the service-role key bypasses RLS,
 * so this must never be imported by or exposed to the browser.
 *
 * Used for anything the spec routes through the server side of the app:
 * the API route handlers and the dashboard server components. Every use still
 * derives the merchant from the authenticated session via requireMerchant(),
 * never from a client-supplied merchant ID.
 */
let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  if (!env.supabaseUrl || !env.serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. These must be " +
        "server-only env vars (no NEXT_PUBLIC_ prefix).",
    );
  }
  cached = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cached;
}