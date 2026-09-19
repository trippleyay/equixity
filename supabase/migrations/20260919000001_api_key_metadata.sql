-- API key metadata for the Settings → Configuration table.
-- api_key_created_at: when the current key was generated (null = generated
-- before this column existed; the UI shows "—"). Cleared on delete.
alter table public.merchants
  add column if not exists api_key_created_at timestamptz;
