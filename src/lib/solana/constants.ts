/**
 * Solana constants for the merchant MVP.
 *
 * This build moves USDC and, for reward swaps, the customer's chosen reward
 * asset. USDC is a legacy SPL Token mint. The reward assets (xStocks and
 * PreStocks) are issued on Token-2022 with the Scaled UI Amount extension, so
 * any code that reads their mint or builds a transfer against them must use
 * TOKEN_2022_PROGRAM_ID from @solana/spl-token, never TOKEN_PROGRAM_ID
 * (spec section 4). See lib/assets/decimals.ts and lib/solana/scaled-amount.ts.
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

// The reward-asset catalog is no longer a constant. It lives in the synced
// `reward_assets` table (spec section 2) and is read through
// lib/services/assets.ts. `reward_assets.is_active` — the curation flag — is the
// real gate on which tickers a merchant may select, checked in the service
// layer against the database, so the curation list can change without a code
// change here.

// Default reward asset used when a merchant row is provisioned before they
// have chosen one (merchant_settings.reward_asset is NOT NULL, no default).
// Valid because the asset-catalog migration carries SPYx into reward_assets.
export const DEFAULT_REWARD_ASSET = "SPYx";

// getSignaturesForAddress paging for poll-on-view funding detection
// (spec section 5). MVP: newest `limit` signatures, no pagination loop.
export const DEPOSIT_SCAN_LIMIT = 100;

// Commitment used when reading confirmed chain data for deposit detection.
export const FUNDING_COMMITMENT = "confirmed";