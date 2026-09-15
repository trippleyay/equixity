-- ============================================================
-- Equixity — Merchant MVP. plpgsql functions (spec sections 4 & 7).
--
-- All run with SECURITY INVOKER (default): when called by the service role
-- (which bypasses RLS) they operate as the app expects; if any other role ever
-- calls them, RLS still applies and constrains them to their own merchant.
-- ============================================================

-- ---------------------------------------------------------------------------
-- provision_merchant: idempotently create the merchant record + deposit
-- account + settings + balance row together on first sign-in (spec section 7).
-- Uses the confirmed defaults: reward_asset 'SPYx', reward_bps 100.
-- Returns the (single) merchant row. Safe under concurrent first-load races.
-- ---------------------------------------------------------------------------
create or replace function public.provision_merchant(
  p_auth_user_id uuid,
  p_name text,
  p_deposit_address text,
  p_encrypted_private_key text
)
returns setof public.merchants
language plpgsql
security invoker
as $$
begin
  insert into public.merchants (auth_user_id, name)
  values (p_auth_user_id, p_name)
  on conflict (auth_user_id) do nothing;

  -- Deposit account: written only if it does not already exist. Never
  -- overwrites an existing merchant's deposit address/encrypted key.
  insert into public.merchant_deposit_accounts (merchant_id, deposit_address, encrypted_private_key)
  select m.id, p_deposit_address, p_encrypted_private_key
  from public.merchants m
  where m.auth_user_id = p_auth_user_id
    and not exists (
      select 1 from public.merchant_deposit_accounts d where d.merchant_id = m.id);

  insert into public.merchant_settings (merchant_id, reward_asset, reward_bps)
  select m.id, 'SPYx', 100
  from public.merchants m
  where m.auth_user_id = p_auth_user_id
    and not exists (
      select 1 from public.merchant_settings s where s.merchant_id = m.id);

  insert into public.merchant_balances (merchant_id, available_usdc_units)
  select m.id, 0
  from public.merchants m
  where m.auth_user_id = p_auth_user_id
    and not exists (
      select 1 from public.merchant_balances b where b.merchant_id = m.id);

  return query
    select * from public.merchants m
    where m.auth_user_id = p_auth_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- credit_funding: atomically insert a funding_transactions row and increment
-- the merchant's balance in ONE function call (spec section 4 Atomicity) — no
-- read-then-write round trip from application code. Idempotent on the unique
-- transaction_signature: returns true if credited, false if already recorded.
-- ---------------------------------------------------------------------------
create or replace function public.credit_funding(
  p_merchant_id uuid,
  p_transaction_signature text,
  p_amount_usdc_units bigint
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_inserted boolean := false;
begin
  insert into public.funding_transactions (merchant_id, transaction_signature, amount_usdc_units, status)
  values (p_merchant_id, p_transaction_signature, p_amount_usdc_units, 'confirmed')
  on conflict (transaction_signature) do nothing
  returning true into v_inserted;

  if v_inserted then
    insert into public.merchant_balances (merchant_id, available_usdc_units)
    values (p_merchant_id, p_amount_usdc_units)
    on conflict (merchant_id)
    do update set
      available_usdc_units = public.merchant_balances.available_usdc_units + excluded.available_usdc_units,
      updated_at = now();
  end if;

  return coalesce(v_inserted, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- total_rewards_issued: aggregate "total rewards issued" straight from
-- reward_events (spec section 7) — a query, not a stored counter.
-- Count as a JSON number; summed units as a JSON string (bigint-safe).
-- ---------------------------------------------------------------------------
create or replace function public.total_rewards_issued(p_merchant_id uuid)
returns jsonb
language plpgsql
security invoker
stable
as $$
declare
  v_count bigint;
  v_sum bigint;
begin
  select count(*), coalesce(sum(reward_amount_units), 0)
  into v_count, v_sum
  from public.reward_events
  where merchant_id = p_merchant_id
    and status = 'completed';

  return jsonb_build_object(
    'count', v_count,
    'reward_amount_units', v_sum::text
  );
end;
$$;

-- Expose to the service role (the app's server-side client). PostgREST only
-- surfaces functions with EXECUTE granted to the calling role.
grant execute on function public.provision_merchant(uuid, text, text, text) to service_role;
grant execute on function public.credit_funding(uuid, text, bigint) to service_role;
grant execute on function public.total_rewards_issued(uuid) to service_role;