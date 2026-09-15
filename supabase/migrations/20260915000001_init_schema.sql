-- ============================================================
-- Equixity — Merchant MVP. Initial schema (spec section 4).
-- ============================================================

-- Fixed catalog of supported reward assets. Not merchant-editable.
create table asset_config (
  ticker text primary key,             -- 'SPYx' | 'AAPLx' | 'NVDAx'
  display_name text not null,
  mint_address text not null unique,
  decimals smallint not null,          -- fetched on-chain at seed time; not hand-typed (see note)
  is_token_2022 boolean not null default true,
  network text not null default 'mainnet-beta'
);

-- Seed data — mint addresses cross-checked against Solscan, Solflare, and
-- Gate/Bitget's own listings on 2026-09-14 (spec section 4). Re-verify on
-- Solscan directly right before mainnet launch; a stale or wrong address here
-- sends real funds to the wrong place with no recovery path.
--
-- SPEC NOTE: xStocks are issued on the Token-2022 program with the Scaled UI
-- Amount extension. The decimals value is what's on the mint account today,
-- pulled from each token's public explorer listing. Re-fetch programmatically
-- with getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID) at
-- seed time (see scripts/verify-asset-config.ts) since a mint's raw decimals
-- can differ from the displayed amount once the Scaled UI Amount multiplier is
-- applied. This build only moves USDC and never transfers these three tokens.
insert into asset_config (ticker, display_name, mint_address, decimals, is_token_2022) values
  ('SPYx',  'S&P 500 xStock', 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', 8, true),
  ('AAPLx', 'Apple xStock',   'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', 8, true),
  ('NVDAx', 'NVIDIA xStock',  'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', 8, true);

create table merchants (
  id uuid primary key default gen_random_uuid(),
  -- ADDED (confirmed decision): a public-facing, snippet-safe identifier,
  -- decoupled from the internal PK forever. Used in the SDK tag; never used
  -- for authorization. Distinct from id so the PK can be migrated/partitioned
  -- without breaking every live merchant snippet.
  public_id uuid not null unique default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table merchant_settings (
  merchant_id uuid primary key references merchants(id) on delete cascade,
  reward_asset text not null references asset_config(ticker),
  reward_bps integer not null default 100
    check (reward_bps > 0 and reward_bps <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One Equixity-generated Solana address per merchant, for deposits only.
create table merchant_deposit_accounts (
  merchant_id uuid primary key references merchants(id) on delete cascade,
  deposit_address text not null unique,        -- public key, safe to show in dashboard
  encrypted_private_key text not null,         -- AES-256-GCM ciphertext, never returned by any API
  created_at timestamptz not null default now()
);
-- Access to this table is service-role only. No client, including the
-- merchant's own dashboard session, ever reads encrypted_private_key. There is
-- no API route that returns it.

create table merchant_balances (
  merchant_id uuid primary key references merchants(id) on delete cascade,
  available_usdc_units bigint not null default 0 check (available_usdc_units >= 0),
  -- base units, 1 USDC = 1_000_000 units. Never stored or transported as float.
  updated_at timestamptz not null default now()
);

create table funding_transactions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  transaction_signature text not null unique,
  amount_usdc_units bigint not null check (amount_usdc_units > 0),
  status text not null default 'confirmed'
    check (status in ('confirmed', 'reversed')),
  detected_at timestamptz not null default now()
);
create index funding_transactions_merchant_id_idx on funding_transactions (merchant_id);

create table reward_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  event_type text not null default 'purchase_reward',
  transaction_signature text,          -- nullable, populated by future purchase phase
  purchase_amount_cents bigint,
  reward_asset text references asset_config(ticker),
  reward_amount_units bigint,          -- base units per asset_config.decimals
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now()
);
create index reward_events_merchant_created_idx on reward_events (merchant_id, created_at desc);