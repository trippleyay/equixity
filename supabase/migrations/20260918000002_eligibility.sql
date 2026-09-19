-- ============================================================
-- Equixity — Full app phase. Eligibility gating (spec section 6a).
--
-- This gate sits between the claim page (section 5) and swap execution
-- (section 6). Section 6 must never run until it passes, and it is
-- re-checked on every individual claim — never cached per merchant or
-- per customer, because IP location and jurisdiction can change between
-- claims even for the same wallet.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Merchant-side attestation (spec section 6a). The Rewards settings API
--    rejects is_enabled: true while this is false — enforced server-side in
--    the route, not merely as a disabled checkbox in the UI.
-- ---------------------------------------------------------------------------
alter table merchants
  add column confirmed_customer_eligibility boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Existing merchants: force rewards off until they attest.
--
--    is_enabled defaults to true, so every merchant provisioned before this
--    migration is instantly in a state 6a forbids. There is deliberately NO
--    grandfathering and no bypass path: pre-launch there is no real merchant
--    base to disrupt, and a bypass added now would conceptually persist
--    forever. Every merchant, past or future, must tick the box before
--    rewards run.
-- ---------------------------------------------------------------------------
update merchant_settings
  set is_enabled = false,
      updated_at = now()
  where merchant_id in (
    select id from merchants where confirmed_customer_eligibility = false
  );

-- ---------------------------------------------------------------------------
-- 3. Record WHAT was checked on each claim attempt, not just whether it
--    passed (spec section 6a point 5).
-- ---------------------------------------------------------------------------
alter table reward_claims
  add column detected_country_code text,
  add column eligibility_confirmed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. 'ineligible' as a distinct TERMINAL status (spec section 6a).
--    A compliance block is not a technical failure; conflating the two would
--    corrupt reporting and any future audit.
-- ---------------------------------------------------------------------------
alter table reward_claims drop constraint reward_claims_status_check;
alter table reward_claims add constraint reward_claims_status_check
  check (status in ('unclaimed', 'claiming', 'delivered', 'failed', 'ineligible'));

-- ---------------------------------------------------------------------------
-- 5. reward_events status vocabulary.
--
--    Two additions, both closing undefined-terminal-state holes:
--      * 'ineligible'      — the claim for this purchase was compliance-blocked.
--      * 'rewards_disabled' — the purchase is real and recorded, but it landed
--                            while the merchant's rewards toggle was off
--                            (spec section 4 step 7). Nothing failed and no
--                            compliance rule was triggered, so it is neither
--                            'failed' nor 'ineligible' — without this status the
--                            row would sit at 'pending' forever, which violates
--                            the rule that every money-state transition lands
--                            in a defined terminal or reconciliation state.
-- ---------------------------------------------------------------------------
alter table reward_events drop constraint reward_events_status_check;
alter table reward_events add constraint reward_events_status_check
  check (status in ('pending', 'completed', 'failed', 'ineligible', 'rewards_disabled'));