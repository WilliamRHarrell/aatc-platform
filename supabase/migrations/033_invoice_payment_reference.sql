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

-- ── Exactly one parent per invoice ──────────────────────────
-- Real schema gap, not a design choice. Migration 001 had application_id NOT
-- NULL; 012 dropped that to allow sponsorship invoices; 017 added
-- food_truck_id. Nobody ever added a constraint, so an invoice may currently
-- have all three parents NULL, or several set at once — a row belonging to
-- nothing, or to two things, with no error.
--
-- Every invoice in the table satisfies exactly-one today (verified: 0
-- violations), so this is additive. If it ever fails on insert, the caller is
-- creating an invoice with no parent or with two.
do $$
declare
  n_bad int;
begin
  select count(*) into n_bad
    from invoices
   where num_nonnulls(application_id, sponsorship_id, food_truck_id) <> 1;

  if n_bad > 0 then
    raise exception
      'Migration 033 ABORTED: % invoice(s) do not have exactly one parent. Fix those rows before adding the constraint.', n_bad;
  end if;
end $$;

alter table invoices
  drop constraint if exists invoices_exactly_one_parent;

alter table invoices
  add constraint invoices_exactly_one_parent
  check (num_nonnulls(application_id, sponsorship_id, food_truck_id) = 1);

comment on constraint invoices_exactly_one_parent on invoices is
  'An invoice bills exactly one of: an application, a sponsorship, or a food truck.';

do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'invoices'
         and column_name in ('payment_method', 'payment_reference')) <> 2 then
    raise exception 'Migration 033 FAILED: payment_method / payment_reference not both present.';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'invoices_exactly_one_parent'
       and conrelid = 'public.invoices'::regclass
  ) then
    raise exception 'Migration 033 FAILED: exactly-one-parent constraint not installed.';
  end if;

  raise notice 'Migration 033 OK — payment_method, payment_reference, and exactly-one-parent constraint in place.';
end $$;
