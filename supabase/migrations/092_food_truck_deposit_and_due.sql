-- Migration 092: food truck deposit rule and the January 1 handling (PR 2 of 3).
--
-- Ryan, 2026-10-07/08 (docs/superpowers/plans/2026-10-07-food-truck-application.md):
--   - A food truck's first payment is $100, or the full amount when the total
--     is $100 or less. Trucks already invoiced (the 3 Square imports and any
--     truck added before this) stay on the 25% deposit. Trucks invoiced from
--     now on, by approval or by admin Add, take the $100 rule.
--   - Reminders 30, 14, 7 and 1 days before the balance is due (January 1),
--     for every selected truck with a balance, imports included.
--   - On January 2, one internal email listing the trucks not paid in full.
--   - Release (admin): the truck is released and unpublished, its invoice is
--     cancelled; payments already made stay on record. No automatic
--     cancellation anywhere.
--
-- WHY A COLUMN AND NOT THE "Square #" PREFIX: payment_reference is rewritten
-- by the next recorded payment (lib/invoice-payment.ts paymentUpdate), so the
-- prefix cannot keep California Taco on 25% past its next payment.
--
-- This adds:
--   1. invoices.deposit_rule: 'percent_25' (every existing row, and the
--      default for new rows) or 'food_truck_flat' (food-truck invoices only;
--      the app sets it). The amount is FOOD_TRUCK_DEPOSIT_CENTS in
--      src/lib/food-truck-pricing.ts, not stored here.
--   2. invoices.due_reminder_14_sent_at and due_reminder_1_sent_at, beside
--      081's 30 and 7 columns.
--   3. events.food_truck_unpaid_report_sent_at: the January 2 email is
--      claimed by a compare-and-set on it, so it is sent once.
--
-- Existing policies, enumerated before changing (replay of 001-091, `npm run
-- verify:local -- --dump-schema`, 2026-10-08):
--   invoices: "invoices: admin all" ALL is_admin(),
--             "invoices: own read" SELECT owns_invoice(application_id, sponsorship_id, auth.uid()),
--             "invoices: own food truck read" SELECT (food truck owner, 090).
--   events:   "events: admin write" ALL is_admin(), "events: public read" SELECT true.
-- No policy is added, dropped or changed. Owners still only read invoices,
-- so they cannot change their own deposit rule.

begin;

-- ── 1. deposit rule ─────────────────────────────────────────
alter table public.invoices
  add column if not exists deposit_rule text not null default 'percent_25';
alter table public.invoices drop constraint if exists invoices_deposit_rule_check;
alter table public.invoices add constraint invoices_deposit_rule_check
  check (deposit_rule in ('percent_25', 'food_truck_flat')
         and (deposit_rule = 'percent_25' or food_truck_id is not null));
comment on column public.invoices.deposit_rule is
  'First-payment rule: percent_25 (25% deposit) or food_truck_flat (FOOD_TRUCK_DEPOSIT_CENTS, or the total if less). Existing rows are percent_25 (092).';

-- ── 2. the 14- and 1-day reminders ──────────────────────────
alter table public.invoices
  add column if not exists due_reminder_14_sent_at timestamptz,
  add column if not exists due_reminder_1_sent_at timestamptz;

-- ── 3. the January 2 internal email, once ───────────────────
alter table public.events
  add column if not exists food_truck_unpaid_report_sent_at timestamptz;
comment on column public.events.food_truck_unpaid_report_sent_at is
  'When the lifecycle sweep sent the "food trucks not paid in full" list (092). Set once; clear it to send again.';

commit;
