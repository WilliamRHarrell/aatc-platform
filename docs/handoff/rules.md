# The rules

_Moved verbatim from docs/HANDOFF.md (develop b5a1d3f) on 2026-09-26._

## 5. HOW TO VERIFY ANYTHING

    python3 -c "import pglast; pglast.parse_sql(open('FILE.sql').read())"   # parse
    python3 scripts/check-sql-fixtures.py                                   # fixture columns
    node scripts/check-no-em-dashes.mjs                                     # dashes + harness literals
    npx tsc --noEmit && npm run build                                       # types + build
    curl -s https://aatc-platform.vercel.app/PATH | grep -c 'thing'         # what RENDERS

The last one is not optional - see the code-and-data rule (full entry in [sessions/2026-08-13.md](sessions/2026-08-13.md), "a claim about what a page RENDERS").


## 6. THE RULES - index

All of these are written out in full, either further down this file or in
[sessions/2026-08-13.md](sessions/2026-08-13.md) (its "Standing rules" and
"Loose ends" sections hold the `RULE:` entries). They came from real defects
in this codebase, not from principle, and each one names the incident. If you
are about to do something in the left column, read the entry.

| doing this | rule |
|---|---|
| asserting something is absent, blocked or invisible | **A negative assertion needs a positive control.** Five instances, one of which printed a strong PASS on a real run and was believed. |
| testing a limit or boundary | **Test the boundary itself**, not a point safely either side. Same idea as swapping `sort_order` to tell two identical-looking sources apart. |
| writing a verify block that creates fixtures | **Cleanup belongs with the last block that NEEDS the fixture.** And a residue check is not a cleanup - a block that deletes and reports always reports clean. |
| a fix produces a new failure downstream | **Check whether that code had ever run** before assuming the fix broke it. Two bugs can stack, the first masking the second. |
| claiming what a page does or does not render | **Check both code AND data.** Deployed HTML is the authority; a source grep is a hint. Content now lives in tables. |
| anything about sponsor credits | **Owed-and-unrendered and sold-and-unrendered are the same defect** from opposite directions. Neither throws. |
| writing an anon test | **"anon cannot see it" has two failure modes** - zero rows, or 42501 if the grant is revoked. Assert the outcome, not the error. List of revoked tables included. |
| guarding a write that touches money | **Guard prevents, query detects.** A guard is necessary but not sufficient; write the reconciliation at the same time. |
| copying a good pattern from a file | **A pattern applied once does not extend to the next branch.** The Stripe webhook was the model in one of its two branches. |
| applying a rule everywhere | **A rule applied mechanically produces its own bugs.** One documented exception exists and must not be "fixed". |
| adding a person to the site | **No placeholder humans.** Nullable columns + a check constraint that forbids publishing an incomplete row. |
| writing an error message | **A speculative message is evidence of an unguarded write.** "are you an admin?" is the tell. |
| a write spanning a file and a row | **Rollback direction follows which failure is visible.** |
| a constraint could be violated | **Make the invalid state unreachable**, not merely detectable. |
| editing a migration | **Never edit one someone is partway through applying.** Add a new one. |
| opening a PR that depends on another open PR | **Do not stack PRs.** Twice a stacked PR was merged into its base branch instead of develop (PR #2 into feat/tattoo-battle, PR #11 into feat/sponsor-submission-emails) and had to be replayed. Base every PR on develop; if it needs another PR's code, wait for that merge, or let the later PR carry the earlier commits and say so in its description. |
| creating a function | **`revoke all from public` does not revoke anon.** Supabase's default privileges grant EXECUTE to anon, authenticated and service_role on creation; revoke from anon (and authenticated where it applies) BY NAME, then grant the intended roles. 035/039/072 shipped anon-executable; expire/cancel had no internal guard either. `function-grants.test.ts` enforces it from 073 on; `verify_073` pins the live anon list. |
| replacing a view | **Read the live shape, not the last migration that touched it.** A file says what a shape was INTENDED to be; only the database says what it IS. 065 copied 047's column list, 047 turned out never to have been applied, and Postgres refused the whole statement with 42P16. Pin the list in a verify block afterwards. |
| holding a migration | **A hold whose gate fails silently is indistinguishable from a hold nobody remembers.** The gate must FAIL LOUDLY or be CHECKED ON A SCHEDULE - recording it in a header is not enough. Full entry below. |
| writing "applied through N" | **Do not. A range is not a status.** It reads as contiguous and hides anything unapplied inside it. State every migration as applied, held (with its gate AND that gate's current status) or not applied. This is how 047 hid for months. |
| trusting a green migration | **A green migration does not imply its data landed.** Schema and seed are separate applications with separate evidence, and the seed's evidence is THE DATA. 061 was applied and verified while the voting window was NULL on both events. |
| asserting live state in HANDOFF | **A fact stated in this file is a claim, not evidence.** Name how it was verified and when, every time. Both incidents this session began with acting on an unverified sentence in here. |
| verifying a seed | **Assert VALUES, not non-nullness.** A seed that wrote the wrong values looks identical to one that wrote the right ones. Call the function; read the number. |
| adding a constraint | **A constraint makes a state unreachable WITHIN ITS OWN SCOPE and can leave the same failure reachable from outside it.** `panels_published_has_schedule` guarantees a published panel HAS a day; it cannot guarantee the day is one the programme runs on. A seminar moved to 2027-04-20 satisfies the constraint and still vanishes from /events/schedule. Ask what the constraint does NOT cover, and cover that elsewhere. |
| reading src/types/database.ts | **It is HAND-MAINTAINED and silently goes stale.** It has the shape of a generated file but there is no generation step wired up. It is not authoritative - the database is. |
| building a monitor | **A check that stops running keeps its last result and reads all-clear forever.** The vacuous-pass shape, applied to monitoring rather than to assertions. Show the last-run time in every state, including the healthy one. |
| relying on a guard | **Correct, documented, and inert.** Three instances this session: 047's hold, the voting seed, `amount_locked`. A guard names the case it defends in its own comment - go read that case against live data. Prefer REMOVING the precondition to satisfying it. Full section below. |
| touching `sponsorships` | **Run it against Tattoo Goo first.** One row, one query. It has surfaced five defects before any of them fired, because every assumption the system makes about a sponsorship is false for it. Full section below. |
| a fallback image or value | **No placeholder humans applies to BRANDS, and to any medium.** Substituting a real entity's asset as a default is the same failure whatever the medium. **A fallback asset must be GENERATED OR NEUTRAL, never borrowed from real content** - the footer's placeholder was picked from the site's own assets, which is exactly how a real business's mark becomes a default nobody notices. Render the name, not a borrowed asset. |
| a path that has never run | **That is where the next defect sits.** `featured_footer` had never rendered a real sponsor, and the never-executed branch held the cross-brand placeholder. Inspect never-executed paths BEFORE the first real execution, not after. |
| a verify that touches storage | **Never write storage.objects from SQL.** Supabase's storage.protect_delete refuses it (42501, verify_078's first run) and a direct insert would leave a record with no file. Assert storage policies from pg_policies; exercise uploads through the Storage API (scripts/verify-graphics-owner.mjs pattern). |
| writing, replacing or dropping an RLS or storage policy | **Enumerate the existing policies first.** Query `pg_policies` for the table (live, not the last migration) and list every policy with its command, roles and `using`/`with check`, then state in the migration header what each one covers after your change. Permissive policies OR together, so a stricter policy added beside a `using (true)` baseline is decorative (three times), and dropping a baseline silently removed the owner path it was carrying (four for four: sponsorships, applications, food_trucks, booths). 078 found `aatc-graphics` had no owner INSERT policy at all. Full entry in the 2026-08-13 standing rules ("PERMISSIVE BASELINES WERE DOUBLING AS OWNER POLICIES"). |
| a verify that passes on a view | **Row counts and values do not check SHAPE.** A view can return the right rows with the right credits and be missing a column entirely. `create or replace` refuses a drop, but a DROP + CREATE does not. Assert the column list and order. |
| moving hardcoded content into a table | **Confirm the new source matches the old BEFORE deleting the old.** |
| writing a plpgsql function | **RETURNS TABLE columns become OUT variables** - qualify every column reference. And **a verify block must CALL the function**, not just describe it. |
| writing dates a year ahead | **Check BOTH offsets independently**, especially across March/November. |
| choosing a boundary value | **Encode for robustness over literalness**; let the comment carry the intent. |
| adding a rule, fee, consent or restriction | **Grep for absolute statements** the change makes untrue - `never`, `always`, `all`, `only`, `free`, `public`. |
| a repo-wide find and replace | **The exclusion category is DATA, not syntax** - any string literal compared against stored data. |
| stating a time, room, price, count or name on a page | **A fact gets one home.** The strongman time had FIVE, each found only by fixing the one before it. Full entry below. |
| an SQL Editor warning appears | **It parses without plpgsql context.** `select ... into v` reads as CREATE TABLE. Never accept a GRANT it suggests. |

## CORRECT, DOCUMENTED, AND INERT

**Three instances in one session, and it is now the most common failure shape in
this codebase.** A mechanism is written, it is right, its comment names exactly
the case it defends against - and its precondition is never satisfied, so it
does nothing. **Inert and working look identical from outside.** Nothing throws,
nothing reports, and the comment reads as reassurance.

| mechanism | precondition | why it was inert |
|---|---|---|
| **047's hold** | "run when `verify_046` returns zero rows" | It returned two, for months, because of the very defect 064 later repaired. Nobody re-ran it, so the hold became permanent without anyone deciding it. |
| **migration 061** | the voting window SEED writes the dates | 061 applied cleanly, the columns and `voting_state()` existed, the migration table was green. The seed had never run and both events held NULL. |
| **`amount_locked`** | someone sets it on the row | Written to stop exactly this: "editing a phone number would silently reprice the sponsorship to current packet pricing." It is FALSE on Tattoo Goo, the single grandfathered row it exists to protect. The invoice follows the amount, so this was the expensive one. |

**THE CHECK IS CHEAP, AND IT IS THIS: every guard in this codebase names the case
it was written for, in its own comment. Go and read that case against live
data.** `amount_locked` says "grandfathered amounts"; there is one grandfathered
row; it takes one query to see the guard is off. The 047 hold names
`verify_046`; running it takes seconds. Neither was done, because a documented
guard reads as a solved problem.

**Prefer removing the precondition to satisfying it.** The fix for
`amount_locked` was not to set it - it was to stop deriving the amount at all, so
there is nothing to guard. A field initialised from the stored value cannot
reprice. A guard you no longer need cannot be disarmed.

**When a guard must stay conditional, the condition needs the treatment in the
next section**: it fails loudly, or it is checked on a schedule, or it will
quietly become permanent.


## A FACT GETS ONE HOME

**The worked example: the strongman start time, 2026-09-13.** Ryan confirmed
1:00 PM. Here is where the fact lived, in the order each copy was found:

| # | where | said | how it was found |
|---|---|---|---|
| 1 | `supabase/seeds/schedule_2027.sql` | 1:00 | the seed; assumed to be THE source |
| 2 | `src/lib/homepage-content.ts` | 1:00 | a code comment claimed "the time now lives in exactly two places", this and the seed |
| 3 | `src/app/tickets/page.tsx`, static `SCHEDULE` array | **1:30** | grepping room names for a different task |
| 4 | the live `schedule_items` row | **13:30** | reading the public view to see what the schedule page ACTUALLY rendered, after #3 raised the question |
| 5 | `docs/aatc-2027-schedule-spec.md` | **1:30** | checking whether two items dropped from #3 were in the spec, while fixing #3 |

Three of five were wrong. Two of the wrong ones were the copies pages actually
render from. The comment at #2 was sincere and false: it counted the copies
its author knew about. **Nobody found copy N by looking for copies; each was
found as a side effect of fixing copy N-1.** That is the signature of this
pattern, and it is why "I grepped and there are only two" is not evidence -
the Collector's Choice wording (four copies) and the pinup page (five wrong
times) went the same way.

The same day: the meet-and-greet room had three names across four surfaces
("Front Room", "VIP Lounge", "Seminar Room", and the seed note put the
seminars in a fourth room entirely), and the Gold Star passes had two donors,
two counts and two sign-up paths across two pages.

**The rule.** A fact that is rendered has exactly one home, and every surface
that shows it reads from there:

- a **time, day or room** lives in `schedule_items` / `panels` and reaches
  pages through `getSchedule` in `src/lib/schedule-data.ts`;
- a **room NAME** lives in `ROOMS` in `src/lib/event-config.ts`, and the
  database rows carry the same string (rename both, see
  `rooms_2027_rename.sql` for the pattern);
- a **price, presenter, contact or venue** lives in `src/lib/event-config.ts`
  or the content registry, never inline.

**What "a different presentation" does and does not justify.** `/tickets`
shows the weekend in three columns; `/events/schedule` shows it as one long
list. That is a rendering difference, and it is served by one loader and two
templates. It is NOT a reason to keep a second dataset. The tickets array was
described as "a summary" and was in fact a full copy that had been wrong in
three places since the spec changed Saturday's closing time.

**Before deleting the old copy, diff it against the new source** (rule already
above: confirm the new source matches the old BEFORE deleting the old). The
diff is where the dropped items surface - the parachute team and the nonprofit
presentation existed only in the static array, and whether they are real is a
question for Ryan, not a reason to keep the array.

**If you write "this now lives in exactly N places", you are about to be
wrong.** Write where it lives (singular), and grep for the VALUE as well as the
name - `13:30`, `1:30 PM`, `1:30` - across src, supabase, docs, and the live
views, because the copies do not share a spelling.

## A FALLBACK ASSET IS GENERATED OR NEUTRAL, NEVER BORROWED

The footer's placeholder was `site-assets/skin-reserve-home-2.webp` - a real
business's image, used as the default for any sponsor with no logo, captioned
with that sponsor's name and linked to their website.

**The near-miss is worth more than the fix, because of HOW it happened.**
Nobody set out to misrepresent anyone. Whoever wrote that line needed a
placeholder and reached for something already in the bucket. That is the entire
mechanism: **a default chosen from the site's own real content is indistinguishable
from a deliberate choice**, reads as finished work, and survives review because
an image that loads looks correct.

It also never executed. `featured_footer` had only ever been set on the RLS
harness row, which is filtered out, so the branch had no live run in which
anyone could have noticed.

The rule, stated so it covers the next one rather than only this one:

- **A fallback asset must be generated or neutral.** A monogram, an initial, a
  shape, the entity's own name as text. Never another real entity's content.
- **This is not about logos.** Substituting any real entity's asset as a default
  is the same failure in any medium: a stock bio, a sample review, a specimen
  address, a real venue as an example venue.
- **`/sponsors` had it right all along** - it renders the sponsor's initial when
  there is no logo. The footer was the outlier, and consistency between two
  surfaces rendering the same data is worth checking on its own.

Same family as **no placeholder humans**: that rule forbids inventing a person's
name or credential, and this one forbids borrowing a real one. Inventing and
borrowing fail in the same direction - something appears on the site that is not
true of the thing it is attached to.


## TATTOO GOO BREAKS EVERY ASSUMPTION - RUN NEW CODE AGAINST IT FIRST

**It is the only real sponsorship row in the database, and it has now surfaced
five defects before any of them fired.** Not one was found by the code failing;
every one was found by asking "what does this do to Tattoo Goo?"

`tier = 'gold'`, `amount = 300000` ($3,000), `status = 'pending'`,
`amount_locked = false`, `is_custom = false`. It is **grandfathered** at the
pre-July price - CUTOVER records that as correct, not an error - and it holds an
open Gold offer that has not been accepted.

| # | what it would have broken |
|---|---|
| 1 | **Round-down derivation** would demote it gold -> silver ($3,000 rounds down to $2,500) and strip a sold homepage placement. |
| 2 | **`missingPlacements`** run over every row reports it owed homepage and footer - it is PENDING and owed nothing yet. Fixed by scoping to confirmed. |
| 3 | **`is_custom` recomputed on save** marks it custom, because $3,000 is not gold's $5,000. Grandfathered is not custom. Fixed by making it a stated checkbox. |
| 4 | **The placement check** would have reported it as a permanent false positive on every run - the failure that gets a check ignored rather than read. |
| 5 | **`amount_locked` being false** meant editing any field repriced it $3,000 -> $5,000, and the invoice follows the amount. |

**So: any new code touching `sponsorships` gets run against Tattoo Goo before it
is trusted.** It is one row and one query. Every assumption this system makes
about a sponsorship - that tier matches amount, that a price is current, that a
row is confirmed, that a guard is armed - is false for that row, which is
precisely what makes it the best test in the database.

The general form: **grandfathered and non-standard rows are where a system's
assumptions break.** They are rare, so they are not what anyone pictures while
writing the code, and they are real, so they are not what anyone deletes.


## A hold whose gate fails silently becomes permanent

**Written out in full because it is the most valuable rule from the 2026-08-31
session, and because the incident took months to surface and was found by
accident.**

Migration 047 was held on purpose. Its header named the gate precisely: run it
only once step 3 confirms `verify_046` returns zero rows. That was a good
decision, correctly recorded, and it still failed - because **the gate was being
failed by a defect nobody was watching for.** Both panels had a null
`panel_day`, so `verify_046` would have returned two rows every time it was run.
It was not run again. The hold silently became permanent.

The two states are indistinguishable from outside:

- a hold waiting on a condition that has not yet been met, and
- a hold waiting on a condition that has FAILED and will never be met

Both look like "not applied yet". Neither throws. And the second one degrades
further over time, because the surrounding docs keep being written as though the
migration is merely pending.

**So a hold is not adequately expressed by recording it.** A recorded gate is a
note to a reader who may never come. Every hold needs ONE of:

1. **A gate that fails loudly.** The condition is asserted somewhere that runs
   on its own - a prebuild guard, a verify block in a file someone runs for
   another reason, a check that raises. If the gate fails, something says so
   without being asked.
2. **A scheduled re-check**, with the date written down, and the current status
   of the gate recorded each time it is checked - not just the gate itself.

And the status must say **what the gate is doing right now**: open, blocked, or
blocked-for-a-reason-that-is-itself-a-bug. "Held" alone is the state that hid
this for months.

The corollary is the phrasing rule: **never write "applied through N".** A range
implies contiguity it cannot promise. 047 sat unapplied inside "applied and
verified through 063", and that sentence is why migration 065 was written
against a column list that did not exist, and was rejected with
`42P16: cannot drop columns from view`.

### A green migration does not imply its data landed

**Schema and seed are two separate applications, with two separate bodies of
evidence, and the seed's evidence is THE DATA - never the migration's status.**

This is the same shape as the hold above, one layer down. Migration 061 was
applied and verified: the columns existed, `voting_state(p_event_id)` existed,
the row in the migration table was green. Every one of those facts was true, and
none of them said anything about whether a window had been WRITTEN. It had not.
`voting_window_2027.sql` had never run, both events held NULL, and this file
meanwhile stated the window as live fact with exact timestamps.

A green migration row answers "can this data exist?". It never answers "does
it?". So:

- Seeds get their own status table, with the DATA as evidence - a count, a
  value, a function's return - not a tick against the migration that made room
  for it.
- **A verify block must CALL the function, not describe it**, and must assert on
  VALUES, not on non-nullness. A seed that wrote the wrong values looks exactly
  like a seed that wrote the right ones: both leave a non-null column. The
  voting window was confirmed by reading 31 for `days_to_exclusive_bound` and
  "before" from `voting_state()`, not by observing two timestamps were present.
- The same applies to anything else where schema and content are applied
  separately: `page_content`, `page_images`, `team_members`, `contests`. An empty
  table and an unapplied seed are indistinguishable from the schema side.

### A fact stated in this file is a CLAIM, not evidence

Both the 047 hold and the voting window were asserted here as settled, and both
were wrong. Neither was a lie; each was true when written, or believed true, and
then nothing re-checked it. **This file is the least reliable source in the
project about live state, precisely because it is the easiest to write.**

So: **anything in this file describing LIVE STATE must name how it was verified
and when.** Not "the voting window opens 2027-04-21" but "verified by Ryan
running the seed and reading its report, 2026-08-31". A sentence without a
provenance is a sentence someone will act on, and the two incidents this session
both began with acting on one.

Where the provenance is a person saying so, write that too - "Ryan confirmed"
is a real and useful provenance, and it is honest about being a claim rather
than a measurement. The failure mode is not trusting people; it is a statement
whose origin has been forgotten, which then reads as measured fact.

**And the reason this one matters more than the others in this file:** the
failure it produces is invisible. Running 047 as originally written would have
dropped and recreated `panels_public` without the credit join added by 065. No
error. No failing page. No test failure. A sold presentation credit would simply
have stopped rendering - the exact defect class this project has now hit twice,
from both directions.

---
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
