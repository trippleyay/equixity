import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /auth/signout — clears the session and lands the merchant back on the
 * public landing page. Response headers force revalidation so browser-back
 * after signing out serves a fresh (logged-out) render, not a cached one.
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://equixity.vercel.app";
  const res = NextResponse.redirect(new URL("/", base), 302);
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}