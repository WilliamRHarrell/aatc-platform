# AATC Platform - Handoff

**Last session:** 2026-08-13
**State:** build green, 66 routes, both prebuild guards passing.
**Git:** see §1 - push state changes as soon as this is acted on.

**Environment (confirmed):** sending domain `send.allamericantattooconvention.com`
verified on an AATC-owned Resend account, DKIM/SPF/MX green.
`PAYMENT_ALERT_EMAIL` = `accounting@allamericantattooconvention.com`, delivering.
DNS is **Cloudflare**-managed (moved from eNom); WordPress records are proxied -
see CUTOVER.md §A for the SSL-mode trap.

The authoritative launch list is [CUTOVER.md](CUTOVER.md). This file is session
state; that file is the plan.

---

## 1. Do these first

### 1a. Migration 043 - APPLIED AND VERIFIED AT THE CATALOG LEVEL 2026-08-13

`supabase/migrations/043_service_role_and_owner_reads.sql`. **`verify_043.sql`
has been run. Do not re-run it.** Measured, not inferred:

- **both** clamp functions carry the exemption - `has_exemption = true` on
  `applications_force_safe_insert` AND `applications_protect_staff_columns`
- both are still `SECURITY DEFINER` with `search_path` pinned
- all four owner policies present

That closes the partial-apply question the single insert probe could not
answer. The remaining gap is behavioural, not structural - see the bottom of
this section.

**(1) service_role clamped by the 031/041 triggers - FIXED AND VERIFIED IN THE
DEPLOYED FUNCTIONS.** Both tested `is_admin()`, which is false for service_role
(no `auth.uid()`), and **triggers are not bypassed by service role the way RLS
is**. This silently broke `/api/admin/import-returning`, which inserts
applications with `status:'approved'`, `deposit_due_at` and `final_due_at` - all
three clamped, so imported returning exhibitors landed as `pending` with no
lifecycle dates. **`/api/admin/import-returning` is still not tested end to end** - the clamp is
gone, but nobody has actually run an import.

**The test is written and waiting for you to run it:**
1. Sign in as admin → `/admin/import-returning` → submit with a **throwaway
   address you control**. The route sends a real `returner_invite`.
2. `node scripts/verify-import-returning.mjs --email <that address>` - 17
   checks. 3-8 are the 043 clamp measured through the real route; 14-17 replay
   the lifecycle sweep's four predicates and confirm the exhibitor matches
   none of them.
3. `supabase/seeds/teardown_import_returning.sql` - paste the whole file, set
   `v_email`, run once to preview (starts in dry-run, deletes nothing), then set
   `v_dry_run := false` and run again. It refuses to run against the placeholder
   or a non-existent account, and verifies the rows are gone before reporting
   success.

**The orphaned-auth-user defect is fixed.** The auth user is created before the
application because `applications.user_id` references it, so every later
failure could strand a loggable-in account with no application AND make the
import unrepeatable for that address ("email already registered"). There is no
transaction spanning `auth.users` and the public schema, so the route now
compensates: a failure at the event lookup, the application insert or the
invoice insert deletes what it created and logs loudly if the compensation
itself fails. Invoice failure also removes the application - an approved
application with no invoice has a `deposit_due_at` and no `deposit_paid_at`,
which is the sweep's expiry profile exactly.

**`deposit_paid_at` - asked and answered: the route is correct.** It sets
`deposit_paid_at` AND `final_paid_at` on the invoice it creates, and the sweep
keys on those same two columns in all four branches, so an imported returner
matches none of them. This is NOT the admin-payment-handler failure mode. The
invariant is now commented at the call site, because it is load-bearing and
non-obvious: dropping to `status`/`amount_paid` alone would silently arm the
sweep against every imported exhibitor.
043 exempts `auth.uid() is null`. Do not widen further - the clamp is what stops
applicants self-approving.

**(2) REGRESSION from 038 - food_trucks.** Dropping `"Public read published
food_trucks"` removed the only SELECT path a vendor had to their own row: 017
granted them UPDATE but never SELECT, so the public policy was silently carrying
it. Breaks the `/portal` food-truck panel and the food_truck branch of
`/api/create-checkout`. Untestable behaviourally right now - `food_trucks` is
empty after the teardown - so **re-test both surfaces once a real food truck
exists.**

**(3) PRE-EXISTING - exhibitors.** No owner INSERT policy has ever existed, so
`RosterCompletionPanel`'s exhibitor-row creation has always been denied for
non-admins. Not caused by 038; found by the same sweep.

**(4) REGRESSION from 042 - booths.** Dropping 001's `booths: public read using
(true)` left only the deposit-gated public policy, so an exhibitor who is
approved but has not yet paid **cannot see their own booth assignment in
/portal** - precisely the person the portal exists to serve. Found by applying
the rule in §4 rather than by a report. Mine.

**Policy EXISTENCE is measured. Policy BEHAVIOUR is not.** Keep these apart -
conflating them is what let all four faults ship unnoticed.

- **Measured (2026-08-13):** all four owner policies confirmed present by
  catalog query - `food_trucks: own read`, `exhibitors: own insert`,
  `exhibitors: own read`, `booths: own read`. Re-checked by
  [verify_043.sql](../supabase/verify/verify_043.sql) query E.
- **NOT measured:** that any of them actually works. `food_trucks` and
  `exhibitors` have no rows and no booth has an `application_id`, so **no owner
  has ever read their own row through any of these policies.** A policy whose
  `using` clause is subtly wrong is indistinguishable in `pg_policies` from a
  correct one and returns zero rows at runtime.

That is still reasoned, not measured, and it is the weakest evidence in this
document. **Re-test all three surfaces once real rows exist:**

1. `/portal` food-truck panel - vendor reads their own truck
2. `RosterCompletionPanel` - creates an exhibitor row
3. `/portal` booth display - an **approved but UNPAID** exhibitor sees their
   booth. Test with an unpaid one specifically: a paid exhibitor is also covered
   by the deposit-gated public policy, so that case passes whether
   `booths: own read` works or not.

The service-role exemption (finding 1) is in a different position: it was
measured behaviourally by probe, but the **deployed function bodies have never
been read**. A probe proves the symptom is gone, not which change removed it -
and a partial paste (the failure that hit 034 three times) would fix the INSERT
clamp and leave the UPDATE clamp broken with no error raised. That is what
[verify_043.sql](../supabase/verify/verify_043.sql) queries A - D exist to catch.

### 1b. Then

- [x] **EMAIL GATE MET - all nine confirmed as INBOX ARRIVALS** in
      `accounting@`, 2026-08-13. Not acceptances. Settled; do not re-litigate.
      Re-run the harness only if the sending domain, the Resend key or
      `/api/send-email` changes.
- [x] **verify_041, verify_042 and verify_043 ALL RUN AND PASSED, 2026-08-13.**
      All three migrations had cited a `verify_NNN.sql` that did not exist; they
      are now written and executed. **Do not re-run them** unless the
      corresponding functions or policies change. Recorded results in §1a.
- [ ] **Run `supabase/verify/verify_034.sql`** if you want the per-FK output on
      record. 034 is the one migration whose effect cannot be probed through
      PostgREST - everything else below was confirmed by direct probe.
- [ ] **Finish the auth-then-read sweep.** Two routes were checked in depth
      (`send-email`, `create-checkout`). The remaining pattern to look for: a
      route that authenticates its caller and then reads with the
      request-scoped client. Cron and webhook callers expose it because they
      have no session. `create-checkout` is request-scoped **correctly** - its
      caller is a logged-in exhibitor paying their own invoice, so RLS should
      scope them - but it reads `food_trucks`, which is why finding (2) above
      matters there.

## 2. Migration state - 027 through 049

Applied through 044. Outstanding: 045, 046, 048, 049 (and 047, deliberately held). 027-033 and 035-042 confirmed by direct probe on
2026-08-03; 034 confirmed by the operator (its effect is not visible through
PostgREST); **041, 042, 043 and 044 confirmed by their verify files on
2026-08-13** - catalog-level, results in §1a and §4a. 045 is the only one
outstanding and must run after the deploy.

| | | |
|---|---|---|
| 027 | pin `search_path` on `is_admin()` | applied |
| 028 | break the applications↔invoices RLS cycle | applied |
| 029 | `invoices: own read` reaches sponsorship invoices | applied |
| 030 | sponsor homepage placement | applied |
| 031 | harden application inserts (clamp trigger) | applied |
| 032 | directory override | applied |
| 033 | payment method/reference + exactly-one-parent | applied |
| 034 | FK delete rules + one-active-event index | applied |
| 035 | atomic expire/cancel | applied |
| 036 | `amount_locked` | applied |
| 037 | `hold_expires_at` | applied |
| 038 | public views, column exposure closed | applied |
| 039 | granular roles + `has_role()` | applied |
| 040 | contest results schema | applied |
| 041 | owner UPDATE on applications + clamp | applied |
| 042 | booth `is_sellable` / `house_use` | applied |
| 043 | service_role trigger exemption + 4 owner policies | applied |
| 044 | `schedule_items` + sponsor presentation credit | applied + verified |
| 045 | rename Apply Hub CMS key `home` → `applyHub` | **NOT YET APPLIED - run after the deploy** |
| 046 | panels get real `panel_day` / `panel_start` | **NOT YET APPLIED - run BEFORE the deploy** |
| 047 | drop the free-text panel date columns | **HELD until 2026-08-20** |
| 048 | profile self-edit: audit trail + logo storage path | **NOT YET APPLIED** |
| 049 | sponsor owner UPDATE + commercial clamp + insert clamp | **NOT YET APPLIED** |

**Convention adopted after 046 failed with 42P16 (2026-08-14): `create or
replace view` can only APPEND columns.** It compares the new column list
positionally against the existing one and cannot reorder, rename or remove.
Both directions bite:

- Inserting a column mid-list → `cannot change name of view column "X" to "Y"`,
  which names the column at that POSITION, not the column at fault. 046 hit
  this putting `panel_day` where `location` was.
- Removing a column → `cannot drop columns from view`. 047 would have hit this.

**Rule: adding to a view? Append at the end and keep `create or replace` -
column order in a view is cosmetic, every caller selects by name, and no DROP
means the GRANT survives and no dependency can be destroyed. Changing shape any
other way? `drop view` then `create view`, WITHOUT `cascade`** - plain RESTRICT
errors if something depends on it, which is information; cascade silently
destroys it. Then reissue the `grant`, which the drop discards. Both statements
inside the same transaction, so readers see no gap.

**Convention adopted 2026-08-14: THE SUPABASE SQL EDITOR IS NOT psql.** It
rejects every psql client meta-command - `\set`, `\i`, `\echo`, `\d` - with
`42601: syntax error at or near "\"`. `teardown_import_returning.sql` opened
with `\set test_email …` and could not run at all. Parameterise with a plpgsql
variable inside a `do` block instead. Checked: that was the only file affected.

**Convention adopted 2026-08-14: the Supabase SQL Editor shows only the LAST
statement's result.** Every earlier statement runs but its output is discarded
silently - nothing errors, the results just never appear, which reads as "this
file only had one check in it".

Consequences, all now applied:
- Every `verify_NNN.sql` carries a header saying to run one lettered block at a
  time, and blocks holding two queries are marked `(2 queries)` with the second
  labelled `X2 of 2`.
- A verify file must never END on a decorative `select 'note'` - that would be
  the only thing displayed to anyone who ran it whole. `verify_046` did; it is
  now a comment.
- A migration that reports two figures must combine them into ONE select. `045`
  reported `rows_moved` and `stale_home_rows` separately, so `rows_moved` - the
  actual outcome - was invisible. Now one row, two columns.
- `verify_034` is immune by construction: it is a single `union all` returning
  one row per check. That is the most robust shape for this editor and is worth
  copying when a file's checks are homogeneous.

**Convention adopted 2026-08-14: a teardown must ASSERT, not just delete.**
`teardown_import_returning.sql` shipped with its placeholder address still in
it. Had the `\set` syntax error not stopped it first, every statement would
have matched zero rows and the file would have reported a clean successful
teardown having deleted nothing - the same silent-success shape as the RLS
writes returning `data: []` with `error: null`, and the reason you stop
looking. It is now a single `do` block that **refuses** to run against the
placeholder, **refuses** to run if the account does not exist (zero matches is
"wrong address", not "already clean"), and **refuses** to report success unless
the rows are provably gone afterwards. It also starts in dry-run mode: the
preview counts through the same code path as the real delete, then raises to
roll back, so what it reports is what the live run will remove.

**Convention adopted after 034 truncated in the SQL editor three times:**
migrations stay short enough to paste; substantial verification goes in a
companion `supabase/verify/verify_NNN.sql` rather than an embedded `DO` block.
Three failures landed in assertion blocks rather than the DDL they guarded.

## 3. What changed this session

**Security.** Public tables exposed every column of every visible row - sponsor
`amount`, `email`, `phone` and `notes` were readable with the anon key that
ships in the client bundle. 038 replaced public table access with four
`SECURITY DEFINER` views and revoked anon's SELECT on the base tables. Also
fixed: an RLS recursion (42P17) that made the public directory return nothing to
real visitors for twelve weeks, an unpinned `search_path` on the function gating
every admin policy, and an insert path that let an applicant set their own
`status`, `total_amount` and lifecycle dates.

**Broken write paths.** Three features shipped non-functional because PostgREST
returns `data: []` with `error: null` when RLS filters a write. Roster
completion - which sets `needs_roster`, half the directory gate - and sponsor
self-claim both silently affected zero rows. All ten self-service write sites now
carry `.select()` and a zero-row check via `src/lib/db-write.ts`. Sponsor
self-claim was removed rather than repaired; admin-linking replaces it and still
needs building.

**Email.** Nothing had ever delivered to a real recipient: the sender was
Resend's shared sandbox, which refuses every address but the account owner, and
no call site checked the response. Domain now verified. The harness then found a
second fault: `/api/send-email` read applications with the service role but
sponsorships and invoices with the request-scoped client, which is anonymous for
a cron caller - so after 029/038 tightened those reads, `deposit_reminder`,
`final_reminder` and `sponsor_approved` all failed outright. Fixed in `6bcd882`;
8 of 9 templates now accepted.

**Data.** All 14 test applications, the March test panels/contests/food trucks
and the duplicate 267-booth set removed. Two events existed for the same show;
the inactive one is retained empty as a rollback anchor.

**Pricing.** Sponsor tiers were triplicated across three files with a fourth copy
of the rendered strings - the public application form quoted Gold at $3,000
against a $5,000 packet. Now single-sourced in `lib/sponsor-tiers.ts`. Booth
prices, add-on labels and the final-payment date were the same defect class and
are now derived.

**Built:** the homepage (was a bare redirect to `/apply`), granular admin roles
with `/admin/users`, the directory funnel diagnostic, noindex/robots on
non-production hosts, and the vertical promo video section.

## 4. Standing rules - do not break these

- **The sweep has TWO preconditions, and only one is met.** Email: MET
  (nine inbox arrivals, 2026-08-13). **Stripe reconciliation: STILL OPEN** -
  and it is the one that matters most, because the sweep targets "approved, no
  `deposit_paid_at`", which is exactly an exhibitor who paid you outside the
  platform. Arming now expires the people who have already paid.
- **The sweep is armed in TWO stages, not one.** `LIFECYCLE_SWEEP_ENABLED`
  turns it on in reminders-only mode; `LIFECYCLE_SWEEP_DESTRUCTIVE` enables the
  expiry and cancellation branches that release booths. Run a full cycle on
  reminders-only and review `would_expire` / `would_cancel` before the second
  flag. Booth release is irreversible - no history table. Procedure in
  CUTOVER.md §C.
- **`LIFECYCLE_SWEEP_ENABLED` stays unset until nine templates are confirmed
  ARRIVED IN THE INBOX - not nine API acceptances.** The harness reporting 9/9
  means Resend accepted them, nothing more. The whole reason this gate exists is
  that the platform spent months reporting successful sends that were being
  refused at the API, and no call site noticed. The sweep expires applications and **releases booths**,
  its `sendEmail()` helper never checks the response, and booth release is not
  reversible from inside the platform. Its target profile - approved, no
  `deposit_paid_at` - is exactly an exhibitor who paid outside the platform.
- **`NEXT_PUBLIC_SITE_URL` stays on the vercel.app host** until DNS cutover. It
  is the master switch for robots/noindex/canonical; flipping it early emits
  canonicals for URLs WordPress does not serve.
- **Before writing any RLS policy, list what already exists on the table.**
  Permissive policies OR together, so a stricter policy added alongside a
  `using (true)` baseline is decorative. This happened three times.

- **PERMISSIVE BASELINES WERE DOUBLING AS OWNER POLICIES. Four for four.**
  This is not four mistakes; it is one architectural fact about how the schema
  grew. Every `using (true)` policy was serving two populations at once - the
  public, and the row's own owner - and nobody ever wrote the owner policy
  because the baseline made it unnecessary. Nothing ever tested the owner path,
  so dropping the baseline broke it silently every time.

  | Table | Baseline dropped | Owner path it was silently carrying |
  |---|---|---|
  | `sponsorships` | 030, 038 | sponsor reading their own row (self-claim) |
  | `applications` | 024/028 tightening | owner UPDATE - roster completion |
  | `food_trucks` | 038 | vendor reading their own truck |
  | `booths` | 042 | exhibitor seeing their own booth assignment |

  `exhibitors` is a fifth instance of the same shape, except the owner policy
  was never written at all rather than being carried.

  **THE RULE: dropping any permissive policy requires first enumerating who
  reads that table AS AN OWNER, not just who reads it publicly.** Grep the
  portal, the apply flow and the API routes for that table before writing the
  drop. Assume there is another one until you have checked.
- **Any write a non-admin performs needs `.select()` and a row-count check.**
- **Grandfathered prices** (Tattoo Goo $3,000, pre-July VIP Bag $800) are
  deliberate, not errors. `amount_locked` protects them; CUTOVER.md explains.

## 4a. Migration 044 + the 2027 schedule - APPLIED AND VERIFIED 2026-08-13

**Done. Do not re-run.** `verify_044.sql` passed:

- day counts **10 / 9 / 6** across Fri - Sun (25 items), Saturday closing 22:00 -
  matching the 2027 spec, not the 2026 schedule that was hardcoded before
- **zero panels with a mismatched day label** - both seminars resolve against a
  real schedule day, so neither is silently absent from the programme. That was
  query D, the check most likely to fail quietly.

`schedule_items` and both public views are live; `/events/schedule` and the
homepage read them.

**`presented_by` is a two-field design.** `presented_by_sponsorship_id` (FK) is
authoritative; `presented_by_fallback` (text) exists so the schedule could ship
before Nomadica and Whole Life Aftercare have sponsorship rows. The FK wins the
moment it is set - no schedule edit. Both views join on `status = 'confirmed'`,
so linking an unconfirmed sponsorship still renders the fallback rather than
announcing them early. `verify_044.sql` F lists the credits still carried as
plain text; it currently returns those two, and it will stay non-zero until the
`presentation_credits` table exists (CUTOVER §E2).

### Still outstanding - apply in THIS order

**046 and 045 have OPPOSITE deploy orders. Read both before starting.**

| # | Step | When |
|---|---|---|
| 1 | `046_panel_real_dates.sql` | **BEFORE the deploy.** Purely additive; the live code keeps working because panel_date/panel_time stay. The new code reads `panel_day`, so deploying first would 42703 three public pages. |
| 2 | Deploy | after 046 |
| 3 | `verify_046.sql` | **B is the gate for 047** - 0 rows required. C is the backfill, side by side; eyeball it, because 047 is the irreversible part. |
| 4 | ~~`047_drop_panel_text_dates.sql`~~ | **DEFERRED - see below** |
| 5 | `045_rename_apply_hub_content_key.sql` | **AFTER the deploy** - opposite of 046. Its step 0 tells you whether ordering matters at all. |
| 6 | `seeds/panels_2027_signup_type.sql` | opens registration on both seminars and sets `max_capacity = 150`. Any time after 046. |
| 7 | `048_profile_self_edit.sql` + `verify_048.sql` | portal self-edit. Any time. |
| 8 | `049_sponsor_owner_update.sql` + `verify_049.sql` | admin sponsor-linking |
| 9 | The import-returning end-to-end test | §1a |

#### 047 IS DEFERRED ON PURPOSE - REVISIT 2026-08-20

**Not forgotten, and not blocked.** `047_drop_panel_text_dates.sql` is written,
correct and ready. It is being held for a week after the 046 deploy.

**Why.** Dropping `panel_date` / `panel_time` is the only irreversible step in
this change - once they are gone, the original display strings are gone, and a
bad backfill has to be rebuilt from the seed rather than compared against the
table. The overlap costs nothing: 046 is purely additive, both column pairs
coexist happily, and nothing reads the old ones any more.

**What the week buys.** If any path neither of us checked still selects
`panel_date`, it keeps working instead of throwing 42703 on a public page - and
we find out while the columns still exist. Grep found every reader we know of;
this is insurance against the ones grep does not catch (a saved query, a
script, an integration).

**On 2026-08-20**, if nothing has surfaced: run `verify_046.sql` once more,
confirm B is still 0 rows, then run 047. After it, `verify_044.sql` query D can
be deleted - it checks a failure mode that no longer exists.

#### Seminar rooms - confirmed 2026-08-13

Both 2027 seminars are on **Sunday**, so both are in the **Ballroom, 150 seats**
 -  that is what the signup_type seed sets. At 150 the amber flag in
`/admin/panels` does not fire until 120 registrations, so last year's ~50
turnout raises nothing.

**The 50-seat Seminar Room is Friday and Saturday only, and nothing is scheduled
in it.** If a Friday or Saturday seminar is ever added, **its `max_capacity` is
50** - and that is the room where a Bookkeeping-sized turnout (~50) would
actually be tight. Worth knowing before a session is placed there.

Remember `max_capacity` is a planning target throughout: nothing enforces it,
registration never closes, and the roster **undercounts the room** because
walk-ins do not register. That caveat is rendered above the registration list in
`/admin/panels` as well as here.

### Detail

1. `supabase/migrations/045_rename_apply_hub_content_key.sql` - **run it AFTER
   the deploy is live, not before.** Step 0 in its header tells you whether the
   ordering matters at all: `select count(*) from page_content where page_key =
   'home';` - a 0 means no window exists and you can run it whenever. Full
   sequence and rollback are in the migration header.
2. The `/api/admin/import-returning` end-to-end test - procedure in §1a.

## 5. Next, in order

1. **BUILT - `/admin/schedule` CRUD.** Full add/edit/delete/publish-toggle with
   a sponsor picker offering only CONFIRMED sponsorships, and `guardedWrite()`
   on all four write paths. A banner points at `/admin/panels` for seminars so
   nobody creates a duplicate. **Admin-only for now - see item 2.**

2. **`content_editor` CANNOT USE THE CONTENT PAGES. Fifth instance of the
   permissive-baseline pattern, and this one is live.** `panels` now carries
   exactly one policy - `panels: admin all` (`is_admin()`) - because 038 dropped
   `"panels: public read"`, which had been the only thing letting a non-admin
   read the table at all. But `/admin/panels` is in `content_editor`'s allowed
   PATHS and in their sidebar.

   So a `content_editor` navigating to Panels sees an **empty list**, and every
   write is refused. The role split is documented as "navigation-level only",
   which undersells it: for panels it is not a weaker boundary, it is a
   **non-functional page**. `schedule_items` has the identical shape, which is
   why `/admin/schedule` was deliberately left out of their PATHS rather than
   shipped broken.

   Not measured against a live `content_editor` session - reasoned from policy
   state, same evidence class as §1a. **Verify before fixing:** sign in as a
   `content_editor` and open `/admin/panels`.

   **NOT A LAUNCH BLOCKER - IT IS A PREREQUISITE FOR THE INVITE.** No
   `content_editor` account exists, so nobody can reach the broken page today.
   **Tie this fix to creating the first one.** Issuing that account without it
   means the marketing person signs in, opens `/admin/panels`, sees an empty
   list, and every write they attempt is silently refused - they will assume
   they broke something, or that the platform is empty.

   Fix is a small migration adding `has_role('content_editor')` policies to
   `panels` and `schedule_items` - 039 added `has_role()` and nothing has ever
   used it. Then add `/admin/schedule` to their PATHS in the same change.

   **Build it at the moment the account is created, not before**, so it is
   verified against a real `content_editor` session rather than shipped
   reasoned-but-unmeasured for the sixth time.

3. **BUILT - Portal profile self-edit.** Artists and vendors can now edit
   business name, website, Instagram, Facebook, phone and logo from `/portal`.
   Publishes immediately, no queue. Needs migration 048.

   **No new table policy was required.** The directory reads `applications`
   directly (not `exhibitors`), 041 already granted owners UPDATE on their own
   row, and its clamp does not cover any directory-facing field - so the write
   path was already open. `verify_048.sql` E re-checks that, because if any of
   those six columns ever joins the clamp the portal will save "successfully"
   and the value will revert.

   **048 adds two things that WERE missing.** An audit trail (`profile_edits`,
   written by an AFTER UPDATE trigger - after, so it records what was stored
   rather than what was submitted and then clamped), and owner write policies on
   the `exhibitor-media` storage bucket, which had only admin insert/delete.
   That second one also fixes a live latent bug: **the existing sponsor logo
   upload in `/portal` writes to the same bucket and has never worked for a
   non-admin.**

   Admin feed is on the `/admin` dashboard - exhibitor edits by default, staff
   edits behind a toggle, old → new per field. `business_name` is the one to
   watch: it is not only the directory listing, it is how staff find an
   exhibitor on an invoice and a booth assignment.

   Also guarded `saveSponsorProfileFn` while in the file - it had no `.select()`
   and `sponsorships` has no owner UPDATE policy at all, so it was toasting
   success having changed nothing.

4. **BUILT - Admin "link sponsor to user account".** `/admin/sponsorships` now
   has Link account / Linked ✓ per row, backed by `/api/admin/link-sponsor`.
   Needs migration 049.

   **The account must already exist.** The route deliberately does not create
   one - minting a login the sponsor never asked for and cannot access is worse
   than asking them to sign up first, and the account existing is itself proof
   the address is theirs. That is the whole difference from the removed
   self-claim, which matched on email alone with no verification.

   **049's clamp is an ALLOW-LIST, and that is a deliberate divergence from
   041.** 041 enumerates what a non-admin may not change, so every column added
   to `applications` later is owner-editable unless somebody remembers to extend
   the trigger - it fails open, silently. 049 rebuilds NEW from OLD and takes
   only seven keys from the submitted row (contact_name, email, phone, website,
   instagram, facebook, logo_url), so a new column on `sponsorships` is
   protected by default. On a table holding tier, amount, placement flags and
   `amount_locked`, failing closed is the only safe direction.
   `verify_049.sql` C checks the allow-list has not been "fixed" into a
   deny-list.

   **Found while enumerating: the public sponsor insert has the same hole 031
   closed on applications.** `"Anyone can submit sponsor application"` is
   `with check (status = 'pending')` - row-level, so it constrains one column
   and the submission can set every other. That was survivable before; with an
   owner UPDATE policy in place it is not, because a submission setting its own
   `user_id` **self-links past the admin linking step** and grants itself the
   edit rights 049 creates. It could also set `amount_locked`, the flag whose
   entire job is resisting price correction. 049 clamps the insert too. `tier`
   and `amount` are deliberately left alone - they are the request an admin
   confirms, and recomputing price in SQL would duplicate
   `lib/sponsor-tiers.ts`.

   **`verify_049.sql` F is worth running even if you trust the rest**: the
   insert hole was open until 049, so it lists every existing link and every row
   that already carries a placement flag or a lock, to be cross-checked against
   what staff actually did.
5. **Floor plan, read-only. ~2.5 days** now that booth coordinates are
   extractable from the venue PDF. Needs the current-year plan from the Crown
   Complex; the 2024 one has 265 real booths, a mislabelled 165/166, and no 233.
6. **Wall of Honor. 8-9 days.** Largest unscoped item, and its WordPress media is
   a cutover dependency. `scripts/import-wall-of-honor.mjs` is written and tested
   against a representative CSV.

   **It has a slot in the programme: Friday 12:30 PM.** The *Missing Man Table
   Presentation / Fallen Artists Moment of Silence* is the Wall of Honor's
   in-show moment, seeded as a `schedule_items` row with `kind = 'tribute'`.
   That changes the scope: the Wall of Honor is not only ambient signage and a
   web page, it is a scheduled presentation, and whatever is built needs
   something presentable in the room at that time. Treat the copy accordingly -
   same for the **Gold Star VIP Meet & Greet** (Sat 10:00 AM), where Gold Star
   means the families of fallen service members and must not read as a ticket
   tier.
7. **Role split part 2** - column-level protection. Today's split is
   navigation-only: a `content_editor` who knows the API can still read artist
   government photo IDs. Accepted for two trusted colleagues; not for anyone
   external.
8. **Contest results public build** - early 2027; schema already landed.

## 6. Scripts

| | |
|---|---|
| `verify-email-templates.mjs --to <addr>` | proves all nine templates |
| `test-payment-alert.mjs` | payment alert deliverability |
| `verify-sponsor-visibility.mjs` | anon-key RLS surface check |
| `check-event-dates.mjs` | prebuild: config vs DB dates |
| `check-no-date-literals.mjs` | prebuild: no date literals in email templates |
| `import-wall-of-honor.mjs` | Gravity Forms media harvest |

`supabase/verify/verify_0NN.sql` - post-migration checks, read-only.
`supabase/seeds/` - RLS harness records, teardown scripts, held Tattoo Goo SQL.

## 7. Loose ends

- **RLS harness records are live, anon-readable, and must stay that way.**
  Two sponsorships named `ZZ TEST ... RLS Harness`, plus an invoice and an auth
  user. Their visibility to anon is the thing under test: delete them and
  `scripts/verify-sponsor-visibility.mjs:131` does not fail, it goes **vacuous**
  - printing PASS with no pending row left to prove anything about. A test that
  cannot fail is worse than no test.

  They are hidden from visitors at the **presentation layer only**, by
  `src/lib/sponsor-display.ts`, applied at the three public read sites (homepage,
  `/sponsors`, footer). Never hide them with RLS - that would disable the thing
  being verified. This filter could not wait for cutover because `sponsor_name`
  is rendered as an image `alt`, so screen readers announced the row as a real
  sponsor of the convention.

  Full removal is a cutover step and is FK-ordered; see docs/CUTOVER.md section B.

- **Skin Specialists is the first real presentation credit.** They fund all
  three Miss AATC Pinup Contest gift certificates ($200 / $150 / $100). Credited
  in the prizes section of `/events/pinup-contest`, rendered from
  `PINUP_PRIZE_SPONSOR` in `src/lib/event-config.ts`.

  **Not** in `presentation_credits` - that table does not exist yet. When it is
  built, this is its first genuine row, and the hardcoded credit on the pinup
  page should be migrated to read from it rather than left as a second source.

  Prize copy lives in exactly one place, `src/lib/event-config.ts`, and is
  imported by the page. It was previously inline and wrong in two ways at once,
  both live: first place overstated by $300, and all three described as CASH
  when every award is a gift certificate. The wording is the substance of the
  prize - do not shorten '$200 Gift Certificate to Skin Specialists' to '$200'
  on any surface.

  'Convention Feature' is a photo shoot at the show, with the images used in
  AATC promotional material. Confirmed by Ryan, 2026-08-28, and rendered as a
  note on the first place row.

- **OPEN, for Ryan: does the pinup entry flow need a likeness release?** The
  first place Convention Feature prize uses a contestant's image in AATC
  promotional material. Whether that needs explicit consent captured at entry
  is a decision for Ryan, not a code question, and nothing has been built.

  Recorded here because of WHEN it has to be decided rather than whether. If a
  consent checkbox is wanted, it belongs in the same form as `age_confirmed`,
  captured at entry and stored on the row. Added later, it splits the entry list
  into people who agreed and people who were never asked - and the ones never
  asked are the early registrants, who are also the most likely to place.

- **Rate limiting is a Vercel WAF rule and is NOT in this repository.** Read
  the code alone and both anonymous public write paths look unprotected,
  because at the application level they are. That is by design, not an
  oversight.

  **EXACTLY TWO active rules**, both scoped to POST:

  | path | method | rule | where |
  |---|---|---|---|
  | `/api/pinup-entry` | POST | 5 req / 60s per IP, Deny 403 | Vercel dashboard |
  | `/api/panel-register` | POST | 5 req / 60s per IP, Deny 403 | Vercel dashboard |

  **Two DISABLED duplicates also exist in the dashboard - delete them, do not
  leave them disabled.** They cover the same two endpoints without POST in the
  description. A disabled rule reads as coverage to anyone scanning the list,
  so the next person adjusting a threshold may edit a rule that does nothing and
  conclude the change had no effect - or re-enable one and end up with two rules
  counting the same requests against different windows. Four rules for two
  endpoints is how that starts.

  Project -> Firewall -> Custom Rules, Pro plan or above. Chosen over an
  application throttle because it runs at the edge before a function is
  invoked, needs no dependency, no table and no migration, and cannot drift out
  of sync with the code it protects.

  Two consequences worth holding on to:

  1. **It is invisible to every check in this repo.** No test, no build guard
     and no verify script can observe it. Deleting the rules breaks nothing and
     reports nothing.
  2. **It does not survive recreating the Vercel project.** It is not in
     `vercel.json` and is not restored by a redeploy or a re-import. See
     docs/CUTOVER.md section B2.

  `src/lib/bot-trap.ts` is a complement, not a substitute: a honeypot field and
  a minimum fill time, both client-supplied and both forgeable. It filters
  generic form spam, which fills every input and posts instantly. The WAF is
  what stops anything written for this site specifically.

  The honeypot is rendered by `src/components/HoneypotField.tsx` off-screen
  rather than with `display:none`, with `aria-hidden` on the wrapper and
  `tabIndex={-1}` on the input, so nobody using a screen reader or a keyboard
  can land in it - the penalty for touching it is a silently rejected
  submission, which is not a thing to leave reachable. `autoComplete="off"`
  stops a saved-address feature filling it in and locking a real person out.

- **CONFIRMED: both "10th" claims are correct. Do not strip them.**

  | claim | where |
  |---|---|
  | 10th annual Miss All American Pin-Up Contest | `content/registry.ts:67`, `:211` |
  | 10th Annual All American Tattoo Convention | `lib/aatc-template.ts:60` |

  Source: Ryan, direct confirmation 2026-08-31. Recorded because the ordinal is
  exactly the shape of unverified factual claim this project has removed
  elsewhere - fabricated venues, invented DJ names, a $500 prize that was
  actually a $200 gift certificate - so a future audit will flag it again.
  It has been checked. Leave it.

- **RULE: when adding a consent, rule, fee or restriction, grep for absolute
  statements the change makes untrue.** A blanket claim can become false through
  a change made on a different page, and nothing will flag it - it was true when
  written, still compiles, and still reads fluently.

  Search visitor-facing copy for: `never`, `always`, `all`, `only`, `every`,
  `free`, `anyone`, `nothing`, `public`. Most hits are the brand name and are
  noise; the ones that matter are promises about what is required, who can do
  something, and what it costs.

  Two live examples, both found this way rather than by anyone noticing:

  1. `/info/policies` said marketing consent is "never required - you can enter a
     contest, or vote, without opting in". True when written. Migration 055 added
     a REQUIRED likeness release on the pinup form, and the sentence silently
     became a description of all consent on the site that was no longer accurate.
  2. `/contests` and the `contests` CMS default both promised "30 days of PUBLIC
     voting". True when written. Migration 053 tied a vote to `auth.uid()`, so
     voting now needs an account - and the copy still told visitors it did not.
     Corrected to say voting is free but needs an account, matching the sign-in
     prompt the board already renders.

  The second is the sharper one: the code change was correct, the copy change was
  simply never made, and no test can catch a sentence that has quietly stopped
  being true.

- **The likeness release IS a condition of entry. That is a deliberate
  exception.** The pinup form carries three consents and they are not equivalent:

  | consent | required? | why |
  |---|---|---|
  | `age_confirmed` | yes | contestants must be 18+ |
  | `likeness_release` | **yes** | the first place prize is a photo shoot |
  | `marketing_opt_in` | **no** | never a condition of anything |

  Confirmed by Ryan, 2026-08-31. The reasoning for making the release mandatory
  rather than optional-with-a-contingent-prize: judging happens on the day, and a
  contest whose top prize cannot be awarded to some entrants forces you either to
  check consent before judging or to re-award afterwards. Both are worse than
  asking up front. It over-collects in one sense - 24 of 25 entrants consent to
  something only the winner uses - which is why the wording states the tie to the
  prize on its face instead of reading as boilerplate.

  Enforced in THREE places so the route is not the only thing standing between a
  POST and a stored entry: the check constraint, the anon insert policy
  (`with check (... and likeness_release = true)`), and `register_pinup_entry`
  itself.

  `/info/policies` distinguishes the two explicitly. Without that the page's
  "marketing is opt-in and never required" section would read as covering all
  consent on the site, which is no longer true.

- **RULE: never edit a migration someone is partway through applying.** Add a
  new one instead. A migration edited mid-run yields a database matching neither
  version of the file, and nothing in the run looks wrong - the editor reports
  success for whatever text was pasted. 058 exists for exactly this: the
  after-party night slugs belonged logically in 056, but Ryan was applying 056
  at the time. Migrations are cheap; a database in an unrecorded state is not.

- **RULE: confirm the new source matches the old BEFORE deleting the old.** When
  moving hardcoded content into a table, the table does not exist until the
  migration is applied, and a deploy usually lands first. Deleting the hardcoded
  copy in the same change means the section goes dark in between.
  `TeamSection` takes a temporary `fallback` prop carrying the same two people,
  used only while 059 is unapplied; it and `TEAM_FALLBACK` in
  `src/app/info/about/page.tsx` are deleted once the rendered output is
  confirmed to match. Same discipline the VIP price and Collector's Choice
  consolidations used.

- **RULE: a claim about what a page RENDERS must check both code and data.**
  Rendered HTML on the deployment is the authority; a source grep is a hint.

  I reported the Tattoo Battle credit as appearing on no page, having grepped
  `src/` and found nothing. It was rendering on `/events/schedule` the whole
  time, from `schedule_items.presented_by_fallback` - data, not code. Nomadica
  is the same, rendering on the homepage from `panels.presented_by_fallback`.

  This is the absence rule again, one layer over: **an absence found by one
  method is not an absence.** It will recur and get worse as the section 16 work
  moves content out of source files and into tables - page_content,
  page_images, page_galleries, team_members, schedule_items and panels all now
  render text or images that no source grep will ever find.

  Practically: `curl` the deployed page and grep THAT. It is the only check that
  sees both layers at once, and it is what caught every rendered-output claim in
  this session that turned out to be right.

- **RULE: rollback direction follows which failure is VISIBLE.** When a write
  spans a file and a row, the order and the rollback are not a style choice -
  pick whichever failure a visitor can see, and make that one impossible.

  | operation | order | why |
  |---|---|---|
  | upload | file, then row - **remove the file if the row fails** | an unreferenced file is invisible; a row pointing at nothing is a broken image |
  | remove | row, then file | a blocked row delete leaves the image showing, which is harmless; the reverse leaves a live row pointing at a deleted file |

  Both are in `/admin/page-images` and `/admin/galleries`. The same reasoning
  already applied to the contest entry delete, which removed the storage photo
  BEFORE the row and so left a competition record pointing at a dead image when
  the delete was silently blocked.

- **RULE: make the invalid state unreachable, not merely detectable.** Alt text
  is validated BEFORE the upload in both image admins, not after. 050 has a
  check constraint that rejects an image with blank alt, so uploading first
  would put a file in the bucket and then fail the row write - an orphan that
  looks like a successful upload to whoever browses the bucket later. The
  constraint is the backstop; the ordering is the fix.

  `page_galleries.alt` is NOT NULL outright rather than conditionally, because
  a gallery row IS an image - there is no state in which its alt text is
  legitimately absent. `page_images.alt` has to stay conditional because a slot
  can exist before its image does.

- **RULE: a residue check and a cleanup are different jobs and must not share a
  block.** A final block that deletes fixtures AND reports what is left destroys
  the evidence that the owning block failed to clean up - it always reports
  clean, because it just made itself clean. Cleanup belongs to the last block
  that needs the fixture; the last block in the file only LOOKS. `verify_054`
  block Z is the pattern: four counts, no deletes.

- **RULE: a test fixture supplies every required column itself; it does not rely
  on a trigger to fill them in.** `verify_054` created an `auth.users` row and
  then inserted a `profiles` row with only `(id, role)`, depending on
  `on_auth_user_created` to have already created the profile so that
  `ON CONFLICT` would take the update branch. The trigger did not fire, the
  insert branch ran with a null `email` - which is NOT NULL - and the file
  aborted before a single assertion executed. Migration 054 was fine; it was
  simply untested.

  Write fixtures so they work whether or not the trigger runs, and have the
  conflict branch set the same columns as the insert, so both paths converge on
  one fully-populated row instead of one of them leaving a half-populated one.

- **RULE: when a fix produces a new failure downstream, check whether that code
  had ever run before assuming the fix broke it.** Two bugs can stack, the first
  masking the second, and the repair then presents as a regression it did not
  cause.

  Concretely: `verify_052` block D had a snapshot defect that aborted the whole
  file. Block G had a separate defect - it set capacity to 1 while inheriting two
  rows that blocks D and E leave behind, so it asserted 'confirmed at position 1'
  against a count of 2. Because D aborted first, and the whole file is one
  transaction, **block G had never executed once**. Fixing D did not break G; it
  revealed G.

  The tell is that the "new" failure is in code with no history of passing. Check
  that before treating it as a regression - the alternative is reverting a
  correct fix to restore a state where the second bug was merely invisible.

- **RULE: cleanup belongs with the LAST BLOCK THAT NEEDS the fixture, not with
  whichever block happens to run next.** In `verify_052`, blocks D and E created
  rows and the delete lived at the end of block G. That made G's correctness
  depend on undeclared ordering, and G is the block whose assertion the rows
  broke.

  A block that has a precondition must ESTABLISH it, not inherit it - and then
  ASSERT it, because ensuring only covers the fixtures you know about. A real
  row would produce the same off-by-N against a script that looks correct.
  `verify_051` block F was hardened the same way even though it passes: a pass
  that depends on undeclared block ordering is luck, not a guarantee.

- **A speculative error message is evidence of an unguarded write.** The
  page_content save handler read `toast.error('Save failed - are you an admin?')`.
  Nobody writes that by accident: someone hit the failure, diagnosed the cause
  correctly, and shipped a GUESS in place of a check. The write had no
  `.select()`, so there was nothing to check with - it reported a save that
  never happened, then purged the cache and re-served the old copy as the new
  one. An editor would have saved twice and concluded the CMS was broken.

  When hunting the remaining unguarded writes, grep for error strings that
  speculate about the cause rather than report it: `are you`, `you may not`,
  `permission`, `try again`, `?'` inside a toast. Each one marks a place
  somebody already met this failure and could not detect it.

- **Admin write-guard inventory. 33 calls remain unguarded, all money/identity.**
  A Supabase write that RLS filters out returns `error: null` and zero rows.
  Checking only `error` therefore reports success for a write that never
  happened. `guardedWrite()` (src/lib/db-write.ts) treats zero-rows-no-error as
  a failure, and it requires a `.select()` on the query or there are no rows to
  count.

  Full scan of `src/app/admin/**` and `src/app/api/admin/**`, 59 write calls:

  | | count | status |
  |---|---|---|
  | guarded, or checks returned rows | 39 | done |
  | editorial, unguarded | **0** | done |
  | `applications`, unguarded | **0** | done |
  | money / identity, unguarded | **20** | OUTSTANDING |

  The remaining 20, by table: `invoices` 10, `sponsorships` 7, `booths` 2,
  `profiles` 1 (`api/admin/set-role`). These stay admin-only under the RLS
  widening, so a role mismatch is unlikely to trigger them - but a wrong `.eq()`
  or an already-deleted row produces the identical silent success today, on the
  tables where it costs the most.

  A note on counting them: an insert using `.select(...).single()` IS guarded,
  because `.single()` errors on zero rows. Several inserts read as gaps to a
  naive scan because the `.single()` sits twenty lines below the `.from()` call.
  Check the whole statement before treating one as unprotected.

  Tracked here rather than remembered. Fixing RLS without fixing this pattern
  leaves the same class of bug waiting for the next mismatch.

- **Audit fixture inserts:** `python3 scripts/check-sql-fixtures.py`

  Flags any `insert into` in a verify script that omits a column the table
  requires (NOT NULL, no default). Written after `verify_054` aborted before a
  single assertion ran because its fixture left out `profiles.email`.

  It builds the schema by walking the migrations IN ORDER and applying
  `create table`, `add column`, `drop column` and `set not null` - not from
  `create table` alone. The first version did the latter and reported
  `contest_votes.voter_token` missing from five inserts in verify_053; migration
  053 drops that column, so it was noise. An extractor that ignores later ALTERs
  emits that forever and costs somebody an investigation each time to rediscover
  it is nothing.

  It also knows the difference between two kinds of trigger, which is the whole
  point rather than a detail:

  - **BEFORE INSERT on the same table** always runs, so omitting the column is
    correct. `contest_votes.vote_date` is set by `set_vote_date()` this way, and
    naming it in an INSERT would be wrong since the trigger overwrites it.
    Excused.
  - **AFTER INSERT on a different table** is a cross-table side effect that may
    not fire. `profiles.email` was left to `on_auth_user_created`, a trigger on
    `auth.users`. NOT excused - that is the bug this exists to catch.

  Mutation-tested: re-introducing the `profiles` omission is caught, and the
  legitimate `vote_date` omission stays clean.

- **Parse-check SQL without applying it.** `pip3 install pglast`, then:

      python3 -c "import pglast,sys; pglast.parse_sql(open(sys.argv[1]).read())" FILE.sql

  Real libpg_query bindings, so it is PostgreSQL's own parser. Catches the class
  that costs a round trip in the SQL editor - unterminated dollar quotes,
  reserved words as identifiers, unbalanced parens - without touching a
  database. All 75 files under supabase/ currently parse.

  Deliberately NOT wired into `prebuild`: the Vercel build image has no Python,
  so it would break deploys to catch a class of error that only ever reaches a
  human running a script by hand.

  Note what it does NOT cover: the plpgsql body of a DO block or a function is a
  string to the SQL parser, so errors inside one - an ambiguous column, a bad
  variable reference - parse clean. Only calling it finds those.

- **SQL Editor pre-flight warnings are parsed WITHOUT plpgsql context.** The
  analyzer reads a script as plain SQL, so constructs that are local to a DO
  block can present as DDL. `select id into v_event from ...` is a variable
  assignment inside plpgsql; outside it, `SELECT ... INTO name` is
  `CREATE TABLE name AS`. The editor duly warned that verify_051 "creates a
  table without enabling Row Level Security" and named `v_event` - a DECLARE
  variable, in a file that creates no table at all.

  Renaming the variable would not have helped: the trigger is the INTO syntax,
  not the identifier, so any name is misread identically. The verify scripts now
  assign with `v := (select ...)` and use `FOR r IN ... LOOP` for records, with
  a style note in each file. Do not convert them back.

  **The reason this was worth fixing rather than dismissing:** a warning that
  fires spuriously on every run trains the operator to click through warnings.
  That habit costs more than the rewrite, because the same dialog also carries
  a TRUE warning. "This query includes destructive operations" is accurate for
  every verify script here - verify_051 alone has nine DELETEs and one UPDATE.
  They are fixture cleanup, every one filtered to the `zz-` prefix, and each
  block removes its own rows. That warning should be read and recognised, which
  it will not be if the dialog has already been taught to mean nothing.

  Never accept "Run and enable RLS" on one of these. It appends an ALTER TABLE
  the script never contained, against a target chosen by the same misparse that
  invented the table.

- **DO NOT RE-RUN migration 051. It would break the live intake path.**
  051 contains `create or replace function register_pinup_entry(...)` with
  EIGHT arguments. 052 drops that signature and creates a NINE argument version
  carrying `p_marketing_opt_in`. Both are applied, and the live function is
  correctly the nine argument one - verified against the deployed PostgREST
  schema.

  Re-running 051 now would recreate the eight argument overload ALONGSIDE the
  nine argument one. Postgres allows that; the damage shows up at call time,
  because the route calls the function with NAMED arguments and a named call
  can match either overload. That raises an ambiguity error on the pinup intake
  path, in front of a contestant, and nothing about the migration run would look
  wrong.

  `verify_052` block C exists for exactly this: it asserts that only ONE
  `register_pinup_entry` survives. If a future migration needs to change that
  function again, it must drop the previous signature explicitly rather than
  relying on `create or replace`, which only replaces an identical signature.

- **RULE: in plpgsql, RETURNS TABLE column names become OUT variables.** Any
  bare reference to one inside the function body is ambiguous between the
  variable and the column of the same name. plpgsql's default
  `variable_conflict` is `error`, so it does NOT fail at `CREATE FUNCTION` - it
  raises `column reference "x" is ambiguous` at CALL time.

  Qualify every column reference in a function whose RETURNS TABLE shares a name
  with a column it touches. `register_pinup_entry` returns `(id, status,
  queue_position)` and reads `pinup_entries.status`; the unqualified version
  created cleanly and would have thrown a 500 for the first contestant to
  submit, on a contest capped at 25 where the earliest entries matter most.

  **Applying the migration cannot catch this.** Nor can inspecting `pg_proc`, nor
  checking the returned column names - all three report a healthy function. Only
  calling it does.

- **RULE: a verify block must CALL a function, not just describe it.** The two
  defects in `register_pinup_entry` failed at different moments and only one was
  loud:

  | defect | caught at | announces itself |
  |---|---|---|
  | `position` as a RETURNS TABLE column | CREATE FUNCTION (parse) | yes, 42601 |
  | bare `status` shadowed by the OUT variable | first CALL | no |

  So every function a migration creates or replaces needs a verify block that
  invokes it and reads back EVERY returned column, including the ones nothing
  consumes yet. `queue_position` is returned by `register_pinup_entry` and used
  by nothing - a hardcoded 1 or a null would have satisfied every other
  assertion in `verify_051`, which is why block F2 registers twice and asserts
  the value ADVANCES rather than merely existing.

  Note also that a `create or replace` in a later migration is a SEPARATE
  definition and needs its own verify. 052 rewrites `register_pinup_entry`
  wholesale, so `verify_052` re-asserts the capacity branch and the returned
  shape rather than trusting `verify_051`, which tested a different function
  body. Both copies carried both defects until they were fixed in both places.

- **RULE: a negative assertion needs a positive control.** Any check that
  something is absent, blocked, invisible, or rejected must be paired with a
  check proving the query could have found something in the first place.
  Without the control, the assertion passes when the mechanism it tests is
  broken, when the data is missing, and when the query is simply wrong - and it
  prints PASS in all three cases.

  This is not a style preference. It happened three times in one session, in
  three unrelated places, and every instance was silent:

  1. `verify_050.sql` block G asserted anon cannot read a deactivated row, using
     `set local role anon` as a bare statement. SET LOCAL outside a transaction
     is a no-op, so the check ran as `postgres` - the table owner, which
     bypasses RLS entirely. It would have reported PASS while testing nothing.
     Fixed by moving it into a DO block and adding an active-row control.
  2. `scripts/verify-sponsor-visibility.mjs:131` asserts anon cannot see pending
     sponsorships. Delete the harness rows and it does not fail - it goes
     vacuous, with no pending row left for anon to be blocked from seeing. This
     is why the harness rows are kept; see the entry above.
  3. The dash sweep rewrote the harness LIKE literals in `supabase/seeds/` and
     took every teardown match from two to zero. Both teardowns then aborted
     their preflight, and the teardown block deleted nothing while reporting
     success. Fails closed, announces nothing.

  4. `verify_051` block G counted advisory locks without filtering
     `pg_backend_pid()`. The whole file runs in one transaction and blocks F, F2
     and H all call `register_pinup_entry()`, whose `pg_advisory_xact_lock`
     holds until that transaction ends - so the block found the lock ITS OWN
     session was holding and reported it as a concurrent registration.

     **This one was read and believed.** It printed the strong PASS on a real
     run, a person read it, and moved on to the next script. The other three
     were caught by inspection before anyone relied on them; this is what the
     shape does when it is not caught. Fixed by adding
     `and pid <> pg_backend_pid()`.

  5. **A log that only fires on error cannot report a silent success.** The
     `import-returning` rollback deleted an application after a failed invoice
     insert and logged only when `error` was non-null. Its own comment says the
     surviving row is 'approved with no invoice and IS A SWEEP TARGET' - so the
     warning about that state could not fire in the case that creates it, since
     a zero-row delete returns no error. Guarded on row count in 723aa82.

  The shape is always the same: the check looks for an absence and an absence is
  what a broken check produces too. A check that observes a RESOURCE has the
  same failure - it finds the one it created itself. And a check that only runs
  on the error path cannot see the failure that produces no error.

- **Silent success is the default failure mode of an RLS write, not an edge
  case.** Measured on the live `page_images` table, not reasoned about: an anon
  `PATCH` to a row it has no policy for returns **HTTP 204**, and the row is
  unchanged. There is no 403 and no error body. PostgREST reports success
  because the UPDATE succeeded - against zero rows, since the policy's USING
  clause filtered the row out before the update applied.

  INSERT behaves differently: the WITH CHECK clause rejects the row outright and
  raises 42501. So the two halves of "can this role write?" fail in different
  shapes, and only one of them is loud.

  This is the exact case `guardedWrite()` (src/lib/db-write.ts) exists to catch,
  and why it treats `0 rows affected, no error` as a failure rather than a
  no-op. Any new write path that does not go through it needs its own row-count
  check. Any verify block asserting a write is blocked must assert on the row
  count, not wait for an exception that never arrives.

- **OPEN: `content_editor` write access on the section 16 content tables.**
  Migration 039 added a `content_editor` role. `page_images` (migration 050) is
  editorial content but is scoped to admin only, as specified. There are eight
  section 16 tables coming; the decision should be made once and applied to all
  of them rather than per migration. Widening is one line per table:
  `has_role(array['admin','content_editor'])` in place of `is_admin()`.
  Held deliberately - quietly granting write access is not a decision a
  migration should make on its own.

- **The pinup entry form does not submit anywhere.**
  `src/app/events/pinup-contest/PinupContestClient.tsx` `handleSubmit()` is a
  stub: it waits 800ms and sets `submitted`. There is no API route, no Supabase
  write, no table, no try/catch and no error state. The entrant is then shown
  **"You're Registered! We'll see you backstage at 6:30 PM on Saturday."**

  So a real person can fill in name, email, phone and address, be told they are
  registered for a contest with a $500 first prize, and have nothing recorded
  anywhere. Predates the server-shell refactor - it arrived in `2cd1448` - and
  the refactor did not change it, but it is a live intake path on a public page
  and should either be wired up or the form removed. Contrast with
  `/apply/artist` and `/apply/sponsor`, which write through `guardedWrite()`.

  HTML validation is present (`required` on name/email/phone, `type=email`,
  `type=tel`), so the browser blocks empty submits. Nothing else is validated
  and no failure is possible, because there is no request to fail.

- **Dashes: the real exclusion category is data, not syntax.** The repo-wide em
  dash sweep excluded regexes, URLs and import paths - all of them syntactic.
  That list was wrong. The category that actually matters is **any string
  literal compared against stored data**: SQL `LIKE` patterns and `WHERE`
  clauses, fixture strings, enum values matched to rows. They read as prose,
  which is exactly why they slip through.

  This is not hypothetical. The sweep rewrote the harness `LIKE` patterns in
  `supabase/seeds/` from an em dash to a hyphen while the rows still stored an
  em dash, taking every teardown match from two to zero. Both teardown scripts
  would have aborted their preflight and the harness would have been
  unremovable - and the teardown block would have deleted nothing while
  reporting success. It failed closed, so nothing was destroyed, but nothing
  announced it either.

  Guarding: `scripts/check-no-em-dashes.mjs` covers **`src/` only**. It does two
  opposite things - it fails on any dash in `src/`, and it fails if the harness
  literals in `supabase/seeds/` have **lost** theirs. The second half exists
  because a dash-presence guard cannot catch a dash being removed: after the
  sweep there is no dash left to find. `supabase/migrations/` is not guarded and
  must never be edited; the rest of `supabase/` is swept by hand.
- **Tattoo Goo** is `status='pending'` - an unanswered Gold offer at $3,000, hold
  expiring 2026-08-28. Accept path is held, commented, in
  `supabase/seeds/tattoo_goo_offer.sql`.
- **Two invoices exist, and this note used to describe the wrong ones.** It
  previously said $160 each against deleted food trucks (Jazz N Soul, Tacos
  Snacks). Those are gone. As of 2026-08-31 the two live invoices are:

  | amount | attached to | what it is |
  |---|---|---|
  | $3,000 | sponsorship `32ef207d` | Tattoo Goo, the unanswered Gold offer |
  | $500 | sponsorship `8a7cd934` | the ZZ TEST RLS harness pending row |

  Neither is an orphan - both carry a `sponsorship_id`. The harness one goes
  with the harness at cutover, FK-ordered. Verified by query, not by reading
  this note, which is why the note was wrong.
- **Storage still holds test uploads.** Delete `contest-photos`,
  `food-truck-logos`, `panel-images`, and the user-id folders in
  `application-docs` and `exhibitor-media`. Keep `exhibitor-media/sponsors/`
  (Tattoo Goo's logo), `aatc-graphics`, and `site-assets`.
- **PITR is off** - daily snapshots only, so restore granularity is one day.
- Two requests late in the session - a consent/pixel audit and an SEO schema -
  belong to other repositories. Neither has anything in this one: no pixels, no
  consent layer, no `/privacy-policy`.

---

## No placeholder humans

**Never generate a person's name, biography, credential, title, or quote.** This
covers team members, judges, artists, speakers, honorees, staff and performers.
If a slot needs filling before real data exists, **ship the empty state.**

The same applies to anything the show would have to honor: prices, rates, prize
amounts, door covers, weight classes, division names, venue names.

Why this is a hard rule rather than a style preference - three instances found in
one sweep, all of them live liabilities:

- **A fabricated Head of Veterans Outreach** on the page Gold Star families read.
  The copy invited bereaved families to contact a person who does not exist.
- **Three invented fallen service members** under "In Memoriam" on the Wall of
  Honor - names, ranks, units, service dates and family-voice tributes.
- **Three named hotels with nightly rates and an "AATC RATE" badge**, and
  **three after-party venues with door prices**. Anyone who called and asked for
  the AATC rate was told it does not exist.

Rewording an invented person is worse than deleting them: a reworded fabrication
still reads as a commitment. Delete, ship empty, and seed the CMS table empty -
**do not migrate anything out of git history without confirming the person is
real.**
