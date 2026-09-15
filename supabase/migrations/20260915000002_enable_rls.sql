-- ============================================================
-- Equixity — Merchant MVP. Row-Level Security (spec section 4 + section 8).
--
-- A row is visible/mutable only where its merchant_id resolves to the calling
-- auth.uid(). merchant_deposit_accounts gets RLS ENABLED with ZERO policies:
-- in practice only the service role should ever touch it (encrypted_private_key
-- must never be read by any client); if it is ever read via the auth'd cookie
-- client, the absence of a select policy denies it.
-- ============================================================

alter table merchants enable row level security;
alter table merchant_settings enable row level security;
alter table merchant_balances enable row level security;
alter table funding_transactions enable row level security;
alter table reward_events enable row level security;
alter table merchant_deposit_accounts enable row level security;

-- --- merchants (keyed on auth_user_id) -------------------------------------
create policy "merchants_select_own" on merchants
  for select to authenticated using (auth_user_id = auth.uid());
create policy "merchants_update_own" on merchants
  for update to authenticated using (auth_user_id = auth.uid());

-- --- merchant_settings ------------------------------------------------------
create policy "merchant_settings_select_own" on merchant_settings
  for select to authenticated
  using (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));
create policy "merchant_settings_insert_own" on merchant_settings
  for insert to authenticated
  with check (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));
create policy "merchant_settings_update_own" on merchant_settings
  for update to authenticated
  using (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));
create policy "merchant_settings_delete_own" on merchant_settings
  for delete to authenticated
  using (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));

-- --- merchant_balances -------------------------------------------------------
-- The balance is a ledger; direct updates only ever touch the merchant's own
-- row, and the only write path in the app is the atomic credit_funding()
-- function (service role). RLS still constrains any client writes to the owner.
create policy "merchant_balances_select_own" on merchant_balances
  for select to authenticated
  using (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));
create policy "merchant_balances_insert_own" on merchant_balances
  for insert to authenticated
  with check (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));
create policy "merchant_balances_update_own" on merchant_balances
  for update to authenticated
  using (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));
create policy "merchant_balances_delete_own" on merchant_balances
  for delete to authenticated
  using (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));

-- --- funding_transactions ------------------------------------------------
create policy "funding_transactions_select_own" on funding_transactions
  for select to authenticated
  using (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));
create policy "funding_transactions_insert_own" on funding_transactions
  for insert to authenticated
  with check (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));
create policy "funding_transactions_update_own" on funding_transactions
  for update to authenticated
  using (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));
create policy "funding_transactions_delete_own" on funding_transactions
  for delete to authenticated
  using (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));

-- --- reward_events -----------------------------------------------------------
create policy "reward_events_select_own" on reward_events
  for select to authenticated
  using (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));
create policy "reward_events_insert_own" on reward_events
  for insert to authenticated
  with check (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));
create policy "reward_events_update_own" on reward_events
  for update to authenticated
  using (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));
create policy "reward_events_delete_own" on reward_events
  for delete to authenticated
  using (merchant_id in (select m.id from merchants m where m.auth_user_id = auth.uid()));

-- merchant_deposit_accounts: RLS enabled above, intentionally NO policies.