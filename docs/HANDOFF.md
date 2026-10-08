# AATC Platform - Handoff

This file is the index and the current state. Everything else lives in
[docs/handoff/](handoff/):

- [rules.md](handoff/rules.md) - how to verify anything, the rules index, the full rule entries, no placeholder humans.
- [migrations.md](handoff/migrations.md) - migration and seed status. The one home for "is it applied".
- [open-items.md](handoff/open-items.md) - open items, deferred minors, the three sponsors, deferred work with triggers.
- [pre-show-email.md](handoff/pre-show-email.md) - approved pre-show venue-policies copy (Ryan sends it: box office / GHL).
- [sessions/](handoff/sessions/) - one file per dated session, history.

## START HERE - state as of 2026-10-07

**Merged and deployed (develop = b2c9f84):** everything through #73. Since
the 2026-09-30 refresh:
- #62 `npm run verify:local` (migration replay harness; CLAUDE.md requires
  it before delivering a verify)
- #63 pricing drift guards
- #64 approval discount safeguard
- #65 artist capacity 2/4 + roster guard + artist ID verification (088)
- #66 "Show in directory before deposit" toggle
- #67 directory funnel fix + drawer link to the exhibitor page
- #68 /admin/print fix (PGRST201 after 087)
- #69 comp split (089)
- #70 Square import generator + food-truck re-price guard
- #71 food-truck pricing
- #72 personal email removed from a session note
- #73 food-truck portal access (090)

Source: `gh pr list --state merged`, 2026-10-07.

**Applied in production (Ryan):** everything through **090**.
- **088 and 089 are applied, verify not reported.** Read 2026-10-07:
  - `set_artist_id_verified` and `set_comp` exist (anon refused, 42501);
  - `events.permit_submission_date` = 2027-03-01;
  - comps are split (Jane Ink booth + permits; Skin Reserve, Pinback and
    Chop Shop booth only).
- **090 is applied and verified:** verify_090 passed, and
  `scripts/verify-food-truck-owner.mjs` gave 4 PASS (Ryan, 2026-10-06).
- 015 is superseded by 079b. 047 is still HELD.
- Evidence per migration: [migrations.md](handoff/migrations.md).

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
1. **Public food truck application** (`/apply/food-truck`): 3 PRs (091 +
   the form, route, emails and admin review with cap and switch; the $100
   deposit rule + January 1 handling; optional portal permit uploads).
   **Decisions 1-10 pending** (report sent 2026-10-06).
2. **Floor plan Stage 1:** waiting on the vector PDF.
3. **Site-wide gold:** the antique golds replace #8B7355 / #866f52, waiting
   on the button-text and light-gold decisions.
4. **Domain cutover runbook:** sent 2026-09-30. Pre-cutover PRs (redirect
   map, host-aware noindex, webhook dedupe) await Ryan's go and his answers
   on AATC West and the redirect targets.

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

**Domains:** Ryan does every Vercel, Cloudflare, Supabase and Stripe dashboard
step (runbook, 2026-09-30); Claude's part is only the runbook's pre-cutover
code PRs, on Ryan's go.
At cutover, the `NEXT_PUBLIC_SITE_URL` flip also makes robots.txt list
/sitemap.xml (#53).

**Dated (Ryan):** DMARC reports ~2026-10-12 then `p=quarantine; pct=25`;
`SPONSOR_REMINDERS_ENABLED=true` in Vercel before 2026-12-01. Details in
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
