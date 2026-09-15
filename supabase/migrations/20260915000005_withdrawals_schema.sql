-- ============================================================
-- Equixity — Merchant MVP. Withdrawal ledger.
--
-- Self-service withdrawals pull a merchant's USDC balance back out
-- to an external Solana address. A separate table (NOT a direction
-- flag on funding_transactions) because the lifecycle genuinely
-- differs: funding is deposit->confirmed; withdrawals are
-- pending -> submitted -> confirmed / failed, and a failed withdrawal
-- refunds the reserved balance.
--
-- Balance accounting mirrors credit_funding: the reserve (debit) and
-- the fail/refund (credit) both happen inside a single plpgsql
-- function so there is no read-then-write race from application code.
-- ============================================================

create table public.withdrawal_transactions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  amount_usdc_units bigint not null check (amount_usdc_units > 0),
  -- base units, 1 USDC = 1_000_000 units. Never stored/transported as float.
  destination_address text not null,
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'confirmed', 'failed')),
  transaction_signature text unique,   -- null until broadcast
  failure_reason text,                 -- populated only when status = 'failed'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- History view, newest first.
create index withdrawal_transactions_merchant_created_idx
  on public.withdrawal_transactions (merchant_id, created_at desc);

-- Partial index so reconciliation of in-flight withdrawals stays cheap.
create index withdrawal_transactions_open_idx
  on public.withdrawal_transactions (status)
  where status in ('pending', 'submitted');
