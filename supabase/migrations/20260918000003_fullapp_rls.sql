-- ============================================================
-- Equixity — Full app phase. RLS for the two new tables
-- (spec section 7, same posture as section 4 of the MVP spec).
-- ============================================================

-- ---------------------------------------------------------------------------
-- reward_assets: RLS ENABLED with ZERO policies — service-role only.
--
-- This is a deliberately shared, public catalog, but every read in the app
-- goes through the service role on the server (merchant dashboard table,
-- reward calculation, claim page). Enabling RLS with no policy means no
-- anon/authenticated client can read or write it directly, which matches the
-- merchant_deposit_accounts convention already established. There is no
-- client-side read path to protect, so a public-read policy would only add a
-- second, unreviewed way in.
-- ---------------------------------------------------------------------------
alter table public.reward_assets enable row level security;

-- ---------------------------------------------------------------------------
-- reward_claims: merchant-scoped for the dashboard, exactly like every other
-- merchant-scoped table.
--
-- NOTE on the public claim page: it is public by design (no login), and it
-- reads ONE row by its unguessable reward_claims/reward_event UUID through the
-- service role server-side — never through an anon RLS policy. That keeps the
-- public surface to a single exact-id lookup (spec section 7: "don't put
-- anything in the URL or response beyond what's needed to display and act on
-- that one claim") rather than exposing an enumerable table to the internet.
-- ---------------------------------------------------------------------------
alter table public.reward_claims enable row level security;

create policy "reward_claims_select_own" on public.reward_claims
  for select to authenticated
  using (reward_event_id in (
    select e.id from public.reward_events e
    join public.merchants m on m.id = e.merchant_id
    where m.auth_user_id = auth.uid()
  ));

create policy "reward_claims_insert_own" on public.reward_claims
  for insert to authenticated
  with check (reward_event_id in (
    select e.id from public.reward_events e
    join public.merchants m on m.id = e.merchant_id
    where m.auth_user_id = auth.uid()
  ));

create policy "reward_claims_update_own" on public.reward_claims
  for update to authenticated
  using (reward_event_id in (
    select e.id from public.reward_events e
    join public.merchants m on m.id = e.merchant_id
    where m.auth_user_id = auth.uid()
  ));

create policy "reward_claims_delete_own" on public.reward_claims
  for delete to authenticated
  using (reward_event_id in (
    select e.id from public.reward_events e
    join public.merchants m on m.id = e.merchant_id
    where m.auth_user_id = auth.uid()
  ));