# 2026-10-07 - Public food truck application, PR 1

Branch `feat/food-truck-application`. Spec, Ryan's decisions 1-10 and the PR
plan: [docs/superpowers/plans/2026-10-07-food-truck-application.md](../../superpowers/plans/2026-10-07-food-truck-application.md).
Ryan approved the five PR 1 defaults on 2026-10-07: switch stays off until
PR 2 merges; permit/license uploads move to PR 3; applicant photos go in the
public logo bucket under random paths; one active application per email per
event; the drafted copy is edited in the PR.

## Delivered, NOT applied: migration 091

**Order: apply 091, run verify_091.sql, THEN merge.** The admin page's Add
writes `status`, so the code must not go live before the column exists.

- `food_trucks.status` (pending / approved / waitlisted / not_selected /
  released). Existing rows become approved; new rows start pending.
- Application columns: photos (max 5), applied_at, acknowledged_at,
  decided_at, decision_email_opt_out, decision_email_sent_at.
- `events.food_truck_applications_open` (default false) and
  `events.food_truck_cap` (default 8).
- Triggers: the cap (approval past it refused, hint FOOD_TRUCK_CAP); publish
  only while approved; decision columns admin-only (090's staff-column
  trigger extended); a content editor's insert starts pending.
- Unique index: one active application per email per event. The migration
  aborts with the names if existing trucks already share an email.
- `food-truck-logos` bucket limit 5 MB -> 10 MB.
- No policy added, dropped or changed (enumerated in the header).

verify_091: `npm run verify:local -- supabase/verify/verify_091.sql` PASS
(A, B1-B5); `--audit` PASS (123 fixture inserts). Mutation check: with the
cap comparison disabled, verify_091 fails at B3. Block C prints the live
event's switch, cap and status counts (want: closed, 8, every truck approved).

`reconcile_approved_without_invoice.sql` block F now lists only APPROVED
trucks with no invoice (applicants are invoiced on approval); verify:local PASS.

## Code

- `/apply/food-truck` (public, no sign-in): closed message from the content
  editor while the switch is off; otherwise the form. Requirements list is
  code (`FOOD_TRUCK_REQUIREMENTS`), reading `FOOD_TRUCK_DEPOSIT_CENTS` (new,
  `food-truck-pricing.ts`) and `FINAL_DUE_LABEL`.
- `POST /api/food-truck-apply`: bot trap, validation
  (`src/lib/food-truck-submission.ts`), open check, service-role insert,
  receipt + notice to CONTACT_EMAIL, signed upload URLs per file (Vercel's
  ~4.5 MB body cap rules out posting photos). `POST
  /api/food-truck-apply/files` records what actually arrived.
- `POST /api/admin/food-trucks/decision` (admin): approve = status, invoice
  at the day price, Invite & link, ONE selected email; waitlist / not
  selected = status + email unless "don't send". Invite & link's account
  half moved to `src/lib/invite-link-server.ts` (the admin button uses it
  unchanged).
- `/admin/food-trucks`: switch, cap, "X of 8 selected", status column and
  filter, application panel (photos, dates, decisions, don't-send). Admin
  Add creates an approved truck (counts toward the cap).
- Content editor page "Food truck application": title, intro, acknowledgment,
  closed message, and the three decision emails. Drafted copy, for Ryan to edit.
- `/apply` food truck card links the form; the rodeo page footer links it and
  reads CONTACT_EMAIL (was a literal).

Tests: `npm test` 277 PASS (new: food-truck-submission, food-truck-decision).
`npm run build` PASS with the prebuild guards.

## Not done / known

- **No visual check of the form or the admin page.** The page's HTML was
  fetched from a local dev server and rendered the requirements; screenshots
  failed because the disk was full (117 MB free on 2026-10-07).
- The decision route has not run against a database (rules unit-tested).
- Until PR 2, checkout uses the 25% minimum for every invoice; the selected
  email already states the $100 first payment. Harmless while the switch is
  off (no applicant can reach approval), which is why it stays off.
- PR 2: $100 deposit at checkout, January 1 reminders (30/14/7/1), the
  January 2 internal list, "Not paid in full" flag, Release. PR 3: permit and
  license uploads with the verified check.
