-- ============================================================
-- Migration 033: Payment method + reference on invoices
--
-- Deposits for AATC 2027 were collected through Stripe invoices raised OUTSIDE
-- this platform. Recording them here needs an audit trail back to the money —
-- without one there is nothing linking a platform payment row to the Stripe
-- invoice that actually collected it.
--
-- stripe_payment_intent_id and stripe_invoice_id already exist but are both
-- UNIQUE and are written by the webhook. Reusing them for hand-entered
-- references would collide with webhook writes and muddle "we observed this
-- object via the API" with "a human typed this in". Separate columns.
-- ============================================================

alter table invoices
  add column if not exists payment_method text;

alter table invoices
  add column if not exists payment_reference text;

comment on column invoices.payment_method is
  'How the most recent payment was taken: stripe_external, cash, check, bank_transfer, other. NULL for payments collected through the platform''s own Stripe checkout (the webhook records those).';
comment on column invoices.payment_reference is
  'Free-text audit trail for a manually recorded payment — e.g. the external Stripe invoice ID, a cheque number, or a bank reference.';

create index if not exists invoices_payment_reference_idx
  on invoices (payment_reference)
  where payment_reference is not null;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices'
       and column_name in ('payment_method', 'payment_reference')
     having count(*) = 2
  ) then
    raise exception 'Migration 033 FAILED: payment_method / payment_reference not both present.';
  end if;
  raise notice 'Migration 033 OK — payment_method and payment_reference available.';
end $$;
