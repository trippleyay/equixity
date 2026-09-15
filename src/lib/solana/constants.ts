/**
 * Solana constants for the merchant MVP.
 *
 * This build only ever moves USDC (funding). The three reward assets
 * (SPYx/AAPLx/NVDAx) live in `asset_config` and are Token-2022 tokens with the
 * Scaled UI Amount extension — any future code that reads balances or builds
 * transfers against THOSE mints must use TOKEN_2022_PROGRAM_ID from
 * @solana/spl-token, never TOKEN_PROGRAM_ID (spec section 4). This build never
 * touches them, so only the USDC (legacy SPL Token) program id is used here.
 */

// Official Circle USDC on Solana mainnet-beta (verified against
// developers.circle.com at build time).
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// 1 USDC = 1_000_000 base units (1e6). All balances/amounts are stored and
// transported as integer base units — never floats, never Number().
export const USDC_DECIMALS = 6;
export const USDC_BASE_UNITS_PER_TOKEN = 1_000_000n;

// Reward rate bounds (spec section 1): 1–2000 bps = 0.01%–20%, default 100 bps.
export const REWARD_BPS_MIN = 1;
export const REWARD_BPS_MAX = 2000;
export const REWARD_BPS_DEFAULT = 100;

// Fixed reward-asset catalog (spec section 2/4). Merchant picks exactly one.
// The DB foreign key into asset_config is the real gate; this is the client/dev
// side enum mirror of that seeded catalog.
export const SUPPORTED_TICKERS = ["SPYx", "AAPLx", "NVDAx"] as const;
export type RewardTicker = (typeof SUPPORTED_TICKERS)[number];

// Default reward asset used when a merchant row is provisioned before they
// have chosen one (merchant_settings.reward_asset is NOT NULL, no default).
export const DEFAULT_REWARD_ASSET: RewardTicker = "SPYx";

// getSignaturesForAddress paging for poll-on-view funding detection
// (spec section 5). MVP: newest `limit` signatures, no pagination loop.
export const DEPOSIT_SCAN_LIMIT = 100;

// Commitment used when reading confirmed chain data for deposit detection.
export const FUNDING_COMMITMENT = "confirmed";