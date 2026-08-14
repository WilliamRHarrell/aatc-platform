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
3. `supabase/seeds/teardown_import_returning.sql` — read the SELECTs first, it
   deletes an auth user.

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

## 2. Migration state — 027 through 045 · only 045 outstanding

All applied except 045. 027–033 and 035–042 confirmed by direct probe on
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

### Still outstanding — 045, then the import test

1. `supabase/migrations/045_rename_apply_hub_content_key.sql` — **run it AFTER
   the deploy is live, not before.** Step 0 in its header tells you whether the
   ordering matters at all: `select count(*) from page_content where page_key =
   'home';` — a 0 means no window exists and you can run it whenever. Full
   sequence and rollback are in the migration header.
2. The `/api/admin/import-returning` end-to-end test — procedure in §1a.

## 5. Next, in order

1. **`/admin/schedule` CRUD — NEXT, ahead of portal self-edit.** The
   deliberate gap from 044: `schedule_items` has an `is_admin()` policy and no
   UI, so a schedule change means editing the seed and re-running it — the same
   problem as a config file needing a redeploy, and **the schedule will move in
   the weeks before the show**. Needs a sponsor picker writing
   `presented_by_sponsorship_id`, and `guardedWrite()` on every write.
2. **Portal profile self-edit.** Artists and vendors cannot change business name,
   website, Instagram, phone or logo — all directory-facing. 041 unblocked the
   write path. Publish immediately, no queue, plus an admin recent-edits feed.
   ~2–2.5 days.
3. **Admin "link sponsor to user account"** — replaces the removed self-claim.
4. **Floor plan, read-only. ~2.5 days** now that booth coordinates are
   extractable from the venue PDF. Needs the current-year plan from the Crown
   Complex; the 2024 one has 265 real booths, a mislabelled 165/166, and no 233.
5. **Wall of Honor. 8–9 days.** Largest unscoped item, and its WordPress media is
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
6. **Role split part 2** — column-level protection. Today's split is
   navigation-only: a `content_editor` who knows the API can still read artist
   government photo IDs. Accepted for two trusted colleagues; not for anyone
   external.
7. **Contest results public build** — early 2027; schema already landed.

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
