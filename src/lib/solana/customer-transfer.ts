/**
 * Customer wallet on-chain reads and transfer construction (SERVER-ONLY).
 *
 * THE SIGNER IS NOT OURS, which is the one thing that makes this different from
 * every other transfer in the codebase. A merchant withdrawal is signed by a
 * deposit keypair we decrypt server-side. A customer sending their own stock out
 * of their own Privy-managed embedded wallet is signed by PRIVY, in the
 * customer's browser. The server never sees a customer private key and must not
 * pretend to.
 *
 * So the flow is deliberately two legs, and the server's only signing job is the
 * FEE:
 *   1. build: server reads the customer's REAL on-chain token balance, validates
 *      the destination and the amount against it, creates the `pending` row, then
 *      builds a VersionedTransaction with the Equixity fee payer as feePayer and
 *      the customer's wallet as the transfer authority. It signs ONLY the fee
 *      payer signature and returns the serialized transaction.
 *   2. the customer's browser asks Privy to sign that same transaction as the
 *      owner (Privy's `useSignTransaction`), producing a fully-signed
 *      transaction, which the browser posts back for broadcast.
 *
 * Because the customer co-signs, the fee payer is what lets this work for a
 * wallet holding no SOL: it pays the network fee and, when the destination has
 * never held that asset, the one-time token-account rent. The customer needs no
 * SOL at all, exactly like a merchant withdrawal.
 *
 * TOKEN-2022 IS REQUIRED: reward assets are Token-2022 mints (several carry the
 * Scaled UI Amount extension), so the transfer and the destination's associated
 * token account are built with TOKEN_2022_PROGRAM_ID.
 */

import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { getSolanaConnection } from "@/lib/solana/connection";
import { getFeePayerKeypair } from "@/lib/solana/fee-payer";
import { FUNDING_COMMITMENT } from "@/lib/solana/constants";
import {
  rawBaseUnitsToUiAmount,
  uiAmountToRawBaseUnits,
} from "@/lib/solana/scaled-amount";

export class InvalidDestinationError extends Error {
  constructor() {
    super("That does not look like a valid Solana wallet address.");
    this.name = "InvalidDestinationError";
  }
}

export class InsufficientHoldingsError extends Error {
  constructor() {
    super("You do not hold that much of this asset.");
    this.name = "InsufficientHoldingsError";
  }
}

export class InvalidAmountError extends Error {
  constructor() {
    super("Enter an amount greater than zero.");
    this.name = "InvalidAmountError";
  }
}

/**
 * Validates a pasted destination exactly the way the merchant withdrawal
 * destination is validated: parse it as a base58 public key. A destination that
 * is not a real key never reaches an RPC call or a transaction.
 */
export function parseDestinationAddress(raw: string): PublicKey {
  const trimmed = raw.trim();
  if (trimmed.length < 32 || trimmed.length > 44) throw new InvalidDestinationError();
  let key: PublicKey;
  try {
    key = new PublicKey(trimmed);
  } catch {
    throw new InvalidDestinationError();
  }
  // new PublicKey() can accept a malformed string by producing a different
  // valid key, so re-encoding is the authoritative check: it must round-trip to
  // the same base58 the user pasted.
  if (key.toBase58() !== trimmed) throw new InvalidDestinationError();
  return key;
}

/** The customer's live balance of one mint, in raw base units. */
export async function getCustomerTokenBalance(
  ownerAddress: string,
  mintAddress: string,
): Promise<bigint> {
  const conn = getSolanaConnection();
  const ata = getAssociatedTokenAddressSync(
    new PublicKey(mintAddress),
    new PublicKey(ownerAddress),
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  const { value } = await conn.getTokenAccountBalance(ata, "confirmed");
  return BigInt(value.amount);
}

/** Raw base units -> display string, via the extension-aware helper. */
export async function toDisplayAmount(
  mintAddress: string,
  rawBaseUnits: bigint,
): Promise<string> {
  if (rawBaseUnits === 0n) return "0";
  return rawBaseUnitsToUiAmount(mintAddress, rawBaseUnits);
}

/** Display string -> raw base units, via the extension-aware helper. */
export async function toRawBaseUnits(
  mintAddress: string,
  displayAmount: string,
): Promise<bigint> {
  return uiAmountToRawBaseUnits(mintAddress, displayAmount.trim());
}

export type BuiltTransfer = {
  /** base64 serialized transaction, fee-payer signature already attached */
  serializedTransaction: string;
  lastValidBlockHeight: number;
};

/**
 * Builds (and fee-payer-signs) the transfer the customer will co-sign.
 *
 * Uses the same legacy `Transaction` shape as the merchant withdrawal rather
 * than a hand-built VersionedMessage: `web3.js` exposes no partial signing on
 * VersionedTransaction, and the legacy Transaction supports `partialSign`, which
 * is exactly the operation this needs (fee payer signs now, the owner signs
 * later in the customer's browser).
 *
 * The amount is validated against the customer's REAL on-chain balance, not
 * against a number the browser sent, so a tampered request cannot ask to send
 * more than they hold. The destination token account is created idempotently
 * with the fee payer as payer, so sending to a brand new address works with no
 * SOL in the customer's wallet.
 */
export async function buildCustomerTransfer(input: {
  customerWallet: string;
  mintAddress: string;
  assetDecimals: number;
  amountRawBaseUnits: bigint;
  destination: PublicKey;
}): Promise<BuiltTransfer> {
  if (input.amountRawBaseUnits <= 0n) throw new InvalidAmountError();

  const conn = getSolanaConnection();
  const customer = new PublicKey(input.customerWallet);
  const mint = new PublicKey(input.mintAddress);
  const feePayer = getFeePayerKeypair();

  const held = await getCustomerTokenBalance(input.customerWallet, input.mintAddress);
  if (input.amountRawBaseUnits > held) throw new InsufficientHoldingsError();

  const sourceAta = getAssociatedTokenAddressSync(
    mint,
    customer,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  const destinationAta = getAssociatedTokenAddressSync(
    mint,
    input.destination,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  const recent = await conn.getLatestBlockhash(FUNDING_COMMITMENT);
  const tx = new Transaction();
  tx.feePayer = feePayer.publicKey;
  tx.recentBlockhash = recent.blockhash;
  tx.lastValidBlockHeight = recent.lastValidBlockHeight;
  tx.add(
    // Only does work when the destination has never held this asset.
    createAssociatedTokenAccountIdempotentInstruction(
      feePayer.publicKey,
      destinationAta,
      input.destination,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
    createTransferCheckedInstruction(
      sourceAta,
      mint,
      destinationAta,
      customer,
      input.amountRawBaseUnits,
      input.assetDecimals,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  // Fee payer signs ONLY. The owner's signature is added by Privy in the
  // customer's browser; the server never holds their key. The fee payer is
  // therefore never a transfer authority over the customer's tokens.
  tx.partialSign(feePayer);

  return {
    serializedTransaction: Buffer.from(tx.serialize()).toString("base64"),
    lastValidBlockHeight: recent.lastValidBlockHeight,
  };
}

/**
 * Broadcasts the customer-signed transaction and waits for confirmation.
 *
 * Throws with a customer-safe message on failure; the caller owns the terminal
 * row state. Deliberately does NOT second-guess an ambiguous result the way a
 * merchant withdrawal does, because there is nothing to refund: if it landed the
 * tokens moved, and if it did not they never left. The chain is the authority.
 */
export async function broadcastCustomerTransfer(
  serializedSignedTransaction: string,
): Promise<string> {
  const conn = getSolanaConnection();
  const transaction = Transaction.from(
    Buffer.from(serializedSignedTransaction, "base64"),
  );

  const signature = await conn.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: FUNDING_COMMITMENT,
    maxRetries: 2,
  });

  // The customer's signature fixes the blockhash, but not its expiry height, so
  // that is re-read here rather than trusted from the deserialized transaction.
  const { lastValidBlockHeight } = await conn.getLatestBlockhash(FUNDING_COMMITMENT);
  const blockhash = transaction.recentBlockhash;
  if (!blockhash) {
    throw new Error("The signed transfer had no blockhash.");
  }

  await conn.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    FUNDING_COMMITMENT,
  );
  return signature;
}

