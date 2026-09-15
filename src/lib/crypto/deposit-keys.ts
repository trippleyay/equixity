import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
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
 * The self-service withdrawal feature is the first code path that needs the
 * private key back: it decrypts the merchant's keypair to sign an outbound
 * USDC transfer. The ciphertext format below is self-describing.
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

/**
 * AES-256-GCM decrypt a payload produced by encryptPayload. Throws on any
 * malformed/forged input (wrong format, bad auth tag) — the auth tag is the
 * integrity guarantee, so tampered ciphertext never yields a keypair.
 */
export function decryptPayload(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed encrypted payload (expected v1:<iv>:<tag>:<ct>).");
  }
  const [version, ivB64, tagB64, ctB64] = parts;
  if (version !== "v1") {
    throw new Error(`Unsupported encrypted payload version: ${version}`);
  }

  const key = encryptionKeyBytes();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Decrypt a stored secret key back to the 64-byte Ed25519 secret. Used ONLY to
 * reconstruct the signing keypair for a merchant's withdrawal — the result is
 * kept in server memory for the duration of the signing call and never
 * returned by any API response.
 */
export function decryptSecretKey(ciphertext: string): Uint8Array {
  return bs58.decode(decryptPayload(ciphertext));
}