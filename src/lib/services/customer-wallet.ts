/**
 * Customer wallet: holdings reads and outbound transfer lifecycle.
 *
 * SERVER-ONLY, service role. `customer_transfers` has RLS enabled with ZERO
 * policies, and `reward_claims` only has merchant-scoped policies, so neither is
 * ever readable from the internet directly. Every read and write here happens
 * behind an endpoint that has first resolved the caller's wallet SERVER-SIDE
 * from a Privy token (the same verified path as /api/public/privy-wallet), so a
 * caller can never ask for someone else's holdings by claiming an address.
 *
 * WHY HOLDINGS COME FROM reward_claims: a customer's reward is recorded the
 * moment it is delivered, and `customer_wallet_address` is where it went. That
 * row is the durable record of what they were sent. The live on-chain balance
 * is re-read in solana/customer-transfer.ts so the number shown reflects any
 * transfer since, rather than a sum of ledger rows that ignores outgoing sends.
 *
 * Only DELIVERED claims appear. A reward that is still claiming, failed, or
 * ineligible is not something the customer owns, and listing it would promise
 * something we have not delivered.
 */

import { getServiceClient } from "@/lib/supabase/service";

export type CustomerHolding = {
  rewardEventId: string;
  assetTicker: string;
  assetDisplayName: string;
  assetLogoUrl: string | null;
  assetMint: string;
  assetDecimals: number;
  /** raw base units, decimal string, never a float */
  amountRawBaseUnits: string;
  /** USD value at delivery, decimal string */
  amountUsd: string | null;
  merchantName: string | null;
  deliveredAt: string;
};

type HoldingRow = {
  reward_event_id: string;
  updated_at: string;
  reward_events: {
    reward_usdc_units: string | null;
    merchants: { name: string } | { name: string }[] | null;
    reward_assets: {
      ticker: string;
      display_name: string;
      logo_url: string | null;
      mint_address: string;
      decimals: number;
    } | null;
  } | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Every DELIVERED reward belonging to one wallet address, newest first.
 *
 * The amount returned is the DELIVERED amount, not the intended quote, because
 * the swap can land marginally less after fees. `amountRawBaseUnits` is filled
 * in by the caller from the live chain read; the zero here is only a placeholder
 * for a claim whose chain read failed.
 */
export async function listCustomerHoldings(
  walletAddress: string,
): Promise<CustomerHolding[]> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("reward_claims")
    .select(
      "reward_event_id, customer_wallet_address, status, updated_at, " +
        "reward_events(reward_usdc_units::text, merchants(name), " +
        "reward_assets(ticker, display_name, logo_url, mint_address, decimals))",
    )
    .eq("customer_wallet_address", walletAddress)
    .eq("status", "delivered")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Customer holdings read failed: ${error.message}`);

  return (data ?? [])
    .map((r) => {
      const row = r as unknown as HoldingRow;
      const event = first(row.reward_events);
      const asset = first(event?.reward_assets);
      return {
        rewardEventId: row.reward_event_id,
        assetTicker: asset?.ticker ?? "",
        assetDisplayName: asset?.display_name ?? "Reward",
        assetLogoUrl: asset?.logo_url ?? null,
        assetMint: asset?.mint_address ?? "",
        assetDecimals: asset?.decimals ?? 0,
        amountRawBaseUnits: "0",
        amountUsd: event?.reward_usdc_units ?? null,
        merchantName: first(event?.merchants)?.name ?? null,
        deliveredAt: row.updated_at,
      };
    })
    .filter((h) => h.assetMint.length > 0);
}

export type CustomerTransferRow = {
  id: string;
  customer_wallet_address: string;
  reward_event_id: string | null;
  asset_ticker: string;
  asset_mint: string;
  asset_decimals: number;
  amount_raw_base_units: string;
  destination_address: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  transfer_signature: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** Creates the `pending` row BEFORE anything is signed or broadcast. */
export async function createCustomerTransfer(input: {
  walletAddress: string;
  rewardEventId: string | null;
  assetTicker: string;
  assetMint: string;
  assetDecimals: number;
  amountRawBaseUnits: bigint;
  destinationAddress: string;
}): Promise<CustomerTransferRow> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("customer_transfers")
    .insert({
      customer_wallet_address: input.walletAddress,
      reward_event_id: input.rewardEventId,
      asset_ticker: input.assetTicker,
      asset_mint: input.assetMint,
      asset_decimals: input.assetDecimals,
      amount_raw_base_units: input.amountRawBaseUnits.toString(),
      destination_address: input.destinationAddress,
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Could not record the transfer: ${error?.message ?? "unknown"}`);
  }
  return data as CustomerTransferRow;
}

export async function getCustomerTransfer(
  id: string,
): Promise<CustomerTransferRow | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("customer_transfers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as CustomerTransferRow) ?? null;
}

/** pending -> submitted, with the broadcast signature. */
export async function markTransferSubmitted(
  id: string,
  signature: string,
): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("customer_transfers")
    .update({
      status: "submitted",
      transfer_signature: signature,
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  return Boolean((data ?? []).length);
}

/** submitted -> confirmed. Terminal, and only ever from `submitted`. */
export async function markTransferConfirmed(
  id: string,
  signature: string,
): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("customer_transfers")
    .update({
      status: "confirmed",
      transfer_signature: signature,
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "submitted")
    .select("id");
  return Boolean((data ?? []).length);
}

/**
 * pending|submitted -> failed, with a reason. Terminal.
 *
 * There is deliberately NO compensating credit here, unlike a merchant
 * withdrawal. Nothing was reserved: the tokens were already in the customer's
 * own wallet and only actually move if the chain says they moved. If the
 * transaction never landed, the customer still holds everything.
 */
export async function markTransferFailed(
  id: string,
  reason: string,
): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("customer_transfers")
    .update({
      status: "failed",
      failure_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["pending", "submitted"])
    .select("id");
  return Boolean((data ?? []).length);
}

/** A customer's own transfer history, newest first. */
export async function listCustomerTransfers(
  walletAddress: string,
): Promise<CustomerTransferRow[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("customer_transfers")
    .select("*")
    .eq("customer_wallet_address", walletAddress)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as CustomerTransferRow[];
}
