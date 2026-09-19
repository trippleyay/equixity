-- ============================================================
-- Equixity — Full app phase. Claim lifecycle plpgsql functions
-- (spec sections 4, 6, 6a, 7).
--
-- Same posture as the MVP functions: SECURITY INVOKER, called by the service
-- role, EXECUTE granted to service_role only.
--
-- These are what make the money rules mechanically true rather than
-- aspirational:
--   * the balance is reserved atomically (check-and-debit in ONE statement),
--     so two concurrent claims against the same funds cannot both pass;
--   * a failed claim compensates by crediting back, and is idempotent, so a
--     retry can never double-refund;
--   * every terminal transition also moves the parent reward_events row, so
--     nothing can be left at an undefined 'pending' forever.
-- ============================================================

-- ---------------------------------------------------------------------------
-- create_reward_purchase: insert the reward_events row and (optionally) its
-- linked reward_claims row in ONE call (spec section 4 step 8). Atomic, so a
-- verified purchase can never end up with an event but no claim, or vice
-- versa. Returns the reward_event id so the caller can build the claim URL.
--
-- Exactly one of transaction_signature / external_order_id is populated,
-- depending on which verification path produced the purchase.
-- ---------------------------------------------------------------------------
create or replace function public.create_reward_purchase(
  p_merchant_id uuid,
  p_transaction_signature text,
  p_external_order_id text,
  p_purchase_amount_cents bigint,
  p_purchase_amount_usdc_units bigint,
  p_reward_asset text,
  p_reward_amount_units bigint,
  p_status text,
  p_create_claim boolean
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
    status
  ) values (
    p_merchant_id,
    p_transaction_signature,
    p_external_order_id,
    p_purchase_amount_cents,
    p_purchase_amount_usdc_units,
    p_reward_asset,
    p_reward_amount_units,
    p_status
  )
  returning id into v_event_id;

  if p_create_claim then
    insert into public.reward_claims (reward_event_id, status)
    values (v_event_id, 'unclaimed');
  end if;

  return v_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- reserve_reward_for_claim: move a claim unclaimed -> claiming AND debit the
-- merchant's balance, atomically (spec section 6 steps 1-2).
--
-- Order matters: the status guard runs first, so the debit only ever happens
-- for a claim that was genuinely still unclaimed (this is the double-claim
-- guard). Then the debit itself is a single UPDATE with
-- `available_usdc_units >= amount` in the WHERE clause, which is the
-- check-and-debit that makes concurrent claims safe.
--
-- Insufficient balance is a DEFINITIVE failure: the claim is marked failed
-- with a clear reason and no money moves. Returns true only if the claim is
-- now claiming AND the funds are reserved.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_reward_for_claim(
  p_claim_id uuid,
  p_merchant_id uuid,
  p_amount_usdc_units bigint,
  p_claim_method text,
  p_customer_wallet_address text,
  p_detected_country_code text
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_affected integer;
begin
  -- Claim status guard FIRST: only proceed if this claim is still unclaimed.
  update public.reward_claims
     set status = 'claiming',
         claim_method = p_claim_method,
         customer_wallet_address = p_customer_wallet_address,
         detected_country_code = coalesce(p_detected_country_code, detected_country_code),
         eligibility_confirmed_at = now(),
         updated_at = now()
   where id = p_claim_id
     and status = 'unclaimed';
  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    return false;
  end if;

  -- Atomic check-and-debit: the balance condition is inside the UPDATE, so
  -- there is no read-then-write window for a second claim to slip through.
  update public.merchant_balances
     set available_usdc_units = available_usdc_units - p_amount_usdc_units,
         updated_at = now()
   where merchant_id = p_merchant_id
     and available_usdc_units >= p_amount_usdc_units;
  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    -- Not enough funds. Nothing was debited; record a definitive failure.
    update public.reward_claims
       set status = 'failed',
           failure_reason = 'Insufficient USDC reward balance for this claim.',
           updated_at = now()
     where id = p_claim_id;
    update public.reward_events
       set status = 'failed'
     where id = (select reward_event_id from public.reward_claims where id = p_claim_id);
    return false;
  end if;

  return true;
end;
$$;
-- ---------------------------------------------------------------------------
-- complete_reward_claim: claiming -> delivered (spec section 6 step 6).
-- Only ever from 'claiming', so it cannot resurrect a failed/ineligible claim.
-- ---------------------------------------------------------------------------
create or replace function public.complete_reward_claim(
  p_claim_id uuid,
  p_swap_transaction_signature text
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_affected integer;
begin
  update public.reward_claims
     set status = 'delivered',
         swap_transaction_signature = p_swap_transaction_signature,
         failure_reason = null,
         updated_at = now()
   where id = p_claim_id
     and status = 'claiming';
  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    return false;
  end if;

  update public.reward_events
     set status = 'completed'
   where id = (select reward_event_id from public.reward_claims where id = p_claim_id);

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- fail_reward_claim: claiming -> failed WITH a compensating credit back to
-- the merchant (spec section 6 step 7: "don't debit the merchant's balance on
-- a failed swap").
--
-- Idempotent by construction: the credit only happens when the status
-- transition actually occurred. A retry against an already-failed or
-- already-delivered claim updates zero rows and therefore refunds nothing —
-- so a slow or retried reconciliation can never double-credit.
-- ---------------------------------------------------------------------------
create or replace function public.fail_reward_claim(
  p_claim_id uuid,
  p_merchant_id uuid,
  p_amount_usdc_units bigint,
  p_failure_reason text
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_affected integer;
begin
  update public.reward_claims
     set status = 'failed',
         failure_reason = p_failure_reason,
         updated_at = now()
   where id = p_claim_id
     and status = 'claiming';
  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    return false;
  end if;

  if p_amount_usdc_units is not null and p_amount_usdc_units > 0 then
    update public.merchant_balances
       set available_usdc_units = available_usdc_units + p_amount_usdc_units,
           updated_at = now()
     where merchant_id = p_merchant_id;
  end if;

  update public.reward_events
     set status = 'failed'
   where id = (select reward_event_id from public.reward_claims where id = p_claim_id);

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_claim_ineligible: the section 6a compliance block. Terminal, and
-- distinct from 'failed' in BOTH tables — a compliance block is not a
-- technical failure (spec section 6a point 5).
--
-- Only ever from 'unclaimed': 6a sits BEFORE section 6, so by definition no
-- funds have been reserved when this runs, and this function touches no
-- balance at all.
-- ---------------------------------------------------------------------------
create or replace function public.mark_claim_ineligible(
  p_claim_id uuid,
  p_detected_country_code text,
  p_reason text
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_affected integer;
begin
  update public.reward_claims
     set status = 'ineligible',
         failure_reason = p_reason,
         detected_country_code = coalesce(p_detected_country_code, detected_country_code),
         updated_at = now()
   where id = p_claim_id
     and status = 'unclaimed';
  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    return false;
  end if;

  update public.reward_events
     set status = 'ineligible'
   where id = (select reward_event_id from public.reward_claims where id = p_claim_id);

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_claim_attempt_country: records the geo-check result on a claim page
-- load WITHOUT changing status (spec section 6a point 5, "record what was
-- actually checked").
--
-- This is the deliberate sequencing improvement over a literal reading of 6a:
-- merely VIEWING the page from a restricted country must not permanently
-- poison the claim, because 'ineligible' is terminal and a stray VPN blip or
-- flaky corporate proxy would otherwise lock out a legitimate claimant. So the
-- page load records the country; only an actual Claim submit runs the gate and
-- can set 'ineligible' (via mark_claim_ineligible), re-checking geo fresh at
-- that moment.
-- ---------------------------------------------------------------------------
create or replace function public.set_claim_attempt_country(
  p_claim_id uuid,
  p_detected_country_code text
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_affected integer;
begin
  update public.reward_claims
     set detected_country_code = p_detected_country_code,
         updated_at = now()
   where id = p_claim_id
     and status = 'unclaimed';
  get diagnostics v_affected = row_count;

  return v_affected > 0;
end;
$$;

-- PostgREST only surfaces functions with EXECUTE granted to the calling role.
grant execute on function public.create_reward_purchase(uuid, text, text, bigint, bigint, text, bigint, text, boolean) to service_role;
grant execute on function public.reserve_reward_for_claim(uuid, uuid, bigint, text, text, text) to service_role;
grant execute on function public.complete_reward_claim(uuid, text) to service_role;
grant execute on function public.fail_reward_claim(uuid, uuid, bigint, text) to service_role;
grant execute on function public.mark_claim_ineligible(uuid, text, text) to service_role;
grant execute on function public.set_claim_attempt_country(uuid, text) to service_role;