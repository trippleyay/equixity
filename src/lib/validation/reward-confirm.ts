import { z } from "zod";

/**
 * Zod validation for POST /api/public/reward-confirm (spec section 4).
 *
 * `walletAddress` is required only for the fiat path (when the claim row has no
 * pre-filled customer wallet). The shape check here is min/max length only;
 * the AUTHORITATIVE check is `new PublicKey(...)` in the route, the same
 * pattern as validation/withdraw.ts — base58 strings that merely look valid
 * must be rejected by the curve check, not by length.
 */
export const rewardConfirmSchema = z.object({
  rewardEventId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  walletAddress: z.string().min(32).max(44).optional(),
  // The fiat customer's chosen receive method. Crypto never sends one; the
  // row already carries 'same_wallet'. There is no third mechanism: a pasted
  // address ('pasted_address') or a Privy-created wallet ('privy_embedded').
  claimMethod: z.enum(["pasted_address", "privy_embedded"]).optional(),
  attestationAccepted: z.boolean(),
  // Identifies THIS page load, so two blocked geo reads within one load do
  // not march the claim toward the terminal ineligible state (spec section 4).
  view: z.string().min(8).max(64),
});

export type RewardConfirmInput = z.infer<typeof rewardConfirmSchema>;

export function validateRewardConfirm(
  body: unknown,
): { ok: true; value: RewardConfirmInput } | { ok: false; issues: string[] } {
  const parsed = rewardConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => i.message) };
  }
  return { ok: true, value: parsed.data };
}