/**
 * Static sanctioned-wallet screening — section 6a point 6, the second layer.
 *
 * WHICH PATH WAS TAKEN (and why):
 * The spec allows either a synced list or "a hardcoded starting list in config,
 * updated by hand occasionally" as an acceptable MVP substitute, and explicitly
 * says not to let this hold up the build if syncing turns out to need more than
 * it looks. Syncing was checked and does need more than it looks:
 *   * OFAC's Sanctions List Service XML export returns `{"message":"Forbidden"}`
 *     to server-side requests, so it is not a dependable at-runtime source;
 *   * the legacy `sdn.csv` that does respond is NAME-based and carries no
 *     digital-currency addresses at all;
 *   * the addresses live in a large separate XML document (the advanced/
 *     consolidated list) keyed by an idType such as
 *     "Digital Currency Address - SOL", which requires real XML parsing of a
 *     multi-megabyte file plus periodic refresh.
 * So this is the hand-maintained config path, as permitted.
 *
 * THE LIST BELOW IS DELIBERATELY EMPTY. It is not an oversight and not a stub
 * that silently pretends to work — inventing addresses here would be actively
 * harmful: it would both give false assurance that screening is live and risk
 * blocking innocent wallets. An empty list means the mechanism runs and
 * matches nothing, which is the honest state until an operator pastes verified
 * Solana addresses from OFAC's published data.
 *
 * To populate: pull the digital-currency addresses with idType
 * "Digital Currency Address - SOL" from OFAC's published sanctions data and
 * paste them below (one per line, as base58 strings). This is the entire
 * update procedure — deliberately one file, no schema change.
 */
export const SANCTIONED_WALLET_ADDRESSES: readonly string[] = [
  // (empty until populated from OFAC's published data — see above)
];

/** True when the list has not been populated yet, so callers can surface that. */
export const SANCTIONED_LIST_IS_EMPTY = SANCTIONED_WALLET_ADDRESSES.length === 0;

const SANCTIONED_SET = new Set(SANCTIONED_WALLET_ADDRESSES);

/**
 * Screen a customer wallet address before section 6 sends anything.
 *
 * Exact-match on the full base58 address (no prefix/substring matching, which
 * would create false positives against unrelated wallets).
 */
export function isSanctionedWallet(address: string | null | undefined): boolean {
  if (!address) return false;
  return SANCTIONED_SET.has(address.trim());
}

/** Reason string recorded on a blocked claim (spec section 6a point 6). */
export const SANCTIONED_WALLET_REASON =
  'This wallet address is on the Equixity sanctioned-address list and is not eligible to receive a reward.';