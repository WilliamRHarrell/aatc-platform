# AATC Platform - Handoff

This file is the index and the current state. Everything else lives in
[docs/handoff/](handoff/):

- [rules.md](handoff/rules.md) - how to verify anything, the rules index, the full rule entries, no placeholder humans.
- [migrations.md](handoff/migrations.md) - migration and seed status. The one home for "is it applied".
- [open-items.md](handoff/open-items.md) - open items, deferred minors, the three sponsors, deferred work with triggers.
- [sessions/](handoff/sessions/) - one file per dated session, history.

## START HERE - state as of 2026-09-28

**Merged and deployed (develop = 292c771):** everything through #31. Since
the last refresh: #24 panel capacity (080), #25 sponsor invoice terms (081),
#26 protected records (082), #27 branded Supabase Auth emails and the DNS
check, #28 sponsor reminders skip test rows, #29 tier counts skip test rows
(083), #30 CLAUDE.md worktree rule, #31 DMARC open item and 080-083 status.
No open PRs. Source: `gh pr list`, 2026-09-28.

**Applied in production (Ryan):** everything through **083**, each verified
(080, 081 on 2026-09-27; 082 with `protect_2026_09_26.sql`, and 083, on
2026-09-28). 015 was never applied and is superseded by 079b; 047 is still
HELD. Evidence per migration is in [migrations.md](handoff/migrations.md).

**Done outside the code (reported by Ryan, 2026-09-28):**
- Branded confirm-signup email: tested by Ryan in an incognito window,
  arrives in the inbox and renders correctly. The reset-password template
  is not reported tested yet.
- The three sponsors (Nomadica, All American Tattoo Supply, WholeLife) have
  their contacts entered in /admin/sponsorships. **Their accounts are still
  not linked:** a read of production on 2026-09-28 shows an email on all
  three and `user_id` NULL on all three. The portal reads sponsorships by
  `user_id` only, so none of them can see their invoice yet (open-items).
- Tooth Gem Seminar: price $400 and 50 seats, confirmed by the same read
  (`cost` 40000, `max_capacity` 50). **Its signup type is still `none`**,
  not "AATC invoice", so the seat cap is not enforced (080 caps a panel only
  when it is `aatc_invoice` or `hard_cap`). Ryan: set it in /admin/panels.

**In flight:** `feat/apply-hub-buttons` (/apply cards redesign), preview
approved by Ryan 2026-09-28; being rebased onto develop for its PR.

**Queued, in order, each its own PR, report before building:**
1. Sponsor price visibility: hide prices on sponsorship packages, keep them
   on individual items, per-tier show/hide setting in admin. The
   package/item split goes to Ryan for confirmation before building.
2. Admin "link account" action for in-person applications (`user_id` NULL):
   the admin enters or selects the exhibitor's email; the system links an
   existing account or sends an invite, then sets `user_id`, respecting the
   one-active-application index.
3. Admin audit log (who changed a panel's signup_type, who comped, who
   verified) - a design note in this folder only, not built.

**Dated (Ryan):** review DMARC reports around 2026-10-12, then
`p=quarantine; pct=25`; set `SPONSOR_REMINDERS_ENABLED=true` in Vercel
before 2026-12-01. Details in [open-items.md](handoff/open-items.md).

**Test data left live on purpose:** none. (The `ZZ TEST` RLS-harness
sponsorships are standing fixtures, excluded by 083 and the reminder query.)

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
