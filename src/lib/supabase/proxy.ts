import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * The Next.js 16 "proxy" pattern (the successor to middleware.ts) from
 * Supabase's current Next.js server-side auth guide. It runs on every matched
 * request, refreshes an expired Supabase session exactly once per navigation,
 * and writes the refreshed auth cookies onto the response.
 *
 * Two things are copied onto the response:
 *   1. the refreshed auth cookies, and
 *   2. the cache-busting headers @supabase/ssr provides (Cache-Control,
 *      Expires, Pragma). Skipping the headers lets a CDN serve one user's
 *      session to another — the @supabase/ssr docs are explicit about this.
 *
 * No authorization logic lives here (see requireMerchant in lib/auth).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          for (const [key, value] of Object.entries(headers)) {
            supabaseResponse.headers.set(key, value);
          }
        },
      },
    },
  );

  // Trigger a session refresh here if the access token is expired, before any
  // page code runs. Do not gate on it — pages/routes do their own auth checks.
  await supabase.auth.getClaims();

  return supabaseResponse;
}