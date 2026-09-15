import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { env } from "@/lib/env";

/**
 * The Equixity-controlled fee-payer wallet. SERVER-ONLY.
 *
 * It pays the SOL transaction fee on every withdrawal (and, when a merchant
 * withdraws to a destination that has never held USDC, the one-time rent for
 * creating that destination's token account). It is deliberately a SEPARATE
 * keypair from every merchant's deposit account: it must never have transfer
 * authority over any merchant's USDC. Worst case if compromised: someone
 * drains a small SOL balance — never a merchant holding.
 *
 * The secret is a server-only env var (FEE_PAYER_SECRET_KEY), base58 encoding
 * of the full 64-byte Ed25519 secret key, matching how deposit keys are
 * stored. Custody risk is low by design, so the plaintext-in-env placement is
 * consistent with the other server-wide secrets (service-role key, Alchemy
 * RPC key, DEPOSIT_KEY_ENCRYPTION_SECRET).
 */
let cached: Keypair | null = null;

export function getFeePayerKeypair(): Keypair {
  if (cached) return cached;
  if (!env.feePayerSecretKey) {
    throw new Error("FEE_PAYER_SECRET_KEY is not set (server-only env var).");
  }
  cached = Keypair.fromSecretKey(bs58.decode(env.feePayerSecretKey));
  return cached;
}

export function hasFeePayerConfigured(): boolean {
  return env.feePayerSecretKey.length > 0 && !env.feePayerSecretKey.match(/^\s*$/);
}