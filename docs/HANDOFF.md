# AATC Platform - Handoff

This file is the index and the current state. Everything else lives in
[docs/handoff/](handoff/):

- [rules.md](handoff/rules.md) - how to verify anything, the rules index, the full rule entries, no placeholder humans.
- [migrations.md](handoff/migrations.md) - migration and seed status. The one home for "is it applied".
- [open-items.md](handoff/open-items.md) - open items, deferred minors, the three sponsors, deferred work with triggers.
- [sessions/](handoff/sessions/) - one file per dated session, history.

## START HERE - state as of 2026-09-29 (evening)

**Merged and deployed (develop = f581734):** everything through #44. Since
the 2026-09-28 evening refresh: #39 START HERE, #40 tattoo contests Daily
Contest Schedule from schedule rows + Best in Show, #41 homepage event cards
read days and times from the schedule, #42 new homepage promo video, #43
homepage event card text editable, #44 self-hosted Oswald (build fix).
Source: `gh pr list --state merged`, 2026-09-29.

**Applied in production (Ryan):** everything through **085**, verified
(verify_085 "Success. No rows returned", Ryan 2026-09-29; no panel is marked
Full yet). 015 superseded by 079b; 047 still HELD (its body would also now
drop 065's credit join and 085's `signup_closed`). Evidence per migration is
in [migrations.md](handoff/migrations.md). No migration is delivered and
waiting.

**Open PRs (2026-09-29):**
- #45 `fix/page-level-footers`: removes the leftover page-level footers on
  /apply, /contests, /directory, /directory/artists. Ready for review; build,
  tests and a render-check of 39 public routes passed.
- #46 `feat/venue-policies`: Crown Complex venue policies on /info/policies,
  editable at /admin/content ("Policies").

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

**Queued, in order, each its own PR, report before building:**
1. Short venue-policies note (bags, Pepsi-only drinks, wristband re-entry)
   for /tickets and the ticket confirmation email: wording sent to Ryan
   2026-09-29, awaiting approval. Tickets sell through Ticketmaster; this
   codebase sends no ticket confirmation email.
2. Site-wide gold: the antique golds replace #8B7355 / #866f52 (plan sent;
   awaiting button-text and light-gold decisions).
3. Admin audit log - a design note only, not built.

**Domains:** Ryan's. The cutover is his; no domain work from this side.

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
