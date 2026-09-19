import { z } from "zod";
import { REWARD_BPS_MIN, REWARD_BPS_MAX } from "@/lib/solana/constants";

const BASE58_PUBKEY_SHAPE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Zod validation for POST /api/merchant/settings.
 *
 * Two deliberate changes from the merchant-MVP version:
 *
 * 1. `reward_asset` is no longer a 3-value enum. The catalog is now a synced,
 *    curated 50 assets (spec section 2), so the real gates are the
 *    `reward_assets` foreign key plus an `is_active` check made in the service
 *    layer against the database. Hardcoding tickers here would mean a code
 *    change every time the curation list moves.
 *
 * 2. `receiving_wallet_address` (spec section 1) and
 *    `confirmed_customer_eligibility` (spec section 6a) are added.
 *
 * The base58 shape check below gives a fast, clear 400 for obviously bad input.
 * The AUTHORITATIVE check is `new PublicKey(...)` in the service layer, which
 * rejects strings that merely look base58. As with reward_bps, this schema is
 * convenience — the DB and the service actually enforce.
 */
export const settingsSchema = z.object({
  reward_asset: z.string().trim().min(1).max(32),
  reward_bps: z.number().int().min(REWARD_BPS_MIN).max(REWARD_BPS_MAX),
  is_enabled: z.boolean(),
  /**
   * Empty string means "clear the field"; null/undefined means "leave as-is".
   * Validated as a real Solana public key in the service layer.
   */
  receiving_wallet_address: z
    .string()
    .trim()
    .max(88)
    .refine((v) => v === "" || BASE58_PUBKEY_SHAPE.test(v), {
      message: "Receiving wallet must be a well-formed base58 Solana public key.",
    })
    .nullish(),
  confirmed_customer_eligibility: z.boolean().optional(),
});

export type SettingsInput = z.infer<typeof settingsSchema>;