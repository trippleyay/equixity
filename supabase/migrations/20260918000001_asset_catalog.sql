-- ============================================================
-- Equixity — Full app phase. Asset catalog + schema additions
-- (spec section 2), plus the tables/columns sections 4, 4a and 6
-- depend on.
--
-- Nothing here is destructive to any live money table
-- (merchant_balances, funding_transactions, withdrawal_transactions
-- are not touched). asset_config is replaced by reward_assets, with
-- both foreign keys repointed in place rather than dropped, so no
-- existing reward_asset value is ever dangling.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. reward_assets (spec section 2) — the synced, curated catalog.
--    ticker is stored EXACTLY as the upstream APIs return it ('SPYx',
--    'ANDURIL'), confirmed against the live responses: xStocks `symbol` is
--    'AAPLx' while `underlyingSymbol` is 'AAPL'; PreStocks `symbol` is
--    already unsuffixed. Storing the API's own symbol keeps continuity with
--    the three rows already live in asset_config.
-- ---------------------------------------------------------------------------
create table reward_assets (
  ticker text primary key,
  asset_type text not null check (asset_type in ('xstock', 'prestock')),
  display_name text not null,
  mint_address text not null unique,
  decimals smallint not null,
  logo_url text not null,
  -- Display/calc value only (not an accounting ledger entry), so numeric is
  -- correct here — unlike the bigint base-unit rule for actual money movement.
  token_price_usd numeric(20, 8) not null default 0,
  price_updated_at timestamptz not null default now(),
  is_active boolean not null default true
);
create index reward_assets_type_active_idx on reward_assets (asset_type, is_active);

-- ---------------------------------------------------------------------------
-- 2. Carry the three live asset_config rows over BEFORE any FK moves, so the
--    repoint below can never fail on a missing referenced key. Values match
--    the live seed exactly (verified against Solscan and re-verified against
--    the live xStocks API, which returns identical Solana mint addresses).
--    The first catalog sync overwrites display_name/logo_url/decimals/price.
-- ---------------------------------------------------------------------------
insert into reward_assets (ticker, asset_type, display_name, mint_address, decimals, logo_url) values
  ('SPYx',  'xstock', 'S&P 500 xStock', 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', 8, 'https://xstocks-metadata.backed.fi/logos/tokens/SPYx.png'),
  ('AAPLx', 'xstock', 'Apple xStock',   'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', 8, 'https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png'),
  ('NVDAx', 'xstock', 'NVIDIA xStock',  'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', 8, 'https://xstocks-metadata.backed.fi/logos/tokens/NVDAx.png');

-- ---------------------------------------------------------------------------
-- 3. Repoint both foreign keys from asset_config -> reward_assets.
--    Constraint names are discovered rather than assumed, so this works
--    regardless of what Postgres auto-named them.
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select con.conname, cls.relname
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where con.contype = 'f'
      and nsp.nspname = 'public'
      and cls.relname in ('merchant_settings', 'reward_events')
      and pg_get_constraintdef(con.oid) like '%asset_config%'
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;

alter table merchant_settings
  add constraint merchant_settings_reward_asset_fkey
  foreign key (reward_asset) references reward_assets(ticker);

alter table reward_events
  add constraint reward_events_reward_asset_fkey
  foreign key (reward_asset) references reward_assets(ticker);

-- Safe to drop now: all three rows (and their mints) live in reward_assets.
drop table asset_config;

-- ---------------------------------------------------------------------------
-- 4. merchant_settings.receiving_wallet_address (spec section 1/2).
--    Nullable until set; the completion endpoints must reject with a clear
--    error (never silently fail) while it is null.
-- ---------------------------------------------------------------------------
alter table merchant_settings
  add column receiving_wallet_address text;

-- ---------------------------------------------------------------------------
-- 5. Merchant API key for the traditional-processor path (spec section 4a).
--    A distinct credential from Supabase Auth: it authenticates the merchant's
--    own backend calling Equixity server-to-server. Only the hash is stored;
--    the plaintext is shown once at generation and never again.
-- ---------------------------------------------------------------------------
alter table merchants
  add column api_key_hash text unique,
  add column api_key_last_four text;

-- ---------------------------------------------------------------------------
-- 6. Idempotency key for the no-on-chain-proof path (spec section 4a).
--    transaction_signature already serves this role for the on-chain path.
-- ---------------------------------------------------------------------------
alter table reward_events
  add column external_order_id text;
create unique index reward_events_merchant_external_order_idx
  on reward_events (merchant_id, external_order_id)
  where external_order_id is not null;

-- ---------------------------------------------------------------------------
-- 7. Purchase amount in USDC BASE UNITS, populated only by the on-chain path
--    (spec section 4 step 5). Kept separate from purchase_amount_cents rather
--    than overloading one column with two unit systems: cents is the natural
--    unit the card path (section 4a) is handed, base units is what the chain
--    gives us. 1 cent = 10_000 units, so these are NOT interchangeable and no
--    lossy conversion is introduced between them.
-- ---------------------------------------------------------------------------
alter table reward_events
  add column purchase_amount_usdc_units bigint;

-- ---------------------------------------------------------------------------
-- 8. reward_claims (spec section 2, verbatim shape).
--    Section 6a widens the status CHECK in the next migration, exactly as the
--    spec specifies — deliberately not pre-baked here so the migration history
--    reads the way the spec is written.
-- ---------------------------------------------------------------------------
create table reward_claims (
  id uuid primary key default gen_random_uuid(),
  reward_event_id uuid not null unique references reward_events(id) on delete cascade,
  claim_method text check (claim_method in ('wallet_connect', 'privy_embedded')),
  customer_wallet_address text,
  status text not null default 'unclaimed'
    check (status in ('unclaimed', 'claiming', 'delivered', 'failed')),
  swap_transaction_signature text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reward_claims_claiming_idx on reward_claims (status) where status in ('claiming');