-- A saved signing secret is not the same as a finished setup: the merchant still
-- has to point the processor at our web address and paste the snippet on their
-- thank-you page. Completion is therefore recorded next to the secret, so the
-- Configuration tabs only read as "Set up" once the merchant has pressed Done.
--
-- NULL means "not finished yet". It is cleared whenever the secret is replaced
-- (saveWebhookSecret writes completed_at = null) and disappears with the row when
-- the merchant removes the setup.
alter table merchant_webhook_secrets
  add column if not exists completed_at timestamptz;
