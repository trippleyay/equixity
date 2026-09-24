/**
 * verify-reward-swap-rent.ts
 *
 * Committed manual check for the rent payer on the reward swap's first leg.
 *
 * WHY IT EXISTS: this leg failed live with a customer-facing "the swap did not
 * confirm" that was wrong in every particular. The transaction HAD confirmed; it
 * failed on chain, and the chain said exactly why:
 *
 *   Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL invoke [1]
 *   Program log: CreateIdempotent
 *   Transfer: insufficient lamports 0, need 1559560
 *   Program 11111111111111111111111111111111 failed: custom program error: 0x1
 *
 * Jupiter's setup instruction named the merchant's deposit wallet as the payer
 * for the asset's token account rent, and that wallet holds USDC and no SOL by
 * design. `withFeePayerPayingAtaRent` repoints that one account at the fee payer.
 *
 * This script proves the fix against the LIVE route, sending nothing:
 *
 *   A) the instructions as Jupiter returns them (what used to be broadcast);
 *   B) the same instructions through the real `withFeePayerPayingAtaRent`, which
 *      is what the executor now sends.
 *
 * It exits non-zero unless B simulates clean, so a regression that puts the rent
 * back on the merchant fails this check instead of failing a customer's claim.
 *
 * Read-only: simulateTransaction only. Nothing is signed or sent.
 *
 * Run (loads .env.local, so never on CI):
 *   npm run verify:reward-swap-rent
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

const MERCHANT_ID = "e08da8d7-2ee9-4b14-9ad6-e291553c691e";
const TICKER = "AAPLx";
const USDC_UNITS = 25000n; // the amount that failed live

async function main(): Promise<void> {
  const { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } =
    await import("@solana/web3.js");
  const bs58 = (await import("bs58")).default;
  const { createClient } = await import("@supabase/supabase-js");
  const {
    quoteUsdcToAsset,
    buildSwapInstructions,
    toTransactionInstruction,
    withFeePayerPayingAtaRent,
  } = await import("../src/lib/solana/jupiter");
  const { describeFailureSignature } = await import("../src/lib/solana/withdraw");

  const connection = new Connection(process.env.ALCHEMY_SOLANA_RPC_URL ?? "", "confirmed");
  const feePayerSecret = process.env.FEE_PAYER_SECRET_KEY;
  if (!feePayerSecret) throw new Error("FEE_PAYER_SECRET_KEY is not set");
  const feePayer = Keypair.fromSecretKey(bs58.decode(feePayerSecret));

  const service = createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );
  const { data: deposit, error: depositError } = await service
    .from("merchant_deposit_accounts")
    .select("deposit_address")
    .eq("merchant_id", MERCHANT_ID)
    .single();
  if (depositError || !deposit) {
    throw new Error(`No deposit account for merchant: ${depositError?.message}`);
  }
  const { data: asset, error: assetError } = await service
    .from("reward_assets")
    .select("mint_address")
    .eq("ticker", TICKER)
    .single();
  if (assetError || !asset) throw new Error(`No asset ${TICKER}: ${assetError?.message}`);

  const merchant = new PublicKey(deposit.deposit_address as string);
  console.log(`fee payer            ${feePayer.publicKey.toBase58()}`);
  console.log(`  balance            ${(await connection.getBalance(feePayer.publicKey)) / 1e9} SOL`);
  console.log(`merchant deposit     ${merchant.toBase58()}`);
  console.log(`  balance            ${(await connection.getBalance(merchant)) / 1e9} SOL`);
  console.log(`asset                ${TICKER} ${asset.mint_address as string}`);
  console.log(`amount               ${USDC_UNITS.toString()} USDC base units\n`);

  const quote = await quoteUsdcToAsset({
    outputMint: asset.mint_address as string,
    usdcAmountUnits: USDC_UNITS,
  });
  const built = await buildSwapInstructions({
    userPublicKey: merchant.toBase58(),
    quote,
  });
  const raw = [
    ...(built.computeBudgetInstructions ?? []),
    ...(built.setupInstructions ?? []),
    ...(built.otherInstructions ?? []),
    built.swapInstruction,
    ...(built.cleanupInstruction ? [built.cleanupInstruction] : []),
  ].map(toTransactionInstruction);

  type Ix = (typeof raw)[number];

  async function simulate(
    label: string,
    instructions: Ix[],
  ): Promise<{ err: unknown }> {
    const latest = await connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: feePayer.publicKey,
      recentBlockhash: latest.blockhash,
      instructions,
    }).compileToV0Message();
    const result = await connection.simulateTransaction(
      new VersionedTransaction(message),
      { sigVerify: false, replaceRecentBlockhash: true },
    );
    const logs = result.value.logs ?? [];
    const decisive =
      logs.find((line) => /insufficient lamports/i.test(line)) ??
      logs
        .filter((line) =>
          /insufficient|Transfer:|custom program error|failed/i.test(line),
        )
        .slice(-1)[0] ??
      null;
    console.log(label);
    console.log(`  err                ${JSON.stringify(result.value.err)}`);
    console.log(`  unitsConsumed      ${result.value.unitsConsumed ?? "-"}`);
    if (decisive) console.log(`  decisive log       ${decisive}`);
    console.log("");
    return { err: result.value.err };
  }

  const before = await simulate("A. as Jupiter returns them (rent on the merchant)", raw);
  const after = await simulate(
    "B. through withFeePayerPayingAtaRent (what the executor sends)",
    withFeePayerPayingAtaRent(raw, feePayer.publicKey),
  );

  // The historical failure, read back through the helper that now records it.
  const { data: failed } = await service
    .from("reward_claims")
    .select("swap_transaction_signature")
    .eq("status", "failed")
    .not("swap_transaction_signature", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const failedSignature = failed?.[0]?.swap_transaction_signature as
    | string
    | undefined;
  if (failedSignature) {
    console.log("most recent failed claim, described from chain:");
    console.log(`  ${failedSignature}`);
    console.log(`  ${await describeFailureSignature(failedSignature)}\n`);
  }

  if (after.err) {
    console.error("FAIL: the fee payer paying the ATA rent does not simulate clean.");
    console.error("      The swap leg would fail again for a customer.");
    process.exit(1);
  }
  console.log(
    before.err
      ? "PASS: A fails without the fee payer as rent payer, B simulates clean."
      : "PASS: B simulates clean (A also passed: the deposit wallet now holds SOL).",
  );
}

void main();
