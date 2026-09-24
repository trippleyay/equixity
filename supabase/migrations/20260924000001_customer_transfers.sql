-- Customer wallet: holdings reads and outbound transfers.
--
-- WHY A NEW TABLE: a customer sending their own stock out of their own Privy
-- wallet is a different lifecycle from a merchant withdrawal. There is no
-- merchant balance to reserve against (the tokens already sit in the
-- customer's own associated token account), and the signer is a Privy-managed
-- embedded wallet in the customer's browser, not a deposit key decrypted
-- server-side. What it DOES share with merchant withdrawals is the shape of the
-- problem, so it gets the same treatment: a row created before anything is
-- broadcast, and only ever moved to a terminal state.
--
-- RLS enabled with ZERO policies, matching merchant_deposit_accounts and
-- reward_assets: this table holds real customer money movements and is only
-- ever reached through the service role on the server.

create table if not exists customer_transfers (
  id uuid primary key default gen_random_uuid(),
  customer_wallet_address text not null,
  reward_event_id uuid references reward_events(id) on delete set null,
  asset_ticker text not null,
  asset_mint text not null,
  asset_decimals integer not null,
  amount_raw_base_units bigint not null check (amount_raw_base_units > 0),
  destination_address text not null,
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'confirmed', 'failed')),
  transfer_signature text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_transfers_wallet_idx
  on public.customer_transfers (customer_wallet_address, created_at desc);

create index if not exists customer_transfers_pending_idx
  on public.customer_transfers (updated_at)
  where status in ('pending', 'submitted');

alter table public.customer_transfers enable row level security;

-- Holdings are read by scanning one customer's delivered claims. Without this,
-- every wallet page view is a sequential scan of reward_claims.
create index if not exists reward_claims_wallet_status_idx
  on public.reward_claims (customer_wallet_address, status)
  where customer_wallet_address is not null;

grant select, insert, update, delete on public.customer_transfers to service_role;
-- No sequence grant: the primary key uses gen_random_uuid(), which is a
-- built-in function and creates no sequence.
