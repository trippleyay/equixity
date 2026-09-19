import { PublicKey } from "@solana/web3.js";
import {
  amountToUiAmountForMintWithoutSimulation,
  uiAmountToAmountForMintWithoutSimulation,
} from "@solana/spl-token";
import { getSolanaConnection } from "@/lib/solana/connection";

/**
 * Scaled-UI-amount conversion (confirmed decision, spec section 1 item 5).
 *
 * WHY THIS EXISTS: xStocks and PreStocks are Token-2022 mints carrying the
 * Scaled UI Amount extension. That multiplier is expected to drift from 1.0
 * over time — it is the mechanism by which splits and dividends are reflected
 * without moving any tokens. `tokenPrice` / `quote` from both upstream APIs is
 * quoted per REAL (displayed) unit, not per raw base unit.
 *
 * So the rule followed everywhere in the reward path is:
 *   * all reward math happens in UI/scaled units;
 *   * conversion to raw base units happens ONLY at the final transfer
 *     instruction, via the functions below.
 *
 * The multiplier math is NOT hand-rolled. `@solana/spl-token` ships
 * extension-aware helpers, verified against the installed 0.4.15 types:
 *   amountToUiAmountForMintWithoutSimulation(connection, mint, amount: bigint)
 *     -> Promise<string>
 *   uiAmountToAmountForMintWithoutSimulation(connection, mint, uiAmount: string)
 *     -> Promise<bigint>
 * Both read the mint account and apply its extension (scaled UI amount,
 * interest-bearing, or plain) themselves, so neither needs a transaction
 * simulation and neither reimplements the multiplier.
 */

export async function rawBaseUnitsToUiAmount(
  mintAddress: string,
  rawBaseUnits: bigint,
): Promise<string> {
  const conn = getSolanaConnection();
  return amountToUiAmountForMintWithoutSimulation(
    conn,
    new PublicKey(mintAddress),
    rawBaseUnits,
  );
}

export async function uiAmountToRawBaseUnits(
  mintAddress: string,
  uiAmount: string,
): Promise<bigint> {
  const conn = getSolanaConnection();
  return uiAmountToAmountForMintWithoutSimulation(
    conn,
    new PublicKey(mintAddress),
    uiAmount,
  );
}