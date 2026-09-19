import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { getSolanaConnection } from "@/lib/solana/connection";
import { getParsedTransaction } from "@/lib/solana/get-transaction";
import { usdcNetReceived } from "@/lib/solana/sync-deposits";
import { FUNDING_COMMITMENT, USDC_MINT } from "@/lib/solana/constants";

/**
 * On-chain purchase verification (spec section 4 step 4).
 *
 * WHY THIS EXISTS AT ALL: `merchantId` is public — it sits in a <script> tag on
 * the merchant's own site — so without a registered wallet to check against,
 * `complete({transactionSignature})` would accept any valid Solana transaction
 * as "proof of purchase" for any merchant. The registered
 * `receiving_wallet_address` is what makes the check mean something.
 *
 * THE ATA TRAP, handled here the same way the funding sync handles it: on SPL
 * Token an inbound USDC transfer lists the destination's ASSOCIATED TOKEN
 * ACCOUNT in the transaction's account keys, not the wallet pubkey. So we
 * derive the receiving wallet's USDC ATA and measure the balance delta on it,
 * rather than looking for the wallet address as an instruction destination.
 *
 * The amount is read from the transaction itself (raw base-unit string, never
 * the float `uiAmount`), so it can never come from the request body.
 */

export type PurchaseVerification =
  | { ok: true; amountUsdcUnits: bigint; receivingAta: string }
  | { ok: false; reason: string };

export async function verifyUsdcPurchaseToMerchant(params: {
  transactionSignature: string;
  receivingWalletAddress: string;
}): Promise<PurchaseVerification> {
  const { transactionSignature, receivingWalletAddress } = params;

  let receivingWallet: PublicKey;
  try {
    receivingWallet = new PublicKey(receivingWalletAddress);
  } catch {
    return {
      ok: false,
      reason:
        "This merchant's registered receiving wallet is not a valid Solana address.",
    };
  }

  // Deterministic USDC ATA for the merchant's receiving wallet. It does not
  // need to exist on-chain for the derivation to be correct.
  const ata = await getAssociatedTokenAddress(
    new PublicKey(USDC_MINT),
    receivingWallet,
  );

  const conn = getSolanaConnection();
  const parsed = await getParsedTransaction(conn, transactionSignature);

  if (!parsed) {
    return {
      ok: false,
      reason:
        "That transaction could not be found or is not yet confirmed. Wait for confirmation and try again.",
    };
  }

  if (parsed.meta?.err) {
    return {
      ok: false,
      reason: "That transaction failed on-chain and cannot prove a purchase.",
    };
  }

  // Same balance-delta logic as the funding sync: it also catches CPI-wrapped
  // transfers from aggregator programs that top-level instructions don't expose.
  const delta = usdcNetReceived(parsed, receivingWallet, ata);

  if (delta === null || delta <= 0n) {
    return {
      ok: false,
      reason:
        "That transaction does not contain a confirmed USDC payment to this merchant's registered receiving wallet.",
    };
  }

  return { ok: true, amountUsdcUnits: delta, receivingAta: ata.toBase58() };
}