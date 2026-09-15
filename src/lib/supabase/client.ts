import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser client (@supabase/ssr). Used inside `"use client"` components for
 * signing up / signing in / signing out. The session is stored in cookies so a
 * subsequent server-rendered request can read the same session.
 */
export function createClient(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}