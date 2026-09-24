import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { env } from "@/lib/env";
import { USDC_MINT } from "@/lib/solana/constants";

/**
 * Jupiter Swap API client (spec section 6 step 4).
 *
 * VERIFIED against Jupiter's current docs and the live API surface, not assumed:
 *   * `GET  https://api.jup.ag/swap/v1/quote` with inputMint, outputMint,
 *     amount, slippageBps, swapMode=ExactIn.
 *   * `POST https://api.jup.ag/swap/v1/swap` with { userPublicKey, quoteResponse }
 *     returning { swapTransaction: <base64>, lastValidBlockHeight, ... }.
 *   * An API key is REQUIRED (`x-api-key`), including on the free tier.
 *
 * WHY v1 AND NOT THE NEWER v2 "Metis" /build PATH: /build returns raw instruction
 * arrays shaped for @solana/kit (web3.js v2), which would mean running a second,
 * parallel Solana stack alongside this app's web3.js v1 + spl-token code. v1
 * returns an assembled base64 VERSIONED TRANSACTION, which
 * `VersionedTransaction.deserialize` (v1) consumes directly — so the swap reuses
 * the exact same signing, blockhash and confirmation machinery the withdrawal
 * flow already uses, which is what section 6 asks for.
 *
 * `destinationTokenAccount` exists on /swap but is documented as assuming the
 * token account is ALREADY INITIALIZED. A first-time customer wallet will not
 * have one, so this client deliberately does not use it — see reward-swap.ts for
 * the two-step pattern section 6 names as the always-works fallback.
 */

const QUOTE_URL = "https://api.jup.ag/swap/v1/quote";
const SWAP_URL = "https://api.jup.ag/swap/v1/swap";

/** Slippage tolerance for a rewards swap, in basis points (0.5%). */
export const SWAP_SLIPPAGE_BPS = 50;

export class JupiterError extends Error {}

export type JupiterQuote = Record<string, unknown> & {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
};

function apiKey(): string {
  if (!env.jupiterApiKey) {
    throw new JupiterError(
      "JUPITER_API_KEY is not set; reward swaps are disabled.",
    );
  }
  return env.jupiterApiKey;
}

/** Quote USDC -> reward asset. Input and output amounts are raw base units. */
export async function quoteUsdcToAsset(params: {
  outputMint: string;
  usdcAmountUnits: bigint;
}): Promise<JupiterQuote> {
  const url = new URL(QUOTE_URL);
  url.searchParams.set("inputMint", USDC_MINT);
  url.searchParams.set("outputMint", params.outputMint);
  url.searchParams.set("amount", params.usdcAmountUnits.toString());
  url.searchParams.set("slippageBps", String(SWAP_SLIPPAGE_BPS));
  url.searchParams.set("swapMode", "ExactIn");

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": apiKey() },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new JupiterError(
      `Jupiter quote failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  }

  const quote = (await res.json()) as JupiterQuote;
  if (!quote?.outAmount) {
    throw new JupiterError("Jupiter returned no route for this reward asset.");
  }
  return quote;
}

/**
 * Build the swap transaction for the merchant's deposit wallet to sign.
 * `userPublicKey` is the merchant's deposit address: it owns the input USDC and
 * receives the swapped asset (the two-step pattern's first leg).
 *
 * NOTE: this assembled-transaction helper is retained for reference/testing but
 * is NOT what the reward executor uses — see buildSwapInstructions below for
 * why (fee payer control).
 */
export async function buildSwapTransaction(params: {
  userPublicKey: string;
  quote: JupiterQuote;
}): Promise<import("@solana/web3.js").VersionedTransaction> {
  const res = await fetch(SWAP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey(),
    },
    body: JSON.stringify({
      userPublicKey: params.userPublicKey,
      quoteResponse: params.quote,
      // Simulate for an accurate compute unit limit rather than guessing.
      dynamicComputeUnitLimit: true,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new JupiterError(
      `Jupiter swap build failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as { swapTransaction?: string };
  if (!json.swapTransaction) {
    throw new JupiterError("Jupiter returned no swap transaction.");
  }

  const { VersionedTransaction } = await import("@solana/web3.js");
  try {
    return VersionedTransaction.deserialize(
      Buffer.from(json.swapTransaction, "base64"),
    );
  } catch (e) {
    throw new JupiterError(
      `Could not deserialize Jupiter's swap transaction: ${(e as Error).message}`,
    );
  }
}

/** Assert a mint is a well-formed pubkey (used before quoting against it). */
export function assertMint(mintAddress: string): PublicKey {
  try {
    return new PublicKey(mintAddress);
  } catch {
    throw new JupiterError(`Invalid reward asset mint: ${mintAddress}`);
  }
}

// ---------------------------------------------------------------------------
// /swap-instructions
//
// WHY THIS ENDPOINT RATHER THAN /swap. Section 6 step 5 requires that the
// Equixity fee-payer covers gas and the merchant's deposit key NEVER pays a
// network fee. The assembled /swap response bakes in `userPublicKey` as the fee
// payer, and a deposit address holds only USDC — it has no SOL and would fail.
// `/swap-instructions` returns the raw instructions instead, so we assemble the
// transaction ourselves with the Equixity wallet as fee payer, exactly as the
// withdrawal executor already does. That is the same "merchant key signs only
// the token authority, the fee payer pays" shape section 6 asks for.
// ---------------------------------------------------------------------------

const SWAP_INSTRUCTIONS_URL = "https://api.jup.ag/swap/v1/swap-instructions";

export type JupiterInstruction = {
  programId: string;
  accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  /** base64-encoded instruction data. */
  data: string;
};

export type JupiterSwapInstructions = {
  computeBudgetInstructions?: JupiterInstruction[];
  setupInstructions?: JupiterInstruction[];
  swapInstruction: JupiterInstruction;
  cleanupInstruction?: JupiterInstruction | null;
  otherInstructions?: JupiterInstruction[];
  addressLookupTableAddresses?: string[];
};

export async function buildSwapInstructions(params: {
  userPublicKey: string;
  quote: JupiterQuote;
}): Promise<JupiterSwapInstructions> {
  const res = await fetch(SWAP_INSTRUCTIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey() },
    body: JSON.stringify({
      userPublicKey: params.userPublicKey,
      quoteResponse: params.quote,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new JupiterError(
      `Jupiter swap-instructions failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as JupiterSwapInstructions;
  if (!json?.swapInstruction) {
    throw new JupiterError("Jupiter returned no swap instruction.");
  }
  return json;
}

/** Convert Jupiter's JSON instruction shape into a web3.js TransactionInstruction. */
export function toTransactionInstruction(ix: JupiterInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

/**
 * Repoint the ATA program's rent payer at the Equixity fee payer.
 *
 * WHY THIS EXISTS, measured on chain and not assumed. Jupiter's setup
 * instructions create the OUTPUT asset's token account for whoever the swap was
 * built for, and they name that same wallet as the rent payer. The merchant's
 * deposit wallet holds USDC and no SOL (it is not supposed to need any), so the
 * instruction aborted with
 *
 *   Transfer: insufficient lamports 0, need 1559560
 *
 * and failed the whole swap AFTER it had been broadcast, which cost a fee, a
 * slot, and a customer-facing "the swap did not confirm" that pointed at the
 * wrong wallet entirely.
 *
 * The ATA program takes its payer as account 0, and any signer may be that
 * payer, so account 0 alone is repointed at the fee payer: the wallet that
 * already pays every network fee here and holds the small SOL float for rent.
 * The account's OWNER is untouched, so the swapped asset still lands in the
 * merchant's deposit wallet. Only instructions from the ATA program are touched,
 * and only their first key.
 */
export function withFeePayerPayingAtaRent(
  instructions: TransactionInstruction[],
  feePayer: PublicKey,
): TransactionInstruction[] {
  return instructions.map((ix) =>
    ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) && ix.keys.length > 0
      ? new TransactionInstruction({
          programId: ix.programId,
          data: ix.data,
          keys: [{ ...ix.keys[0], pubkey: feePayer }, ...ix.keys.slice(1)],
        })
      : ix,
  );
}