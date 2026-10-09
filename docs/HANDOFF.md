# AATC Platform - Handoff

This file is the index and the current state. Everything else lives in
[docs/handoff/](handoff/):

- [rules.md](handoff/rules.md) - how to verify anything, the rules index, the full rule entries, no placeholder humans.
- [migrations.md](handoff/migrations.md) - migration and seed status. The one home for "is it applied".
- [open-items.md](handoff/open-items.md) - open items, deferred minors, the three sponsors, deferred work with triggers.
- [pre-show-email.md](handoff/pre-show-email.md) - approved pre-show venue-policies copy (Ryan sends it: box office / GHL).
- [sessions/](handoff/sessions/) - one file per dated session, history.

## START HERE - state as of 2026-10-09

**Merged and deployed (develop = dbce187):** everything through #91. No open
PRs. Since the 2026-10-07 refresh (#62-#74 are in the 2026-10-07 block of git
history):
- #75-#80 food truck application, 3 PRs (091, 092, 093) + fixes: form,
  admin decisions, cap and switch, $100 first payment, 30/14/7/1 reminders,
  January 2 unpaid list, Release, permit/license uploads; #78 trucks CAN sell
  any drinks (Coke just can't go inside)
- #79, #81, #84 handoff refreshes (#84: domain cutover recorded)
- #82 auth links: admin reset and Invite & link links spun forever (the PKCE
  browser client refused their hash tokens); 10 s timeout with "expired or
  already used" and Send a new link; signup callback failures go to sign-in
- #83 sitemap: `/apply/food-truck` listed; test that every public page is in it
- #85, #86 /admin/pinup: every submitted field (detail panel, stage name
  column, CSV export for the stage manager and announcer); empty Notes hidden
- Form audit (Ryan, 2026-10-09: every collected field saved and visible):
  - #87 booth add-ons shown (drawer and booth page);
  - #88 artist roster in the applications drawer before approval, Other links
    on the booth page;
  - #89 TV show Yes/No saved (094);
  - #90 sponsor applicant notes apart from internal notes (095);
  - #91 contacts on the sponsor and food truck overviews, item-only
    sponsor's tier listed once.

Source: `gh pr list --state merged` and `gh pr list --state open`, 2026-10-09.
Ryan spot-checked #84-#91 after merging: all OK (2026-10-09).

**Applied in production (Ryan):** everything through **095**, each verified:
- 088: verify_088 passed, then verify_079_matrix passed (Ryan, 2026-10-07).
- 089: verify_089 passed (Ryan, 2026-10-07).
- 090: verify_090 + `scripts/verify-food-truck-owner.mjs` 4 PASS (2026-10-06).
- 091 and 092: verify_091 and verify_092 passed, each applied before its
  PR merged (Ryan, 2026-10-08).
- 093: verify_093 passed and `scripts/verify-food-truck-docs.mjs` all PASS,
  applied before #80 merged (Ryan, 2026-10-08).
- 094 and 095: verify_094 and verify_095 passed, each applied before its PR
  merged (Ryan, 2026-10-09).
- 015 is superseded by 079b. 047 is still HELD.
- Evidence per migration: [migrations.md](handoff/migrations.md).

**Comps (intentional, Ryan):** Jane Ink booth + permits; Skin Reserve,
Pinback and Chop Shop booth only (Chop Shop pays $200 permits);
**Pennyboy Tattoo booth only (permits still charged)**; **Adu Ink booth +
permits (fully comped)** (Pennyboy and Adu Ink recorded 2026-10-07). A
reconcile or audit that flags these comps is not finding an error.

**Food trucks now (Ryan, 2026-10-08):**
- **Applications are OPEN** at /apply/food-truck (switch on /admin/food-trucks).
- Ryan checked /admin/food-trucks and the truck portal after #80: looks right.
- Cap 8; the 3 imports count as selected and stay on their 25% Square terms.
- Trucks invoiced from #77 on pay $100 first, balance due January 1.
- Permit and license: optional on the form, uploadable in the portal,
  verified by an admin.
- Reminders are OFF until `FOOD_TRUCK_REMINDERS_ENABLED=true` (see Dated).
- The 3-PR plan is complete:
  docs/superpowers/plans/2026-10-07-food-truck-application.md.

**Data operations run by Ryan:**
- **Square 2027 import (2026-10-05):**
  - 12 applications, 3 food trucks and 15 invoices: invoiced $10,230.00,
    paid $2,382.50;
  - booth 126 assigned to Cuitlahuac Palacios;
  - no emails sent; the read-back matched the dry run.
  - Generator: `scripts/import-square-2027.mjs`.
  - **Teardown:** `supabase/.imports/square-2027-teardown.sql` in Claude's
    worktree (`../aatc-platform-claude`, gitignored: it holds customer
    data). It deletes exactly the imported ids, and **stops working (it
    refuses) once a payment, amount, comp or linked portal account changes
    any of those rows.** So it is unusable after Invite & link.
- **Chop Shop Tattoo invoice set to $200** (booth comped, 4 permits;
  `supabase/seeds/chopshop_invoice_2026_10_02.sql`). It is now
  "Comp booth, permits charged".

**Prices now in force:** food trucks **$100 for 1 day / $200 for 2 / $250
for the full weekend** (`src/lib/food-truck-pricing.ts`; existing invoices
unchanged). Artist permits are $50, capped at 2 per single / 4 per double.

**Queued, in order, each its own PR, report before building:**
1. **Floor plan Stage 1:** waiting on the vector PDF.
2. **Site-wide gold:** the antique golds replace #8B7355 / #866f52, waiting
   on the button-text and light-gold decisions.
3. **After the cutover (report sent 2026-10-08, awaiting Ryan's go):**
   vercel.app host redirect / noindex, WordPress redirect map (needs the old
   URL list), social-preview tags on every page. Details in open-items.md.

Also queued (smaller):
- the add-artist flow (PR 3 of the artist plan: requests, payment, swaps;
  design in docs/superpowers/plans/2026-09-29-floor-plan-and-booth-map.md
  and the 2026-10-02 sessions);
- release-on-send-back for booths (proposed 2026-10-03).

**Done outside the code (Ryan, 2026-09-28):**
- Newsletter to GHL works on production for new and existing contacts, tag
  "newsletter" included (Ryan via the admin test: test27 new, test26
  existing). Env GHL_API_TOKEN, GHL_LOCATION_ID set in Vercel.
- Branded confirm-signup email tested. Reset-password: not reported yet.
- Sponsor contacts entered; accounts still unlinked (use Invite & link, #36).
- Tooth Gem: $400, 50 seats. **Signup type still `none`** in production
  (read 2026-09-28, not re-read since); Ryan intends email host + host email.

**Admin tools:**
- `GET /api/admin/newsletter-test?email=...` (admin role only; encode `+` as
  `%2B`): a REAL signup into GHL through the footer's code, every GHL
  response, and the contact's tags read back (token has contacts.readonly).
  `&version=` overrides the Version header for one run. Creates or updates a
  real contact: use test addresses, and delete them in GHL afterwards.
- `/api/cron/lifecycle-sweep?dry_run=1` also reports `booth_holds` (expired
  holds that would be cleared; #60).
- `npm run verify:local -- <verify.sql>` / `--audit` / `--before NNN` /
  `--dump-schema`: verifies against a replay of every migration (#62).

**Domain cutover: DONE 2026-10-08 (Ryan).**
- www.allamericantattooconvention.com serves this project; the apex 308s to
  www (checked 2026-10-09 00:57 UTC, with http and trailing-slash variants).
- Production `NEXT_PUBLIC_SITE_URL` = www: robots.txt lists
  https://www.allamericantattooconvention.com/sitemap.xml, which only happens
  on the production host (#53).
- Supabase Auth: Site URL = https://www.allamericantattooconvention.com.
  Redirect URLs had only `https://aatc-platform.vercel.app/**`; Ryan added
  `https://www.allamericantattooconvention.com/**` and
  `https://allamericantattooconvention.com/**` (2026-10-08). An unlisted
  redirect falls back to the Site URL ROOT, so auth links sent after the
  cutover but before that change landed on the homepage. Ryan is resending
  tonight's resets and invites.
- The reset page also spun for a reason that predates the cutover (#82,
  above).
- Post-cutover checks (Claude, 2026-10-08) and what is left: open-items.md,
  "After the domain cutover".
- Ryan does every Vercel, Cloudflare, Supabase and Stripe dashboard step;
  Claude's part is code PRs, on Ryan's go.

**Dated (Ryan):** DMARC reports ~2026-10-12 then `p=quarantine; pct=25`;
`SPONSOR_REMINDERS_ENABLED=true` and `FOOD_TRUCK_REMINDERS_ENABLED=true` in
Vercel before 2026-12-01 (first truck reminder 2026-12-02). Details in
[open-items.md](handoff/open-items.md).

**Test data left live on purpose:** none. (ZZ TEST RLS-harness
sponsorships are standing fixtures.)

## How to write handoff notes (so parallel branches stop conflicting)

- **A branch adds its own file** `handoff/sessions/YYYY-MM-DD-<topic>.md` and
  edits no other handoff file. Two branches never touch the same file.
- **Delivered is not applied.** A migration a branch delivers is recorded as
  delivered in that branch's session file and PR description only.
- **This START HERE block and migrations.md change only after something
  lands** (a merge, or Ryan applying SQL), on their own small docs PR or the
  end-of-session START HERE PR.
- **A fact stated here is a claim.** Name how and when it was verified.
- New rules go in the [rules.md](handoff/rules.md) index table, with the full
  entry below it.

## Where the old section numbers went

Code comments, CUTOVER.md and migration 049 cite `HANDOFF §N`. Two numbering
schemes existed:

| Old reference | Now |
|---|---|
| §0 START HERE (2026-09-26 morning) | [sessions/2026-09-26.md](handoff/sessions/2026-09-26.md) |
| §0a START HERE 2026-08-31, §1 wording question, seminar times, 064, presentation_credits dual-read | [sessions/2026-08-31.md](handoff/sessions/2026-08-31.md) |
| 2026-09-13 addendum | [sessions/2026-09-13.md](handoff/sessions/2026-09-13.md) |
| §0a migration status and seed status tables | [migrations.md](handoff/migrations.md) |
| §2 dated entries (2026-09-23 to 09-25) | the matching file in [sessions/](handoff/sessions/) |
| §2 OPEN ITEMS, DEFERRED MINORS; §3 three sponsors; §4 deferred with triggers | [open-items.md](handoff/open-items.md) |
| §5 how to verify; §6 rules index; the full rule sections; no placeholder humans | [rules.md](handoff/rules.md) |
| 2026-08-13 block: §1 do these first, §2 migration state 027-049, §3 what changed, §4 standing rules, §4a, §5 next in order, §6 scripts, §7 loose ends | [sessions/2026-08-13.md](handoff/sessions/2026-08-13.md) |

The authoritative launch list is [CUTOVER.md](CUTOVER.md).
