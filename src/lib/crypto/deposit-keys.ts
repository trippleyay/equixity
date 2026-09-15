import { createCipheriv, randomBytes } from "node:crypto";
import bs58 from "bs58";
import { env } from "@/lib/env";

/**
 * Deposit key encryption — SERVER-ONLY (imports node:crypto and reads the
 * server-only DEPOSIT_KEY_ENCRYPTION_SECRET env var).
 *
 * Each merchant gets a fresh Solana keypair at provisioning time. The public
 * key is the merchant's deposit address (shown in the dashboard). The private
 * key is encrypted at rest with AES-256-GCM and is NEVER returned by any API
 * response, ever (spec section 8).
 *
 * Per the confirmed decision, this build is ENCRYPT-ONLY: nothing in this phase
 * signs transactions or needs to decrypt, so we deliberately ship no decrypt
 * path (no untested decryption code). The ciphertext format below is
 * self-describing so a later phase can add decrypt when sweep/claim-time swap
 * is implemented.
 *
 * Format:  v1:<iv b64>:<GCM auth tag b64>:<ciphertext b64>
 */

function encryptionKeyBytes(): Buffer {
  const hex = env.depositKeyEncryptionSecret;
  if (!hex) {
    throw new Error(
      "DEPOSIT_KEY_ENCRYPTION_SECRET is not set (server-only env var).",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "DEPOSIT_KEY_ENCRYPTION_SECRET must be a 32-byte key as 64 hex chars.",
    );
  }
  return key;
}

/** AES-256-GCM encrypt an arbitrary string payload. */
export function encryptPayload(payload: string): string {
  const key = encryptionKeyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(payload, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/**
 * Encrypt a merchant's 64-byte Ed25519 secret key. Stored as the base58
 * encoding of the full 64-byte secret key (Solana's convention, and what
 * `Keypair.fromSecretKey` expects), matching how a future sweep/swap phase
 * would reconstruct the keypair.
 */
export function encryptSecretKey(secretKey: Uint8Array): string {
  return encryptPayload(bs58.encode(secretKey));
}