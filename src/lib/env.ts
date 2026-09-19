/**
 * Central place for reading env vars for the Equixity merchant MVP.
 *
 * SECURITY RULE (spec section 3): anything with a NEXT_PUBLIC_ prefix ships to
 * the browser bundle. The Supabase service-role key, the Alchemy RPC key and the
 * AES key used to encrypt merchant deposit private keys must NEVER carry that
 * prefix and must only be read in server-side code (this module, imported only
 * by server-only modules).
 *
 * This module is server-only by construction: it is never imported from a
 * `"use client"` component.
 */

export const env = {
  // Public (safe for the browser): project URL + publishable/anon key.
  nextPublicSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  nextPublicSupabasePublishableKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",

  // Public: base origin used to build the SDK snippet (spec section 6; env
  // driven so a local/preview deploy produces a working snippet).
  nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",

  // Server-only. SUPABASE_URL is the spec-preferred name; fall back to the
  // NEXT_PUBLIC one when only that is set (they are equal in a single project).
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  // Server-only.
  alchemyRpcUrl: process.env.ALCHEMY_SOLANA_RPC_URL ?? "",

  // Server-only. Hex-encoded 32-byte AES-256 key.
  depositKeyEncryptionSecret: process.env.DEPOSIT_KEY_ENCRYPTION_SECRET ?? "",

  // Server-only. Base58-encoded 64-byte Ed25519 secret key for the Equixity
  // fee-payer wallet. Pays only the SOL transaction fee (and, when a
  // destination has never held USDC, the one-time ATA rent) on withdrawals —
  // it must never hold transfer authority over any merchant's USDC.
  feePayerSecretKey: process.env.FEE_PAYER_SECRET_KEY ?? "",

  // Server-only. Jupiter Swap API key (api.jup.ag/swap/v1). Required — the
  // current Swap API needs an x-api-key header, including on the free tier.
  jupiterApiKey: process.env.JUPITER_API_KEY ?? "",

  // Privy: the app id ships to the browser by design (the client SDK needs it);
  // the app secret is server-only and used to verify access tokens.
  nextPublicPrivyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "",
  privyAppSecret: process.env.PRIVY_APP_SECRET ?? "",

  // Server-only. Bearer secret required by the asset-sync endpoint, which an
  // external scheduler (GitHub Actions) calls on a 5-minute cadence — Vercel's
  // Hobby cron is limited to once per day, so it cannot drive that schedule.
  cronSecret: process.env.CRON_SECRET ?? "",

  // Server-only. Upstash Redis for rate limiting the two public endpoints
  // (spec section 7).
  upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL ?? "",
  upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
};