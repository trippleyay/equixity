-- ============================================================
-- Equixity — Merchant MVP. Rewards enable/disable toggle.
-- Confirmed addition: merchants can turn rewards off (or back on)
-- without deleting their configuration. Default ON for every
-- merchant (a new row gets is_enabled = true).
--
-- NOTE: this field has no runtime consumer yet — the customer-side
-- purchase engine (out of scope) is what will read it. It is stored
-- and surfaced in the merchant dashboard now so the config exists
-- the moment the customer side is built.
-- ============================================================

alter table public.merchant_settings
  add column is_enabled boolean not null default true;
