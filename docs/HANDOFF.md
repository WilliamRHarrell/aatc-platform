# AATC Platform - Handoff

This file is the index and the current state. Everything else lives in
[docs/handoff/](handoff/):

- [rules.md](handoff/rules.md) - how to verify anything, the rules index, the full rule entries, no placeholder humans.
- [migrations.md](handoff/migrations.md) - migration and seed status. The one home for "is it applied".
- [open-items.md](handoff/open-items.md) - open items, deferred minors, the three sponsors, deferred work with triggers.
- [pre-show-email.md](handoff/pre-show-email.md) - approved pre-show venue-policies copy (Ryan sends it: box office / GHL).
- [sessions/](handoff/sessions/) - one file per dated session, history.

## START HERE - state as of 2026-09-30 (morning)

**Merged and deployed (develop = 5f7aa7e):** everything through #60. Since
the 2026-09-29 evening refresh:
- #45 leftover page-level footers removed
- #46 Crown Complex venue policies on /info/policies
- #47 START HERE
- #48 smoke-free wording with the designated smoking areas
- #49 /tickets short venue note (the approved email copy is in
  [pre-show-email.md](handoff/pre-show-email.md))
- #50 phone header (menu toggle)
- #51 /directory/[id] Event card from event-config
- #52 /floorplan removed (404)
- #53 /sitemap.xml
- #54 /apply step 3 wording
- #55 self-hosted fonts
- #56 Tattoo Dating Game logo
- #57 floor plan / holds / booth map design note
- #58 Assign Booth through `assign_booths()` (086)
- #59 Dating Game page times from the schedule (Fri 6:00 PM, Sat 5:30 PM;
  Ryan confirmed Saturday 5:30 is correct)
- #60 booth holds (087)

Source: `gh pr list --state merged`, 2026-09-30.

**Applied in production (Ryan):** everything through **087**, verified.
- **086:** verify_086 passed. A real save (booth 126 to Skin Reserve)
  worked, and booth 108 was refused (Ryan, 2026-09-30).
- **087:**
  - The first verify_087 run failed on its own fixture (sponsorships.tier);
    that was fixed in #60.
  - The re-run passed.
  - Hold tests all worked: hold set; assigning it to another exhibitor
    refused; assigning it to the linked exhibitor worked and cleared the
    hold; release worked (Ryan, 2026-09-30).
- 015 is superseded by 079b. 047 is still HELD.
- Evidence per migration: [migrations.md](handoff/migrations.md). No
  migration is delivered and waiting.

**Open PRs (2026-09-30):**
- #62 `chore/verify-local`: `npm run verify:local` replays every migration
  into PGlite and runs verify SQL against it (`--audit` for fixtures,
  `--dump-schema` for a production diff). CLAUDE.md makes it a
  pre-delivery step.

**Next, in order:**
1. Docs PR (after #62 merges): point rules.md's fixture check at `npm run
   verify:local -- --audit` and delete `scripts/check-sql-fixtures.py` (23
   false positives on today's tree; Ryan approved 2026-09-30).
2. **Floor plan Stage 1**, once Ryan sends the vector PDF: upload and show
   the plan in admin, the portal and an optional public page (off at
   launch). Restore the /apply "floor plan in your portal" clause in the
   same PR.
3. Booth positions (extraction plus placement mode), then Stage 2 (the
   admin booth map), then later the public booth map.

Design: [docs/superpowers/plans/2026-09-29-floor-plan-and-booth-map.md](superpowers/plans/2026-09-29-floor-plan-and-booth-map.md).

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

**Queued, besides the floor plan, each its own PR, report before building:**
1. Site-wide gold: the antique golds replace #8B7355 / #866f52 (plan sent;
   awaiting button-text and light-gold decisions).
2. Admin audit log - a design note only, not built.

**Domains:** Ryan's. The cutover is his; no domain work from this side.
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
