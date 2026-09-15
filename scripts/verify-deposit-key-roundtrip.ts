/**
 * verify-deposit-key-roundtrip.ts
 *
 * Committed manual check for the ONE code path that moves real money's signing
 * key back out of the DB: decrypting a merchant's encrypted deposit key and
 * reconstructing the exact Solana keypair it was generated from.
 *
 * It pulls one real provisioned merchant_deposit_accounts row from the live
 * project, decrypts encrypted_private_key with the server's AES key, rebuilds
 * the keypair via Keypair.fromSecretKey, and asserts the derived public key
 * equals the stored deposit_address. A mismatch, a bad auth tag, or a missing
 * .env.local value exits non-zero.
 *
 * Run (loads .env.local, so never on CI / never with real prod secrets in
 * plaintext):
 *   node_modules/.bin/tsx scripts/verify-deposit-key-roundtrip.ts
 */
import fs from "node:fs";

function loadDotEnvLocal(file: string): void {
  const src = fs.readFileSync(file, "utf8");
  for (const line of src.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(?:"(.*)"|(\S.*))?\s*$/);
    if (!m) continue;
    const key = m[1];
    const value = (m[2] ?? m[3] ?? "").trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// Load .env.local BEFORE importing modules that read process.env.
if (fs.existsSync(".env.local")) loadDotEnvLocal(".env.local");

async function main(): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const { Keypair } = await import("@solana/web3.js");
  const { decryptSecretKey } = await import("../src/lib/crypto/deposit-keys");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasEncKey = Boolean(process.env.DEPOSIT_KEY_ENCRYPTION_SECRET);
  if (!url || !key || !hasEncKey) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DEPOSIT_KEY_ENCRYPTION_SECRET in .env.local",
    );
  }

  const service = createClient(url, key, { auth: { persistSession: false } });

  // Any real provisioned row proves the round trip; the script only needs one.
  const { data, error } = await service
    .from("merchant_deposit_accounts")
    .select("merchant_id, deposit_address, encrypted_private_key")
    .limit(10);
  if (error) throw new Error(`Query failed: ${error.message}`);
  const row = (data ?? []).find(
    (r) => r.encrypted_private_key && r.encrypted_private_key.length > 0,
  );
  if (!row) throw new Error("No provisioned merchant_deposit_accounts row found.");

  const secret = decryptSecretKey(row.encrypted_private_key);
  const kp = Keypair.fromSecretKey(secret);
  const derived = kp.publicKey.toBase58();

  if (derived !== row.deposit_address) {
    throw new Error(
      `ROUNDTRIP MISMATCH for merchant=${row.merchant_id}: ` +
        `stored=${row.deposit_address} derived=${derived}`,
    );
  }

  console.log(
    `PASS merchant=${row.merchant_id} deposit_address=${row.deposit_address} derived=${derived}`,
  );
  console.log("Decrypt -> Keypair.fromSecretKey -> public key matches deposit_address.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`FAIL ${(e as Error).message}`);
    process.exit(1);
  },
);