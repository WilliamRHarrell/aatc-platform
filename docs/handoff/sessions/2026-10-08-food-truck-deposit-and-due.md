# 2026-10-08 - Food truck deposit rule and January 1 handling (PR 2 of 3)

Branch `feat/food-truck-deposit-and-due`. Plan and Ryan's PR 2 decisions:
[docs/superpowers/plans/2026-10-07-food-truck-application.md](../../superpowers/plans/2026-10-07-food-truck-application.md).

Also this session: screenshots of /apply/food-truck (closed live; open forced
locally, not committed) at 390px and 1280px; the raw file pickers were fixed
in #76. /admin/food-trucks was not screenshotted (needs an admin session;
Ryan checks it himself).

## Delivered, NOT applied: migration 092

**Order: apply 092, run verify_092.sql, THEN merge.** Checkout, the webhook,
the pay page and admin read `invoices.deposit_rule`.

- `invoices.deposit_rule`: `percent_25` (every existing row and the default)
  or `food_truck_flat` (food-truck invoices only, a CHECK). The prefix
  "Square #" could not be the marker: the next recorded payment rewrites
  payment_reference.
- `invoices.due_reminder_14_sent_at`, `due_reminder_1_sent_at` (081 has 30 and 7).
- `events.food_truck_unpaid_report_sent_at` (the January 2 email, once).
- No policy changed (enumerated in the header).

verify_092: `npm run verify:local -- supabase/verify/verify_092.sql` PASS
(A, B1-B3); `--audit` PASS (128 fixture inserts). Mutation check: without
the "food trucks only" half of the CHECK, verify_092 fails at B2. Block C
lists the live food-truck invoices (want: all percent_25 right after applying).

## Code

- **Deposit, one rule** (`depositCents` in `src/lib/invoice-payment.ts`):
  flat = FOOD_TRUCK_DEPOSIT_CENTS or the total if less; otherwise 25%. Used
  by /api/create-checkout, the Stripe webhook (deposit_paid_at), /portal/pay
  and /admin/invoices (paymentUpdate). A test fails if any of the four
  computes 25% itself again.
- New truck invoices (approval and admin Add) are `food_truck_flat`.
- **Reminders** (`src/lib/food-truck-reminders.ts`, lifecycle sweep):
  - 30/14/7/1 days before FINAL_DUE_AT, to every selected truck with a
    balance, imports included.
  - Only the current stage is sent, and nothing after the due date.
  - **Gated by `FOOD_TRUCK_REMINDERS_ENABLED=true`** (off until Ryan sets
    it); `?dry_run=1` shows `food_truck_reminders.would_send`.
  - Copy is in the content editor ("Food truck application": balance reminder).
- **January 2**: one internal email to CONTACT_EMAIL listing selected trucks
  not paid in full (deposit only / nothing paid). Not gated; claimed once.
  Dry run shows `food_truck_unpaid_report`.
- **Admin**:
  - Payment shows paid / total, with a red "Not paid in full" flag from the
    day after the due date.
  - The header adds "N paid in full".
  - **Release** on selected trucks: released + unpublished (frees the slot),
    pending/overdue invoices cancelled, payments kept, no email.

Tests: `npm test` 291 PASS. `npm run build` PASS with the prebuild guards.

## Not done / known

- No screenshot of the admin changes; the sweep's food-truck branches have
  not run against a database (rules unit-tested; dry run available after deploy).
- Before 2026-12-02 (first 30-day reminder): set
  `FOOD_TRUCK_REMINDERS_ENABLED=true` in Vercel after checking the dry run.
- PR 3: permit and license uploads with the verified check.
