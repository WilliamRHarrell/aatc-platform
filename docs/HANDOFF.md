# AATC Platform — Handoff

**Last session:** 2026-08-13
**State:** build green, 66 routes, both prebuild guards passing.
**Git:** see §1 — push state changes as soon as this is acted on.

**Environment (confirmed):** sending domain `send.allamericantattooconvention.com`
verified on an AATC-owned Resend account, DKIM/SPF/MX green.
`PAYMENT_ALERT_EMAIL` = `accounting@allamericantattooconvention.com`, delivering.
DNS is **Cloudflare**-managed (moved from eNom); WordPress records are proxied —
see CUTOVER.md §A for the SSL-mode trap.

The authoritative launch list is [CUTOVER.md](CUTOVER.md). This file is session
state; that file is the plan.

---

## 1. Do these first

### 1a. Migration 043 — APPLIED AND VERIFIED AT THE CATALOG LEVEL 2026-08-13

`supabase/migrations/043_service_role_and_owner_reads.sql`. **`verify_043.sql`
has been run. Do not re-run it.** Measured, not inferred:

- **both** clamp functions carry the exemption — `has_exemption = true` on
  `applications_force_safe_insert` AND `applications_protect_staff_columns`
- both are still `SECURITY DEFINER` with `search_path` pinned
- all four owner policies present

That closes the partial-apply question the single insert probe could not
answer. The remaining gap is behavioural, not structural — see the bottom of
this section.

**(1) service_role clamped by the 031/041 triggers — FIXED AND VERIFIED IN THE
DEPLOYED FUNCTIONS.** Both tested `is_admin()`, which is false for service_role
(no `auth.uid()`), and **triggers are not bypassed by service role the way RLS
is**. This silently broke `/api/admin/import-returning`, which inserts
applications with `status:'approved'`, `deposit_due_at` and `final_due_at` — all
three clamped, so imported returning exhibitors landed as `pending` with no
lifecycle dates. **`/api/admin/import-returning` is still not tested end to end** — the clamp is
gone, but nobody has actually run an import.

**The test is written and waiting for you to run it:**
1. Sign in as admin → `/admin/import-returning` → submit with a **throwaway
   address you control**. The route sends a real `returner_invite`.
2. `node scripts/verify-import-returning.mjs --email <that address>` — 17
   checks. 3–8 are the 043 clamp measured through the real route; 14–17 replay
   the lifecycle sweep's four predicates and confirm the exhibitor matches
   none of them.
3. `supabase/seeds/teardown_import_returning.sql` — paste the whole file, set
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
itself fails. Invoice failure also removes the application — an approved
application with no invoice has a `deposit_due_at` and no `deposit_paid_at`,
which is the sweep's expiry profile exactly.

**`deposit_paid_at` — asked and answered: the route is correct.** It sets
`deposit_paid_at` AND `final_paid_at` on the invoice it creates, and the sweep
keys on those same two columns in all four branches, so an imported returner
matches none of them. This is NOT the admin-payment-handler failure mode. The
invariant is now commented at the call site, because it is load-bearing and
non-obvious: dropping to `status`/`amount_paid` alone would silently arm the
sweep against every imported exhibitor.
043 exempts `auth.uid() is null`. Do not widen further — the clamp is what stops
applicants self-approving.

**(2) REGRESSION from 038 — food_trucks.** Dropping `"Public read published
food_trucks"` removed the only SELECT path a vendor had to their own row: 017
granted them UPDATE but never SELECT, so the public policy was silently carrying
it. Breaks the `/portal` food-truck panel and the food_truck branch of
`/api/create-checkout`. Untestable behaviourally right now — `food_trucks` is
empty after the teardown — so **re-test both surfaces once a real food truck
exists.**

**(3) PRE-EXISTING — exhibitors.** No owner INSERT policy has ever existed, so
`RosterCompletionPanel`'s exhibitor-row creation has always been denied for
non-admins. Not caused by 038; found by the same sweep.

**(4) REGRESSION from 042 — booths.** Dropping 001's `booths: public read using
(true)` left only the deposit-gated public policy, so an exhibitor who is
approved but has not yet paid **cannot see their own booth assignment in
/portal** — precisely the person the portal exists to serve. Found by applying
the rule in §4 rather than by a report. Mine.

**Policy EXISTENCE is measured. Policy BEHAVIOUR is not.** Keep these apart —
conflating them is what let all four faults ship unnoticed.

- **Measured (2026-08-13):** all four owner policies confirmed present by
  catalog query — `food_trucks: own read`, `exhibitors: own insert`,
  `exhibitors: own read`, `booths: own read`. Re-checked by
  [verify_043.sql](../supabase/verify/verify_043.sql) query E.
- **NOT measured:** that any of them actually works. `food_trucks` and
  `exhibitors` have no rows and no booth has an `application_id`, so **no owner
  has ever read their own row through any of these policies.** A policy whose
  `using` clause is subtly wrong is indistinguishable in `pg_policies` from a
  correct one and returns zero rows at runtime.

That is still reasoned, not measured, and it is the weakest evidence in this
document. **Re-test all three surfaces once real rows exist:**

1. `/portal` food-truck panel — vendor reads their own truck
2. `RosterCompletionPanel` — creates an exhibitor row
3. `/portal` booth display — an **approved but UNPAID** exhibitor sees their
   booth. Test with an unpaid one specifically: a paid exhibitor is also covered
   by the deposit-gated public policy, so that case passes whether
   `booths: own read` works or not.

The service-role exemption (finding 1) is in a different position: it was
measured behaviourally by probe, but the **deployed function bodies have never
been read**. A probe proves the symptom is gone, not which change removed it —
and a partial paste (the failure that hit 034 three times) would fix the INSERT
clamp and leave the UPDATE clamp broken with no error raised. That is what
[verify_043.sql](../supabase/verify/verify_043.sql) queries A–D exist to catch.

### 1b. Then

- [x] **EMAIL GATE MET — all nine confirmed as INBOX ARRIVALS** in
      `accounting@`, 2026-08-13. Not acceptances. Settled; do not re-litigate.
      Re-run the harness only if the sending domain, the Resend key or
      `/api/send-email` changes.
- [x] **verify_041, verify_042 and verify_043 ALL RUN AND PASSED, 2026-08-13.**
      All three migrations had cited a `verify_NNN.sql` that did not exist; they
      are now written and executed. **Do not re-run them** unless the
      corresponding functions or policies change. Recorded results in §1a.
- [ ] **Run `supabase/verify/verify_034.sql`** if you want the per-FK output on
      record. 034 is the one migration whose effect cannot be probed through
      PostgREST — everything else below was confirmed by direct probe.
- [ ] **Finish the auth-then-read sweep.** Two routes were checked in depth
      (`send-email`, `create-checkout`). The remaining pattern to look for: a
      route that authenticates its caller and then reads with the
      request-scoped client. Cron and webhook callers expose it because they
      have no session. `create-checkout` is request-scoped **correctly** — its
      caller is a logged-in exhibitor paying their own invoice, so RLS should
      scope them — but it reads `food_trucks`, which is why finding (2) above
      matters there.

## 2. Migration state — 027 through 049

Applied through 044. Outstanding: 045, 046, 048, 049 (and 047, deliberately held). 027–033 and 035–042 confirmed by direct probe on
2026-08-03; 034 confirmed by the operator (its effect is not visible through
PostgREST); **041, 042, 043 and 044 confirmed by their verify files on
2026-08-13** — catalog-level, results in §1a and §4a. 045 is the only one
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
| 045 | rename Apply Hub CMS key `home` → `applyHub` | **NOT YET APPLIED — run after the deploy** |
| 046 | panels get real `panel_day` / `panel_start` | **NOT YET APPLIED — run BEFORE the deploy** |
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

**Rule: adding to a view? Append at the end and keep `create or replace` —
column order in a view is cosmetic, every caller selects by name, and no DROP
means the GRANT survives and no dependency can be destroyed. Changing shape any
other way? `drop view` then `create view`, WITHOUT `cascade`** — plain RESTRICT
errors if something depends on it, which is information; cascade silently
destroys it. Then reissue the `grant`, which the drop discards. Both statements
inside the same transaction, so readers see no gap.

**Convention adopted 2026-08-14: THE SUPABASE SQL EDITOR IS NOT psql.** It
rejects every psql client meta-command — `\set`, `\i`, `\echo`, `\d` — with
`42601: syntax error at or near "\"`. `teardown_import_returning.sql` opened
with `\set test_email …` and could not run at all. Parameterise with a plpgsql
variable inside a `do` block instead. Checked: that was the only file affected.

**Convention adopted 2026-08-14: the Supabase SQL Editor shows only the LAST
statement's result.** Every earlier statement runs but its output is discarded
silently — nothing errors, the results just never appear, which reads as "this
file only had one check in it".

Consequences, all now applied:
- Every `verify_NNN.sql` carries a header saying to run one lettered block at a
  time, and blocks holding two queries are marked `(2 queries)` with the second
  labelled `X2 of 2`.
- A verify file must never END on a decorative `select 'note'` — that would be
  the only thing displayed to anyone who ran it whole. `verify_046` did; it is
  now a comment.
- A migration that reports two figures must combine them into ONE select. `045`
  reported `rows_moved` and `stale_home_rows` separately, so `rows_moved` — the
  actual outcome — was invisible. Now one row, two columns.
- `verify_034` is immune by construction: it is a single `union all` returning
  one row per check. That is the most robust shape for this editor and is worth
  copying when a file's checks are homogeneous.

**Convention adopted 2026-08-14: a teardown must ASSERT, not just delete.**
`teardown_import_returning.sql` shipped with its placeholder address still in
it. Had the `\set` syntax error not stopped it first, every statement would
have matched zero rows and the file would have reported a clean successful
teardown having deleted nothing — the same silent-success shape as the RLS
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

**Security.** Public tables exposed every column of every visible row — sponsor
`amount`, `email`, `phone` and `notes` were readable with the anon key that
ships in the client bundle. 038 replaced public table access with four
`SECURITY DEFINER` views and revoked anon's SELECT on the base tables. Also
fixed: an RLS recursion (42P17) that made the public directory return nothing to
real visitors for twelve weeks, an unpinned `search_path` on the function gating
every admin policy, and an insert path that let an applicant set their own
`status`, `total_amount` and lifecycle dates.

**Broken write paths.** Three features shipped non-functional because PostgREST
returns `data: []` with `error: null` when RLS filters a write. Roster
completion — which sets `needs_roster`, half the directory gate — and sponsor
self-claim both silently affected zero rows. All ten self-service write sites now
carry `.select()` and a zero-row check via `src/lib/db-write.ts`. Sponsor
self-claim was removed rather than repaired; admin-linking replaces it and still
needs building.

**Email.** Nothing had ever delivered to a real recipient: the sender was
Resend's shared sandbox, which refuses every address but the account owner, and
no call site checked the response. Domain now verified. The harness then found a
second fault: `/api/send-email` read applications with the service role but
sponsorships and invoices with the request-scoped client, which is anonymous for
a cron caller — so after 029/038 tightened those reads, `deposit_reminder`,
`final_reminder` and `sponsor_approved` all failed outright. Fixed in `6bcd882`;
8 of 9 templates now accepted.

**Data.** All 14 test applications, the March test panels/contests/food trucks
and the duplicate 267-booth set removed. Two events existed for the same show;
the inactive one is retained empty as a rollback anchor.

**Pricing.** Sponsor tiers were triplicated across three files with a fourth copy
of the rendered strings — the public application form quoted Gold at $3,000
against a $5,000 packet. Now single-sourced in `lib/sponsor-tiers.ts`. Booth
prices, add-on labels and the final-payment date were the same defect class and
are now derived.

**Built:** the homepage (was a bare redirect to `/apply`), granular admin roles
with `/admin/users`, the directory funnel diagnostic, noindex/robots on
non-production hosts, and the vertical promo video section.

## 4. Standing rules — do not break these

- **The sweep has TWO preconditions, and only one is met.** Email: MET
  (nine inbox arrivals, 2026-08-13). **Stripe reconciliation: STILL OPEN** —
  and it is the one that matters most, because the sweep targets "approved, no
  `deposit_paid_at`", which is exactly an exhibitor who paid you outside the
  platform. Arming now expires the people who have already paid.
- **The sweep is armed in TWO stages, not one.** `LIFECYCLE_SWEEP_ENABLED`
  turns it on in reminders-only mode; `LIFECYCLE_SWEEP_DESTRUCTIVE` enables the
  expiry and cancellation branches that release booths. Run a full cycle on
  reminders-only and review `would_expire` / `would_cancel` before the second
  flag. Booth release is irreversible — no history table. Procedure in
  CUTOVER.md §C.
- **`LIFECYCLE_SWEEP_ENABLED` stays unset until nine templates are confirmed
  ARRIVED IN THE INBOX — not nine API acceptances.** The harness reporting 9/9
  means Resend accepted them, nothing more. The whole reason this gate exists is
  that the platform spent months reporting successful sends that were being
  refused at the API, and no call site noticed. The sweep expires applications and **releases booths**,
  its `sendEmail()` helper never checks the response, and booth release is not
  reversible from inside the platform. Its target profile — approved, no
  `deposit_paid_at` — is exactly an exhibitor who paid outside the platform.
- **`NEXT_PUBLIC_SITE_URL` stays on the vercel.app host** until DNS cutover. It
  is the master switch for robots/noindex/canonical; flipping it early emits
  canonicals for URLs WordPress does not serve.
- **Before writing any RLS policy, list what already exists on the table.**
  Permissive policies OR together, so a stricter policy added alongside a
  `using (true)` baseline is decorative. This happened three times.

- **PERMISSIVE BASELINES WERE DOUBLING AS OWNER POLICIES. Four for four.**
  This is not four mistakes; it is one architectural fact about how the schema
  grew. Every `using (true)` policy was serving two populations at once — the
  public, and the row's own owner — and nobody ever wrote the owner policy
  because the baseline made it unnecessary. Nothing ever tested the owner path,
  so dropping the baseline broke it silently every time.

  | Table | Baseline dropped | Owner path it was silently carrying |
  |---|---|---|
  | `sponsorships` | 030, 038 | sponsor reading their own row (self-claim) |
  | `applications` | 024/028 tightening | owner UPDATE — roster completion |
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

## 4a. Migration 044 + the 2027 schedule — APPLIED AND VERIFIED 2026-08-13

**Done. Do not re-run.** `verify_044.sql` passed:

- day counts **10 / 9 / 6** across Fri–Sun (25 items), Saturday closing 22:00 —
  matching the 2027 spec, not the 2026 schedule that was hardcoded before
- **zero panels with a mismatched day label** — both seminars resolve against a
  real schedule day, so neither is silently absent from the programme. That was
  query D, the check most likely to fail quietly.

`schedule_items` and both public views are live; `/events/schedule` and the
homepage read them.

**`presented_by` is a two-field design.** `presented_by_sponsorship_id` (FK) is
authoritative; `presented_by_fallback` (text) exists so the schedule could ship
before Nomadica and Whole Life Aftercare have sponsorship rows. The FK wins the
moment it is set — no schedule edit. Both views join on `status = 'confirmed'`,
so linking an unconfirmed sponsorship still renders the fallback rather than
announcing them early. `verify_044.sql` F lists the credits still carried as
plain text; it currently returns those two, and it will stay non-zero until the
`presentation_credits` table exists (CUTOVER §E2).

### Still outstanding — apply in THIS order

**046 and 045 have OPPOSITE deploy orders. Read both before starting.**

| # | Step | When |
|---|---|---|
| 1 | `046_panel_real_dates.sql` | **BEFORE the deploy.** Purely additive; the live code keeps working because panel_date/panel_time stay. The new code reads `panel_day`, so deploying first would 42703 three public pages. |
| 2 | Deploy | after 046 |
| 3 | `verify_046.sql` | **B is the gate for 047** — 0 rows required. C is the backfill, side by side; eyeball it, because 047 is the irreversible part. |
| 4 | ~~`047_drop_panel_text_dates.sql`~~ | **DEFERRED — see below** |
| 5 | `045_rename_apply_hub_content_key.sql` | **AFTER the deploy** — opposite of 046. Its step 0 tells you whether ordering matters at all. |
| 6 | `seeds/panels_2027_signup_type.sql` | opens registration on both seminars and sets `max_capacity = 150`. Any time after 046. |
| 7 | `048_profile_self_edit.sql` + `verify_048.sql` | portal self-edit. Any time. |
| 8 | `049_sponsor_owner_update.sql` + `verify_049.sql` | admin sponsor-linking |
| 9 | The import-returning end-to-end test | §1a |

#### 047 IS DEFERRED ON PURPOSE — REVISIT 2026-08-20

**Not forgotten, and not blocked.** `047_drop_panel_text_dates.sql` is written,
correct and ready. It is being held for a week after the 046 deploy.

**Why.** Dropping `panel_date` / `panel_time` is the only irreversible step in
this change — once they are gone, the original display strings are gone, and a
bad backfill has to be rebuilt from the seed rather than compared against the
table. The overlap costs nothing: 046 is purely additive, both column pairs
coexist happily, and nothing reads the old ones any more.

**What the week buys.** If any path neither of us checked still selects
`panel_date`, it keeps working instead of throwing 42703 on a public page — and
we find out while the columns still exist. Grep found every reader we know of;
this is insurance against the ones grep does not catch (a saved query, a
script, an integration).

**On 2026-08-20**, if nothing has surfaced: run `verify_046.sql` once more,
confirm B is still 0 rows, then run 047. After it, `verify_044.sql` query D can
be deleted — it checks a failure mode that no longer exists.

#### Seminar rooms — confirmed 2026-08-13

Both 2027 seminars are on **Sunday**, so both are in the **Ballroom, 150 seats**
— that is what the signup_type seed sets. At 150 the amber flag in
`/admin/panels` does not fire until 120 registrations, so last year's ~50
turnout raises nothing.

**The 50-seat Seminar Room is Friday and Saturday only, and nothing is scheduled
in it.** If a Friday or Saturday seminar is ever added, **its `max_capacity` is
50** — and that is the room where a Bookkeeping-sized turnout (~50) would
actually be tight. Worth knowing before a session is placed there.

Remember `max_capacity` is a planning target throughout: nothing enforces it,
registration never closes, and the roster **undercounts the room** because
walk-ins do not register. That caveat is rendered above the registration list in
`/admin/panels` as well as here.

### Detail

1. `supabase/migrations/045_rename_apply_hub_content_key.sql` — **run it AFTER
   the deploy is live, not before.** Step 0 in its header tells you whether the
   ordering matters at all: `select count(*) from page_content where page_key =
   'home';` — a 0 means no window exists and you can run it whenever. Full
   sequence and rollback are in the migration header.
2. The `/api/admin/import-returning` end-to-end test — procedure in §1a.

## 5. Next, in order

1. **BUILT — `/admin/schedule` CRUD.** Full add/edit/delete/publish-toggle with
   a sponsor picker offering only CONFIRMED sponsorships, and `guardedWrite()`
   on all four write paths. A banner points at `/admin/panels` for seminars so
   nobody creates a duplicate. **Admin-only for now — see item 2.**

2. **`content_editor` CANNOT USE THE CONTENT PAGES. Fifth instance of the
   permissive-baseline pattern, and this one is live.** `panels` now carries
   exactly one policy — `panels: admin all` (`is_admin()`) — because 038 dropped
   `"panels: public read"`, which had been the only thing letting a non-admin
   read the table at all. But `/admin/panels` is in `content_editor`'s allowed
   PATHS and in their sidebar.

   So a `content_editor` navigating to Panels sees an **empty list**, and every
   write is refused. The role split is documented as "navigation-level only",
   which undersells it: for panels it is not a weaker boundary, it is a
   **non-functional page**. `schedule_items` has the identical shape, which is
   why `/admin/schedule` was deliberately left out of their PATHS rather than
   shipped broken.

   Not measured against a live `content_editor` session — reasoned from policy
   state, same evidence class as §1a. **Verify before fixing:** sign in as a
   `content_editor` and open `/admin/panels`.

   **NOT A LAUNCH BLOCKER — IT IS A PREREQUISITE FOR THE INVITE.** No
   `content_editor` account exists, so nobody can reach the broken page today.
   **Tie this fix to creating the first one.** Issuing that account without it
   means the marketing person signs in, opens `/admin/panels`, sees an empty
   list, and every write they attempt is silently refused — they will assume
   they broke something, or that the platform is empty.

   Fix is a small migration adding `has_role('content_editor')` policies to
   `panels` and `schedule_items` — 039 added `has_role()` and nothing has ever
   used it. Then add `/admin/schedule` to their PATHS in the same change.

   **Build it at the moment the account is created, not before**, so it is
   verified against a real `content_editor` session rather than shipped
   reasoned-but-unmeasured for the sixth time.

3. **BUILT — Portal profile self-edit.** Artists and vendors can now edit
   business name, website, Instagram, Facebook, phone and logo from `/portal`.
   Publishes immediately, no queue. Needs migration 048.

   **No new table policy was required.** The directory reads `applications`
   directly (not `exhibitors`), 041 already granted owners UPDATE on their own
   row, and its clamp does not cover any directory-facing field — so the write
   path was already open. `verify_048.sql` E re-checks that, because if any of
   those six columns ever joins the clamp the portal will save "successfully"
   and the value will revert.

   **048 adds two things that WERE missing.** An audit trail (`profile_edits`,
   written by an AFTER UPDATE trigger — after, so it records what was stored
   rather than what was submitted and then clamped), and owner write policies on
   the `exhibitor-media` storage bucket, which had only admin insert/delete.
   That second one also fixes a live latent bug: **the existing sponsor logo
   upload in `/portal` writes to the same bucket and has never worked for a
   non-admin.**

   Admin feed is on the `/admin` dashboard — exhibitor edits by default, staff
   edits behind a toggle, old → new per field. `business_name` is the one to
   watch: it is not only the directory listing, it is how staff find an
   exhibitor on an invoice and a booth assignment.

   Also guarded `saveSponsorProfileFn` while in the file — it had no `.select()`
   and `sponsorships` has no owner UPDATE policy at all, so it was toasting
   success having changed nothing.

4. **BUILT — Admin "link sponsor to user account".** `/admin/sponsorships` now
   has Link account / Linked ✓ per row, backed by `/api/admin/link-sponsor`.
   Needs migration 049.

   **The account must already exist.** The route deliberately does not create
   one — minting a login the sponsor never asked for and cannot access is worse
   than asking them to sign up first, and the account existing is itself proof
   the address is theirs. That is the whole difference from the removed
   self-claim, which matched on email alone with no verification.

   **049's clamp is an ALLOW-LIST, and that is a deliberate divergence from
   041.** 041 enumerates what a non-admin may not change, so every column added
   to `applications` later is owner-editable unless somebody remembers to extend
   the trigger — it fails open, silently. 049 rebuilds NEW from OLD and takes
   only seven keys from the submitted row (contact_name, email, phone, website,
   instagram, facebook, logo_url), so a new column on `sponsorships` is
   protected by default. On a table holding tier, amount, placement flags and
   `amount_locked`, failing closed is the only safe direction.
   `verify_049.sql` C checks the allow-list has not been "fixed" into a
   deny-list.

   **Found while enumerating: the public sponsor insert has the same hole 031
   closed on applications.** `"Anyone can submit sponsor application"` is
   `with check (status = 'pending')` — row-level, so it constrains one column
   and the submission can set every other. That was survivable before; with an
   owner UPDATE policy in place it is not, because a submission setting its own
   `user_id` **self-links past the admin linking step** and grants itself the
   edit rights 049 creates. It could also set `amount_locked`, the flag whose
   entire job is resisting price correction. 049 clamps the insert too. `tier`
   and `amount` are deliberately left alone — they are the request an admin
   confirms, and recomputing price in SQL would duplicate
   `lib/sponsor-tiers.ts`.

   **`verify_049.sql` F is worth running even if you trust the rest**: the
   insert hole was open until 049, so it lists every existing link and every row
   that already carries a placement flag or a lock, to be cross-checked against
   what staff actually did.
5. **Floor plan, read-only. ~2.5 days** now that booth coordinates are
   extractable from the venue PDF. Needs the current-year plan from the Crown
   Complex; the 2024 one has 265 real booths, a mislabelled 165/166, and no 233.
6. **Wall of Honor. 8–9 days.** Largest unscoped item, and its WordPress media is
   a cutover dependency. `scripts/import-wall-of-honor.mjs` is written and tested
   against a representative CSV.

   **It has a slot in the programme: Friday 12:30 PM.** The *Missing Man Table
   Presentation / Fallen Artists Moment of Silence* is the Wall of Honor's
   in-show moment, seeded as a `schedule_items` row with `kind = 'tribute'`.
   That changes the scope: the Wall of Honor is not only ambient signage and a
   web page, it is a scheduled presentation, and whatever is built needs
   something presentable in the room at that time. Treat the copy accordingly —
   same for the **Gold Star VIP Meet & Greet** (Sat 10:00 AM), where Gold Star
   means the families of fallen service members and must not read as a ticket
   tier.
7. **Role split part 2** — column-level protection. Today's split is
   navigation-only: a `content_editor` who knows the API can still read artist
   government photo IDs. Accepted for two trusted colleagues; not for anyone
   external.
8. **Contest results public build** — early 2027; schema already landed.

## 6. Scripts

| | |
|---|---|
| `verify-email-templates.mjs --to <addr>` | proves all nine templates |
| `test-payment-alert.mjs` | payment alert deliverability |
| `verify-sponsor-visibility.mjs` | anon-key RLS surface check |
| `check-event-dates.mjs` | prebuild: config vs DB dates |
| `check-no-date-literals.mjs` | prebuild: no date literals in email templates |
| `import-wall-of-honor.mjs` | Gravity Forms media harvest |

`supabase/verify/verify_0NN.sql` — post-migration checks, read-only.
`supabase/seeds/` — RLS harness records, teardown scripts, held Tattoo Goo SQL.

## 7. Loose ends

- **RLS harness records are live and public.** `ZZ TEST — RLS Harness (DELETE
  ME)` renders on the homepage sponsor grid and in the footer. Deliberate — the
  verify script needs them. Remove at cutover; teardown SQL is in
  `supabase/seeds/rls_harness_records.sql`.
- **Tattoo Goo** is `status='pending'` — an unanswered Gold offer at $3,000, hold
  expiring 2026-08-28. Accept path is held, commented, in
  `supabase/seeds/tattoo_goo_offer.sql`.
- **Two invoices** ($160 each, Jazz N Soul and Tacos Snacks) survive against
  deleted food trucks. Harmless; flagged rather than removed.
- **Storage still holds test uploads.** Delete `contest-photos`,
  `food-truck-logos`, `panel-images`, and the user-id folders in
  `application-docs` and `exhibitor-media`. Keep `exhibitor-media/sponsors/`
  (Tattoo Goo's logo), `aatc-graphics`, and `site-assets`.
- **PITR is off** — daily snapshots only, so restore granularity is one day.
- Two requests late in the session — a consent/pixel audit and an SEO schema —
  belong to other repositories. Neither has anything in this one: no pixels, no
  consent layer, no `/privacy-policy`.
