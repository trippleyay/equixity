import { z } from "zod";
import {
  REWARD_BPS_MAX,
  REWARD_BPS_MIN,
  SUPPORTED_TICKERS,
} from "@/lib/solana/constants";

/**
 * Zod validation for POST /api/merchant/settings (spec section 5).
 *
 * The bounds here mirror the DB CHECK constraint on merchant_settings.reward_bps
 * (1–2000 bps) — but the DB constraint is the one that actually matters and the
 * asset_config foreign key is the real gate on reward_asset. This schema gives a
 * fast, clear 400 response; it is not a substitute for the DB.
 */
export const settingsSchema = z.object({
  reward_asset: z.enum(SUPPORTED_TICKERS),
  reward_bps: z.number().int().min(REWARD_BPS_MIN).max(REWARD_BPS_MAX),
  is_enabled: z.boolean(),
});

export type SettingsInput = z.infer<typeof settingsSchema>;