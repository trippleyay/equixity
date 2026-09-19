import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncRewardAssets } from "@/lib/assets/sync";

export const dynamic = "force-dynamic";

/**
 * Asset catalog sync trigger (spec section 3).
 *
 * Called on a 5-minute schedule by an EXTERNAL scheduler (GitHub Actions
 * workflow), not by Vercel Cron: Vercel's Hobby plan limits cron jobs to once
 * per day, and a five-minute cron expression FAILS DEPLOYMENT on Hobby, so
 * Vercel's own cron cannot drive the required cadence. The route is identical
 * either way, which is why the schedule lives outside the app rather than in it.
 *
 * Gated on CRON_SECRET (bearer), so it is not a publicly triggerable endpoint.
 * Vercel's own cron, if ever used, sends the same Authorization: Bearer
 * <CRON_SECRET> header, so this works unchanged for both.
 */
export const maxDuration = 60; // Hobby's maximum function duration.

function isAuthorized(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await syncRewardAssets();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("Asset sync failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Asset sync failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}