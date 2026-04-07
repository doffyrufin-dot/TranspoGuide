-- Patch: store per-operator PayMongo webhook signing secret.
-- Run once in Supabase SQL editor.

alter table if exists public.tbl_operator_payment_accounts
  add column if not exists paymongo_webhook_secret text;

comment on column public.tbl_operator_payment_accounts.paymongo_webhook_secret
  is 'PayMongo webhook signing secret (e.g. whsk_...) used to verify paymongo-signature per operator account.';
