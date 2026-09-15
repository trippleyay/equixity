import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Server client (@supabase/ssr). Reads the same cookies the browser client
 * wrote, so a server-rendered request sees the authenticated session.
 *
 * @supabase/ssr, NOT the deprecated @supabase/auth-helpers-* packages
 * (spec section 3). Must be created fresh per request — never cache it across
 * requests, or the token-refresh Set-Cookie headers would be lost for later
 * requests.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component. Can be ignored if the session is
            // being refreshed by the proxy (see src/proxy.ts).
          }
        },
      },
    },
  );
}