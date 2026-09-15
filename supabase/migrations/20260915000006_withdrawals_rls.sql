-- ============================================================
-- Equixity — Merchant MVP. RLS for withdrawal_transactions.
-- Same rule as every merchant-scoped table: a row is visible/mutable
-- only where its merchant_id resolves to the calling auth.uid().
-- Actual balance writes still go through the service-role plpgsql
-- functions (reserve_withdrawal / fail_withdrawal) exactly like
-- merchant_balances; these policies constrain any accidental client
-- writes to the row's own merchant.
-- ============================================================

alter table public.withdrawal_transactions enable row level security;

create policy "withdrawal_transactions_select_own" on public.withdrawal_transactions
  for select to authenticated
  using (merchant_id in (select m.id from public.merchants m where m.auth_user_id = auth.uid()));

create policy "withdrawal_transactions_insert_own" on public.withdrawal_transactions
  for insert to authenticated
  with check (merchant_id in (select m.id from public.merchants m where m.auth_user_id = auth.uid()));

create policy "withdrawal_transactions_update_own" on public.withdrawal_transactions
  for update to authenticated
  using (merchant_id in (select m.id from public.merchants m where m.auth_user_id = auth.uid()));

create policy "withdrawal_transactions_delete_own" on public.withdrawal_transactions
  for delete to authenticated
  using (merchant_id in (select m.id from public.merchants m where m.auth_user_id = auth.uid()));