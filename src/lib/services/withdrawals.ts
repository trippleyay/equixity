import { getServiceClient } from "@/lib/supabase/service";

/**
 * Server-only read/write access to withdrawal_transactions. Always keyed off a
 * merchantId resolved server-side from the authenticated session — never a
 * client-supplied merchant ID.
 *
 * Writes that move the balance (the reserve debit and the fail/refund credit)
 * go through the plpgsql functions so they stay atomic; this module only does
 * reads and calls those functions.
 */

export type WithdrawalRow = {
  id: string;
  amount_usdc_units: string; // bigint as decimal string — never a JS number
  destination_address: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  transaction_signature: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_WITHDRAWAL =
  "id, amount_usdc_units::text, destination_address, status, transaction_signature, failure_reason, created_at, updated_at";

function mapRow(r: Record<string, unknown>): WithdrawalRow {
  return {
    id: String(r.id),
    amount_usdc_units: String(r.amount_usdc_units ?? "0"),
    destination_address: String(r.destination_address),
    status: r.status as WithdrawalRow["status"],
    transaction_signature:
      r.transaction_signature == null ? null : String(r.transaction_signature),
    failure_reason: r.failure_reason == null ? null : String(r.failure_reason),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export async function listWithdrawals(
  merchantId: string,
): Promise<WithdrawalRow[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("withdrawal_transactions")
    .select(SELECT_WITHDRAWAL)
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapRow);
}

export async function getWithdrawal(id: string): Promise<WithdrawalRow> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("withdrawal_transactions")
    .select(SELECT_WITHDRAWAL)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new Error("Withdrawal not found.");
  return mapRow(data);
}

export async function listOpenWithdrawals(
  merchantId: string,
): Promise<WithdrawalRow[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("withdrawal_transactions")
    .select(SELECT_WITHDRAWAL)
    .eq("merchant_id", merchantId)
    .in("status", ["submitted"]);
  return (data ?? []).map(mapRow);
}