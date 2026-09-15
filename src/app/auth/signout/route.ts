import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST /auth/signout — signs the merchant out and lands them at /login. */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(new URL("/login", base), 302);
}