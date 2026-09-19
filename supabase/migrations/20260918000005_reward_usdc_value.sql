-- ============================================================
-- Equixity — Full app phase. Store the reward's earmarked USDC value.
--
-- WHY THIS COLUMN IS NEEDED (a documented addition):
-- Section 6 step 3 requires a swap "input USDC (the reward's earmarked USDC
-- value)", but section 2's schema stores only reward_amount_units (the ASSET
-- quantity) — nothing records how much USDC actually backs that reward.
--
-- Deriving it at claim time would be wrong in two ways: recomputing from the
-- merchant's CURRENT reward_bps would silently re-price rewards purchased under
-- an older rate, and inverting reward_amount_units through the asset price
-- would reintroduce rounding error plus dependence on a price that has since
-- moved. Storing the value computed at purchase time is the only way the swap
-- spends exactly what the reward was priced at.
-- ============================================================

alter table reward_events
  add column reward_usdc_units bigint;

comment on column reward_events.reward_usdc_units is
  'USDC base units earmarked for this reward at purchase time. The swap input amount. bigint base units — never a float.';

-- Recreate create_reward_purchase to carry the new value through in the same
-- atomic insert. Drop-then-create because the parameter list changes.
drop function if exists public.create_reward_purchase(uuid, text, text, bigint, bigint, text, bigint, text, boolean);

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
    insert into public.reward_claims (reward_event_id, status)
    values (v_event_id, 'unclaimed');
  end if;

  return v_event_id;
end;
$$;

grant execute on function public.create_reward_purchase(uuid, text, text, bigint, bigint, text, bigint, bigint, text, boolean) to service_role;