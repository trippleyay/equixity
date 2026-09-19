import { PublicKey, type Connection } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getSolanaConnection } from "@/lib/solana/connection";

/**
 * On-chain decimals for a reward-asset mint.
 *
 * THIS IS THE ONE PLACE `TOKEN_2022_PROGRAM_ID` IS GENUINELY REQUIRED. Both
 * upstream families issue on Token-2022, verified on-chain rather than assumed:
 *   * PreStocks mints are owned by TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
 *     (= TOKEN_2022_PROGRAM_ID), with decimals 9.
 *   * xStocks mints are Token-2022 as well, with decimals 8.
 * Reading them with the legacy TOKEN_PROGRAM_ID would fail or return garbage.
 *
 * Decimals are immutable for a mint, so the sync caches them by mint address
 * and only pays this RPC call for mints it has not seen before.
 */
export async function fetchMintDecimals(
  mintAddress: string,
  connection?: Connection,
): Promise<number> {
  const conn = connection ?? getSolanaConnection();
  const mint = await getMint(
    conn,
    new PublicKey(mintAddress),
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  return mint.decimals;
}