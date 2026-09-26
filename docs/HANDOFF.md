# AATC Platform - Handoff

This file is the index and the current state. Everything else lives in
[docs/handoff/](handoff/):

- [rules.md](handoff/rules.md) - how to verify anything, the rules index, the full rule entries, no placeholder humans.
- [migrations.md](handoff/migrations.md) - migration and seed status. The one home for "is it applied".
- [open-items.md](handoff/open-items.md) - open items, deferred minors, the three sponsors, deferred work with triggers.
- [sessions/](handoff/sessions/) - one file per dated session, history.

## START HERE - state as of 2026-09-26 (evening)

**Merged and deployed (develop = b5a1d3f):** #16 Submit Graphics (078), #17
server-computed price + one active application (079, 079b), #18 START HERE,
#19 CLAUDE.md. Source: `gh pr list`, 2026-09-26.

**Applied in production (Ryan):** everything through **079b**. Migration files
on develop match production. 015 was never applied and is superseded by 079b;
047 is still HELD. Evidence per migration is in
[migrations.md](handoff/migrations.md).

**In flight:**
- The HANDOFF split (this structure), docs only.
- `feat/apply-hub-buttons` (no PR): /apply cards redesign, waiting on Ryan to
  approve the preview. Not re-checked since the morning.

**Queued, in order, each its own PR, report before building:**
1. Panel `max_capacity` enforcement (today a planning target; free
   registrations have no gate - `/api/panel-register` says so).
2. Branded Supabase Auth email templates (signup, magic link, reset) matching
   `src/lib/email-templates.ts`, plus a deliverability check. DMARC is
   `p=none` with `rua` to accounting@; decide on quarantine after a clean
   reporting window.
3. Admin "link account" action for in-person applications (`user_id` NULL):
   the admin enters or selects the exhibitor's email; the system links an
   existing account or sends an invite, then sets `user_id`, respecting the
   one-active-application index.
4. Admin audit log (who changed a panel's signup_type, who comped, who
   verified) - a design note in this folder only, not built.

**Test data left live on purpose:** none.

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
