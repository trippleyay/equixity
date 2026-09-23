-- merchant_webhook_secrets: per-provider webhook signing secrets for the
-- Equixity-hosted payment webhooks (Stripe today, Flutterwave alongside it).
-- Replaces merchant_stripe_webhooks, which was Stripe-shaped.
create table if not exists merchant_webhook_secrets (
  merchant_id uuid not null references merchants(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'flutterwave')),
  -- AES-256-GCM ciphertext (same key material as deposit keys). Never plaintext.
  webhook_secret text not null,
  updated_at timestamptz not null default now(),
  primary key (merchant_id, provider)
);
alter table merchant_webhook_secrets enable row level security;
-- Intentionally NO policies here. See merchant_deposit_accounts.

-- merchant_stripe_webhooks has no rows in production; carry any dev rows over
-- anyway so nothing is lost, then drop the Stripe-shaped table.
insert into merchant_webhook_secrets (merchant_id, provider, webhook_secret, updated_at)
  select merchant_id, 'stripe', webhook_secret, updated_at
  from merchant_stripe_webhooks
  on conflict (merchant_id, provider) do nothing;

drop table merchant_stripe_webhooks;
