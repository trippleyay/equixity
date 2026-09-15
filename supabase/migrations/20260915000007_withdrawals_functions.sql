-- ============================================================
-- Equixity — Merchant MVP. plpgsql functions for withdrawals.
-- SECURITY INVOKER (default SECURITY INVOKER): called by the service
-- role they behave as the app expects; RLS still constrains any other caller.
--
-- reserve_withdrawal  - atomic check-and-debit: creates the pending row
--                       ONLY if the balance can actually absorb the amount,
--                       in ONE statement. Two concurrent requests cannot
--                       both clear the same funds (a row-level lock on
--                       merchant_balances serialises them). No read-then-write.
--
-- set_withdrawal_status - pending/submitted -> submitted | confirmed. No
--                       balance effect, but guarded so a settled row can't be
--                       flipped again.
--
-- fail_withdrawal      - marks failed AND refunds the reserved amount, exactly
--                       once (idempotent on the status transition, so a failed
--                       row is never double-credited).
-- ============================================================
create or replace function public.reserve_withdrawal(
  p_merchant_id uuid,
  p_amount_usdc_units bigint,
  p_destination_address text
)
returns setof public.withdrawal_transactions
language plpgsql
security invoker
as $$
declare
  v_balance bigint;
begin
  if p_amount_usdc_units <= 0 then
    raise exception 'withdrawal amount must be positive';
  end if;

  update public.merchant_balances
     set available_usdc_units = available_usdc_units - p_amount_usdc_units,
         updated_at = now()
   where merchant_id = p_merchant_id
     and available_usdc_units >= p_amount_usdc_units
  returning available_usdc_units into v_balance;

  -- If no row matched the WHERE, the balance can't cover it: debit never
  -- happened and no withdrawal row is created.
  if not found then
    return;
  end if;

  return query
    insert into public.withdrawal_transactions
      (merchant_id, amount_usdc_units, destination_address, status)
    values (p_merchant_id, p_amount_usdc_units, p_destination_address, 'pending')
    returning *;
end;
$$;

create or replace function public.set_withdrawal_status(
  p_withdrawal_id uuid,
  p_status text default 'submitted',
  p_transaction_signature text default null
)
returns setof public.withdrawal_transactions
language plpgsql
security invoker
as $$
begin
  -- Only forward transitions the ledger allows.
  if p_status not in ('submitted', 'confirmed') then
    return query select * from public.withdrawal_transactions where false;
  end if;

  return query
    update public.withdrawal_transactions
       set status = p_status,
           transaction_signature = coalesce(p_transaction_signature, transaction_signature),
           updated_at = now()
     where id = p_withdrawal_id
       and status in ('pending', 'submitted')   -- never resurrect a settled row
    returning *;
end;
$$;

create or replace function public.fail_withdrawal(
  p_withdrawal_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_row public.withdrawal_transactions;
begin
  -- Transition the row first; FOUND is true only if it was open and we just
  -- marked it failed. A row already confirmed/failed returns nothing -> false,
  -- so a given row is refunded at most once.
  update public.withdrawal_transactions
     set status = 'failed',
         failure_reason = p_reason,
         updated_at = now()
   where id = p_withdrawal_id
     and status in ('pending', 'submitted')
  returning * into v_row;
  if not found then
    return false;
  end if;

  -- Refund the reserved USDC the failed attempt no longer spent.
  update public.merchant_balances
     set available_usdc_units = available_usdc_units + v_row.amount_usdc_units,
         updated_at = now()
   where merchant_id = v_row.merchant_id;

  return true;
end;
$$;

-- Expose to the service role (server-side client). PostgREST surfaces functions
-- with EXECUTE granted to the calling role.
grant execute on function public.reserve_withdrawal(uuid, bigint, text) to service_role;
grant execute on function public.set_withdrawal_status(uuid, text, text) to service_role;
grant execute on function public.fail_withdrawal(uuid, text) to service_role;