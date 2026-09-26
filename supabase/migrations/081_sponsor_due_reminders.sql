-- ============================================================
-- Migration 081: sponsor invoice due-date reminders are sent once.
-- Verification: supabase/verify/verify_081.sql
--
-- Sponsors pay on negotiated terms: no 25% deposit, a balance due on the
-- invoice's due_date (set per invoice in /admin/invoices). The lifecycle
-- sweep reminds them 30 and 7 days before that date and does nothing else -
-- no expiry, no cancellation, no chasing after the date.
--
-- The booth reminders match an exact +/-12 hour window, so a day the cron
-- does not run is a reminder never sent, and a double run sends twice. These
-- two columns make each sponsor reminder at-most-once and catch-up-able: the
-- sweep claims a reminder by setting its column (compare-and-set on NULL)
-- before sending. Resetting a column to NULL re-arms that reminder.
--
-- POLICIES ENUMERATED BEFORE WRITING: invoices carries "invoices: own read"
-- (029, via owns_invoice) and "invoices: admin all" (075). None is changed;
-- only the service role (the sweep) writes these columns.
-- ============================================================
begin;

alter table public.invoices add column if not exists due_reminder_30_sent_at timestamptz;
alter table public.invoices add column if not exists due_reminder_7_sent_at  timestamptz;
comment on column public.invoices.due_reminder_30_sent_at is
  'Sponsor invoice: when the 30-days-before-due_date reminder was claimed/sent (081). NULL = not sent.';
comment on column public.invoices.due_reminder_7_sent_at is
  'Sponsor invoice: when the 7-days-before-due_date reminder was claimed/sent (081). NULL = not sent.';

commit;
