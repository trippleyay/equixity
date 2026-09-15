import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/confirm — email-confirmation callback.
 *
 * Email confirmation is OFF for this build (spec section 10's flow is
 * "sign up → land in dashboard"). This route exists so the "confirm email"
 * toggle can later be flipped back ON without a code change: it exchanges the
 * token_hash the confirmation link carries for a session and lands the user in
 * the dashboard. On failure it redirects to /login?error=invalid_link.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type") ?? "email";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!tokenHash) {
    const dest = new URL("/login", base);
    dest.searchParams.set("error", "missing_token");
    return NextResponse.redirect(dest, 302);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    const dest = new URL("/login", base);
    dest.searchParams.set("error", "invalid_link");
    return NextResponse.redirect(dest, 302);
  }

  return NextResponse.redirect(new URL("/dashboard", base), 302);
}