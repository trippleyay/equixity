-- ============================================================
-- Equixity — Reward delivery rescope (equixity-reward-delivery-spec.md
-- sections 2, 4, 5; supersedes the delivery sections of the full-app spec).
--
--   * Path A per-merchant Stripe webhook secret (encrypted at rest).
--   * 'same_wallet' claim method: crypto rewards deliver to the paying wallet
--     with no wallet entry at all.
--   * backup_email: populated only when the payment processor reveals one.
--   * Two-strike geo-block bookkeeping so a single VPN blip on one page load
--     can never permanently lock a claim (spec section 4 step 2: only two
--     independently confirmed blocked reads on DIFFERENT page loads persist
--     the terminal 'ineligible' status).
-- ============================================================

-- --- Path A: per-merchant webhook credentials -------------------------------
-- The signing secret lives in its OWN table with RLS ENABLED AND ZERO POLICIES,
-- exactly like merchant_deposit_accounts (whose encrypted_private_key gets the
-- same treatment).
--
-- A column-level REVOKE on merchant_settings was the obvious first approach and
-- is deliberately NOT used. Supabase grants table-level privileges to the
-- authenticated role by default, and in PostgreSQL a column-level REVOKE cannot
-- carve a hole out of a table-level GRANT: the secret would have remained
-- readable by the merchant's own session via PostgREST
-- (select=stripe_webhook_secret), even though a "revoke" appeared to have run.
-- With RLS enabled and no policy, every row is denied to authenticated/anon
-- regardless of the GRANT, so only the service role can read the ciphertext.
create table if not exists merchant_stripe_webhooks (
  merchant_id uuid primary key references merchants(id) on delete cascade,
  -- AES-256-GCM ciphertext (same key material as deposit keys). Never plaintext.
  webhook_secret text not null,
  updated_at timestamptz not null default now()
);
alter table merchant_stripe_webhooks enable row level security;
-- Intentionally NO policies here. See merchant_deposit_accounts.

-- --- reward_claims ----------------------------------------------------------
-- 'pasted_address' is the fiat "I already have a wallet" path: the customer
-- pastes an address into a plain text input and it is validated as a real
-- Solana wallet address server-side. 'wallet_connect' is a LEGACY value only:
-- rows created by the removed /claim page may still carry it, so the constraint
-- keeps accepting it, but this codebase never writes it again (no wallet
-- connect exists anywhere in the reward flow).
alter table reward_claims drop constraint if exists reward_claims_claim_method_check;
alter table reward_claims add constraint reward_claims_claim_method_check
  check (claim_method in ('same_wallet', 'pasted_address', 'privy_embedded', 'wallet_connect'));


alter table reward_claims
  add column if not exists backup_email text;

-- Two-strike geo state (see the header comment). The streak counts blocked
-- reads from DISTINCT page loads; geo_block_last_view holds the per-load view
-- id so a second blocked read within the SAME load does not increment it.
alter table reward_claims
  add column if not exists geo_block_streak integer not null default 0;
alter table reward_claims
  add column if not exists geo_block_last_view text;

-- Sweep support for the future backup notice (section 6) — harmless now: the
-- partial index only covers rows that are still unclaimed AND have a backup
-- contact, which is exactly the sweep's predicate.
create index if not exists reward_claims_backup_pending_idx
  on public.reward_claims (created_at)
  where status = 'unclaimed' and backup_email is not null;

-- ---------------------------------------------------------------------------
-- create_reward_purchase: rebuilt with the three new claim fields. The crypto
-- path pre-fills the paying wallet and 'same_wallet' AT CREATION TIME, since
-- the wallet that paid is already known (spec section 2). The fiat paths pass
-- null for both and the customer chooses on the hosted reward page.
-- ---------------------------------------------------------------------------
-- The 9-arg drop this used to carry was the PRE-<reward_usdc_units> signature and
-- matches nothing, so it silently no-opped and left the live 10-arg function in
-- place as a second overload. The live signature (verified against the hosted
-- project) is 10 args with p_reward_usdc_units; that is what must be dropped.
drop function if exists public.create_reward_purchase(
  uuid, text, text, bigint, bigint, text, bigint, bigint, text, boolean);

create or replace function public.create_reward_purchase(
  p_merchant_id uuid,
  p_transaction_signature text,
  p_external_order_id text,
  p_purchase_amount_cents bigint,
  p_purchase_amount_usdc_units bigint,
  p_reward_asset text,
  p_reward_amount_units bigint,
  p_reward_usdc_units bigint,
  p_status text,
  p_create_claim boolean,
  p_customer_wallet_address text default null,
  p_claim_method text default null,
  p_backup_email text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_event_id uuid;
begin
  insert into public.reward_events (
    merchant_id,
    transaction_signature,
    external_order_id,
    purchase_amount_cents,
    purchase_amount_usdc_units,
    reward_asset,
    reward_amount_units,
    reward_usdc_units,
    status
  ) values (
    p_merchant_id,
    p_transaction_signature,
    p_external_order_id,
    p_purchase_amount_cents,
    p_purchase_amount_usdc_units,
    p_reward_asset,
    p_reward_amount_units,
    p_reward_usdc_units,
    p_status
  )
  returning id into v_event_id;

  if p_create_claim then
    insert into public.reward_claims
      (reward_event_id, status, customer_wallet_address, claim_method, backup_email)
    values (v_event_id, 'unclaimed', p_customer_wallet_address, p_claim_method, p_backup_email);
  end if;

  return v_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_geo_check: the two-strike rule, atomically (spec section 4 step 2).
--
--   * Same view id as last time  -> this is the SAME page load: the streak
--     does not move (a refresh generates a fresh view id).
--   * A new view id and blocked   -> streak + 1.
--   * A new view id and clear     -> streak resets to 0.
--   * Streak reaching 2 while blocked persists the TERMINAL 'ineligible' on
--     both the claim and its event, and only then.
--   * Any terminal claim no-ops: compliance status can never be overwritten.
--
-- Returns the streak after this read (-1 when the claim does not exist).
-- ---------------------------------------------------------------------------
create or replace function public.record_geo_check(
  p_claim_id uuid,
  p_view_id text,
  p_detected_country_code text,
  p_blocked boolean
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_claim public.reward_claims;
  v_streak integer;
begin
  select * into v_claim
    from public.reward_claims
   where id = p_claim_id
   for update;

  if v_claim.id is null then
    return -1;
  end if;
  if v_claim.status <> 'unclaimed' then
    return 0;
  end if;

  if v_claim.geo_block_last_view is distinct from p_view_id then
    v_streak := case when p_blocked then v_claim.geo_block_streak + 1 else 0 end;
    update public.reward_claims
       set geo_block_streak = v_streak,
           geo_block_last_view = p_view_id,
           detected_country_code = coalesce(p_detected_country_code, detected_country_code),
           updated_at = now()
     where id = p_claim_id;
  else
    -- Same page load: re-reading the same load must not march toward terminal.
    v_streak := v_claim.geo_block_streak;
  end if;

  if p_blocked and v_streak >= 2 then
    update public.reward_claims
       set status = 'ineligible',
           failure_reason = coalesce(
             failure_reason,
             'Stock rewards cannot be delivered to your region.'
           ),
           updated_at = now()
     where id = p_claim_id;
    update public.reward_events
       set status = 'ineligible'
     where id = v_claim.reward_event_id;
  end if;

  return v_streak;
end;
$$;

grant execute on function public.create_reward_purchase(uuid, text, text, bigint, bigint, text, bigint, bigint, text, boolean, text, text, text) to service_role;
grant execute on function public.record_geo_check(uuid, text, text, boolean) to service_role;
