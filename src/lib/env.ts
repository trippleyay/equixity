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
};