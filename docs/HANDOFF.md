# AATC Platform — Handoff

**Last session:** 2026-08-03
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

### 1a. OPEN BUG — service_role is clamped by the 031/041 triggers

Migrations 031 and 041 clamp staff-controlled columns for anyone where
`is_admin()` is false. **`service_role` has no `auth.uid()`, so `is_admin()`
returns false and the triggers fire against it too** — triggers are not bypassed
by service role the way RLS is.

Confirmed: inserting an application as service role with `deposit_due_at` set
returns the row with `deposit_due_at = NULL`.

**Known blast radius:** `/api/admin/import-returning` (route.ts:107-110) inserts
applications with `status: 'approved'`, `deposit_due_at` and `final_due_at` as
service role. All three are silently clamped, so imported returning exhibitors
land as `pending` with no lifecycle dates. Not yet tested end to end — it is the
first thing to verify.

**Fix shape:** exempt the service role in both triggers, e.g.
`if public.is_admin() or auth.uid() is null then return new; end if;`
(service role presents no JWT, so `auth.uid()` is null; a real applicant always
has one). Needs a migration 043 and a re-test of import-returning. Do not widen
it further than that — the clamp is what stops applicants self-approving.

This is also why the email harness reports 8/9: `deposit_reminder` requires
`deposit_due_at`, which the harness cannot seed for the same reason. That last
template is unproven, not broken.

### 1b. Then

- [ ] **Prove the nine email templates deliver.**
      `node scripts/verify-email-templates.mjs --to <address>`, then tick off all
      nine arrivals from the inbox, spam included. This is the gate on
      `LIFECYCLE_SWEEP_ENABLED` — see §4.
- [ ] **Run `supabase/verify/verify_034.sql`** if you want the per-FK output on
      record. 034 is the one migration whose effect cannot be probed through
      PostgREST — everything else below was confirmed by direct probe.
- [ ] Confirm the **8 templates already accepted actually arrived** at
      `accounting@allamericantattooconvention.com` — inbox and spam. API-accepted
      is not delivered.

## 2. Migration state — 027 through 042

All 16 applied and verified. 027–033 and 035–042 confirmed by direct probe on
2026-08-03; 034 confirmed by the operator (its effect is not visible through
PostgREST).

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

- **`LIFECYCLE_SWEEP_ENABLED` stays unset** until all nine email templates are
  confirmed delivered. The sweep expires applications and **releases booths**,
  its `sendEmail()` helper never checks the response, and booth release is not
  reversible from inside the platform. Its target profile — approved, no
  `deposit_paid_at` — is exactly an exhibitor who paid outside the platform.
- **`NEXT_PUBLIC_SITE_URL` stays on the vercel.app host** until DNS cutover. It
  is the master switch for robots/noindex/canonical; flipping it early emits
  canonicals for URLs WordPress does not serve.
- **Before writing any RLS policy, list what already exists on the table.**
  Permissive policies OR together, so a stricter policy added alongside a
  `using (true)` baseline is decorative. This happened three times.
- **Any write a non-admin performs needs `.select()` and a row-count check.**
- **Grandfathered prices** (Tattoo Goo $3,000, pre-July VIP Bag $800) are
  deliberate, not errors. `amount_locked` protects them; CUTOVER.md explains.

## 5. Next, in order

1. **Portal profile self-edit.** Artists and vendors cannot change business name,
   website, Instagram, phone or logo — all directory-facing. 041 unblocked the
   write path. Publish immediately, no queue, plus an admin recent-edits feed.
   ~2–2.5 days.
2. **Admin "link sponsor to user account"** — replaces the removed self-claim.
3. **Floor plan, read-only. ~2.5 days** now that booth coordinates are
   extractable from the venue PDF. Needs the current-year plan from the Crown
   Complex; the 2024 one has 265 real booths, a mislabelled 165/166, and no 233.
4. **Wall of Honor. 8–9 days.** Largest unscoped item, and its WordPress media is
   a cutover dependency. `scripts/import-wall-of-honor.mjs` is written and tested
   against a representative CSV.
5. **Role split part 2** — column-level protection. Today's split is
   navigation-only: a `content_editor` who knows the API can still read artist
   government photo IDs. Accepted for two trusted colleagues; not for anyone
   external.
6. **Contest results public build** — early 2027; schema already landed.

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
