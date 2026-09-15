import { NextResponse } from "next/server";
import { UnauthorizedError } from "@/lib/auth/require-merchant";

/**
 * Tiny helpers for API route handlers. Every response is no-store: auth-cookie
 * refreshing happens in the proxy, and no-store prevents a CDN from caching one
 * user's sessioned response for another (see @supabase/ssr caching guidance).
 */
export function jsonOk(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Wraps a handler so auth errors become 401s, anything else a 500. */
export function withApi(
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return handler().catch((e: unknown) => {
      if (e instanceof UnauthorizedError) return jsonError("Unauthorized", 401);
      console.error("API route error:", e);
      return jsonError("Internal error", 500);
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return Promise.resolve(jsonError("Unauthorized", 401));
    console.error("API route error:", e);
    return Promise.resolve(jsonError("Internal error", 500));
  }
}