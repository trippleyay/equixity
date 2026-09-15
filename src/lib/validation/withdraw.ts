import { z } from "zod";

/**
 * Zod validation for POST /api/merchant/withdrawals.
 *
 * amount_usdc_units is transported as a base-unit decimal STRING (never a JS
 * number — bigint precision rule). Only the client-side dashboard converts a
 * human decimal amount to base units, via parseUsdcToUnits(); the server
 * accepts the base-unit integer string and re-validates it here. The atomic
 * reserve (reserve_withdrawal) is the real balance gate; destination_address
 * is fully validated as a Solana pubkey in the executor before any RPC/fee.
 */
export const withdrawSchema = z.object({
  amount_usdc_units: z
    .string()
    .regex(/^[1-9][0-9]*$/, "must be a positive whole number (base units)"),
  destination_address: z.string().min(32).max(44),
});

export type WithdrawInput = z.infer<typeof withdrawSchema>;

export function validateWithdraw(
  body: unknown,
): { ok: true; value: WithdrawInput } | { ok: false; issues: string[] } {
  const parsed = withdrawSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => i.message) };
  }
  return { ok: true, value: parsed.data };
}