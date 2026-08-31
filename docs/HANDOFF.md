# AATC Platform - Handoff

<!-- ============================================================
     SESSION HANDOFF - written 2026-08-31, end of a long working session.
     Read this block first. Everything below it is the standing reference.
     ============================================================ -->

## 0. START HERE - state as of 2026-08-31

### ⚠ 047 IS NOT APPLIED, AND "THROUGH 063" NEVER MEANT ALL OF THEM

Read this before writing any migration that touches `panels_public`.

**047 has never run.** It is Phase 2 of the 046 change and was deliberately
HELD, gated on a step-3 confirmation that `verify_046` returned zero rows. That
gate never passed - the failed backfill 064 repaired is exactly what was failing
it - so the hold worked as designed and then quietly became permanent.

Consequences, all confirmed against the live database:

- `panels` still has `panel_date` and `panel_time`, still holding
  `'Sunday, April 18'` with `'1:30 PM'` and `'3:00 PM'`.
- `panels_public` is still **046's shape**: the deprecated pair at positions 5
  and 6, and `panel_day` / `panel_start` APPENDED LAST.
- This file previously headed its migration list "applied and verified through
  063". That range read as contiguous, 047 sits unapplied inside it, and that is
  how migration 065 came to be written against a column list that does not exist
  and was rejected whole with **`42P16: cannot drop columns from view`**. The
  range phrasing is now banned and replaced by an explicit status table below.

**The lesson, and it is now a rule below: a migration file says what someone
INTENDED a shape to be. Only the database says what it IS.** Read live view
shapes from `information_schema` before replacing a view. `verify_065` block E
pins both lists so this cannot recur silently.

**⚠ BEFORE 047 IS EVER RUN, CARRY THE CREDIT JOIN INTO ITS VIEW BODY.** 047
drops and recreates `panels_public` from its own text, which still reads
`coalesce(sp.sponsor_name, p.presented_by_fallback)` with no credit join.
Running it as written would silently revert 065's panels dual-read: no error, no
failing page, a presentation credit simply stops rendering. 047's precondition
is finally satisfiable now that 064 has landed, so this is live, not theoretical.

### Migration status - EXPLICIT, because a range is not a status

**Never write "applied through N" again.** That phrasing is what produced the
047 incident: it reads as contiguous, it was not, and a migration sat unapplied
inside the range for months. A number omitted from a range says nothing about
why. Every migration below is stated as APPLIED, HELD (with its gate and the
gate's current status) or NOT APPLIED.

Audited 2026-08-31 against the LIVE DATABASE, not against this file.

| # | status | detail |
|---|---|---|
| 001-046 | **APPLIED** | every table, view and column each one creates is present live. |
| **047** | **HELD - GATE NOW OPEN, DO NOT RUN AS-IS** | Drops `panels.panel_date` / `panel_time`. Gate: step 3 of its own header, "verify_046 returns zero rows". That gate FAILED SILENTLY for months - both panels had a null `panel_day`, which is the defect 064 repaired - so the hold became permanent without anyone deciding it. **The gate is now satisfiable.** 047 was AMENDED 2026-08-31 to carry 065's credit join; before amendment, running it would have silently reverted the panels dual-read. Running it also changes `panels_public` from 20 columns to 18, so `verify_065` block E must be updated in the same pass. Its header carries the replacement list. |
| 048-063 | **APPLIED** | as above. |
| **064** | **APPLIED + VERIFIED** 2026-08-31 | panel day/start repair, `panels_published_has_schedule`. |
| **065** | **APPLIED + VERIFIED** 2026-08-31 | dual-read. Rejected on its FIRST run with `42P16` because its column list came from unapplied 047; fixed to the live shape and re-run. Verified by Ryan via `verify_065.sql` (four credits, all `source = 'fallback'`) and by re-fetching the three pages against a pre-064 baseline. |

**What this audit could and could not see.** It reads the live schema through
PostgREST's OpenAPI document, which exposes tables, views, columns and callable
RPCs. It CANNOT see policies, grants, indexes, constraints, trigger functions or
function bodies. So the migrations that only change RLS, grants or trigger
functions - **002, 003, 007, 011, 015, 024, 025, 031, 034, 041, 043, 049, 054** -
are not confirmed by it. There is no evidence of absence for any of them; they
are simply invisible to this method. Anything asserting one of those needs a
verify block run in the SQL Editor.

| # | what | verified |
|---|---|---|
| 050 | `page_images` + bucket | verify_050 |
| 051 | `pinup_entries` + `register_pinup_entry()` | verify_051 |
| 052 | contest columns + marketing consent | verify_052 |
| 053 | vote auth, one vote per category per day | verify_053 |
| 054 | content_editor editorial writes | verify_054 |
| 055 | likeness release | verify_055 |
| 056 | after-parties hero image slug | live: 4 after-party slugs present |
| 057 | `page_galleries` | - |
| 058 | after-party per-night image slugs | live: thursday/friday/saturday present |
| 059 | `team_members` | - |
| 060 | `presentation_credits` + join table | (verify via 062 block C) |
| 061 | voting window COLUMNS + `voting_state()` | verify_061. **The SEED is a separate matter - see below.** |
| 062 | `exclusivity_grants` | verify_062 |
| 063 | `show_on_sponsors` / `show_on_vote_pages` | - |

### The voting window - VERIFIED LIVE 2026-08-31

**Verified by:** Ryan ran `voting_window_2027.sql` in the SQL Editor and read
its report, 2026-08-31. Not asserted, not inferred from the migration status.

| field | value |
|---|---|
| opens | 2027-04-21 12:00 ET |
| closes | 2027-05-22 00:00 ET |
| `days_to_exclusive_bound` | **31** |
| `voting_state()` now | **"before"** |

The 31 is correct against an EXCLUSIVE bound: 30 days of voting, with the
boundary at the start of day 31. The closing comparison is `<`, so voting ends
at the end of 21 May. `voting_state()` was CALLED, not described - it returns
"before" today, which is the expected value for 2026-08-31.

**What this replaces.** Until 2026-08-31 this file stated the window as live
fact with exact timestamps while both columns were actually NULL on both events.
The seed had never run. **A green migration masked a missing seed:** 061 was
applied - the columns and `voting_state(p_event_id)` existed - so the migration
table was green and nothing pointed at the data. It failed closed, which is the
only reason nothing leaked, but voting could not have opened.

This is the same failure as 047, twice in one session, and the more serious of
the two: 047 was a migration nobody had run, this was a fact the handoff
asserted as settled.

### Seed status - also explicit, also audited live 2026-08-31

| seed | status | evidence |
|---|---|---|
| `contests_2027.sql` | **APPLIED** | 49 contests live |
| `schedule_2027.sql` | **APPLIED** | 25 schedule_items live |
| `panels_2027.sql` | **APPLIED** | 2 panels live. NOTE: it ran AFTER 046, which is why 046's backfill matched nothing and 064 was needed. |
| `tattoo_battle_credit.sql` | **APPLIED** | 3 Battle rows carry `Whole Life Aftercare` |
| `voting_window_2027.sql` | **APPLIED + VERIFIED** 2026-08-31 | Ryan ran it and read the report: opens 2027-04-21 12:00 ET, closes 2027-05-22 00:00 ET, `days_to_exclusive_bound` 31, `voting_state()` returns "before". See above. |

### Nothing is awaiting application

Everything written is applied. The one migration deliberately NOT applied is
047, which is HELD - see the status table above for its gate and why it must not
be run as-is without also updating `verify_065` block E.

**How things get applied here:** there is no psql, Supabase CLI or connection
string in this environment, only the anon and service-role keys, and DDL does not
go through PostgREST. Migrations and seeds are pasted into the Supabase SQL
Editor by Ryan. Live view SHAPES can be read from this environment through
PostgREST's OpenAPI document, which is how the 42P16 diagnosis was done.

**065 was rejected on its first run** with `42P16: cannot drop columns from
view`, because its `panels_public` column list was copied from 047 - which is not
applied. Nothing was applied; the statement was refused whole. Fixed by restoring
the live 046 shape and changing only the `presented_by` expression, so it stayed
a pure `create or replace` and the grants survived.

### Live and working

- **Pinup registration is OPEN.** `PINUP_REGISTRATION_OPEN = true` in
  `src/lib/event-config.ts`. WAF rate limiting verified by an OBSERVED 403
  (8 POSTs: five 503s then 403 on 6, 7, 8). Honeypot + 2s timing filter on
  `/api/pinup-entry` and `/api/panel-register`. `pinup_entries` is EMPTY - the
  one test row was deleted, 25 spots free.
- **49 contest categories seeded**, kids category flagged on Sunday.
- **Voting window** (VERIFIED live 2026-08-31 - Ryan ran the seed and read its
  report; `voting_state()` returns "before", `days_to_exclusive_bound` 31):
  opens 2027-04-21T12:00:00-04:00, closes 2027-05-22T00:00:00-04:00 (EXCLUSIVE,
  compared with `<`, meaning end of day 21 May). Enforced in RLS, not the UI.
  NULL window = closed. Until this date the same sentence appeared here
  UNVERIFIED, and both columns were actually NULL.
- **`/contests`** shows one of three states from `voting_state()`.
- **Admin screens**: `/admin/page-images`, `/admin/galleries`, `/admin/team`,
  `/admin/pinup`, `/admin/credits` (credits + exclusivity).
- **Write-guard sweep COMPLETE**: 76/76 admin writes guarded, one documented
  exception (booth clear-previous-assignment, where zero rows is normal).

### Built but not yet exercised

- **`show_on_vote_pages`** - the slot exists (`VotePageSponsors` on
  `/contests`) and renders nothing because no sponsor is ticked. Working as
  intended; it needs a sponsor, not code.
- **`presentation_credits`** - table and admin exist, NO rows migrated. The four
  existing credits still render from `presented_by_fallback`. See section 2.

## 1. WORDING QUESTION - SETTLED 2026-08-31

The Collector's Choice package said **"Your logo on every vote page of our
website"** - plural, while there is ONE vote page: `/contests`, listing all
categories inline. **Settled: the copy was loose. It now reads "Your logo on our
Collector's Choice voting page."**

Changed in `src/app/apply/sponsor/page.tsx:75` and
`src/app/sponsors/packages/page.tsx:118`, with the comment in
`src/components/VotePageSponsors.tsx` and the mapping note in
`src/lib/sponsor-placements.ts` updated to match.

**The principle, which is the part worth keeping:** the promise was corrected
rather than pages built to satisfy loose wording. A sold placement whose copy
describes something that does not exist is fixed at the copy unless someone
actually intends to build the thing. The same call was made on the footer, where
rotation would have made "your logo in the footer" mean "sometimes" - get the
promise right instead.

## 2. IN FLIGHT / NEXT

### Seminar times are PRESENTER-CONFIRMED, not document-derived

Confirmed with both presenters directly on **2026-08-31**. They said the times
are correct and will come back if that changes.

| seminar | `panel_day` | `panel_start` |
|---|---|---|
| Bookkeeping for Tattoo Industry Professionals (Nomadica) | 2027-04-18 | 13:30 |
| Tooth Gem Seminar | 2027-04-18 | 15:00 |

These values were RECOVERED from `supabase/seeds/panels_2027.sql`,
`docs/aatc-2027-schedule-spec.md:50` and `docs/CUTOVER.md:465`, which all agree
- but they are now confirmed by the people presenting, and that is the stronger
source.

**So if a presenter moves, the correction goes to the DATA**, not to whichever
document looks authoritative. Change the `panels` row through `/admin/panels`
or a new migration. The seed file cannot be the fix: a seed does not re-run
against a live database, so editing it would leave production unchanged and
leave the seed describing a schedule nobody is presenting. The documents above
are now the WEAKER record, and the next person to read them needs to know that
before they "correct" a live row to match a stale doc.

**Correction, same day:** an earlier version of this paragraph said 047 had
dropped `panel_date` / `panel_time`. It has not - 047 is unapplied, and both
columns are still live and still hold `'Sunday, April 18'` with `'1:30 PM'` and
`'3:00 PM'`. That is a fourth source agreeing with the presenters, and it also
explains 046's failure: the strings were always right, so the backfill's join
simply had no `schedule_items` rows to match when it ran. The panels seed ran
AFTER 046, not before it.

### The seminars were missing from /events/schedule - migration 064

Found 2026-08-31 by querying `panels_public` as anon, not by reading source.
Both panels had `panel_day` and `panel_start` **NULL**. `/events/schedule`
keeps only panels whose `panel_day` matches a programme day, so **both seminars
were absent from the schedule page, and with them the Nomadica presentation
credit** - a sold commitment rendering on no page that matters. Nothing threw.

How it happened: 046 backfilled by joining `panels.panel_date` against labels
built from `schedule_items`, that join matched nothing when it ran, and an
UPDATE affecting zero rows is not an error. 047 then dropped `panel_date` /
`panel_time`, so the source strings are gone from the database.
`verify_046.sql:49` checks for exactly this and returned those two rows.

064 repairs the data, asserts its own post-condition (the assertion 046 lacked)
and adds `panels_published_has_schedule`, so publishing a panel with no slot is
now impossible rather than merely detectable.

Blast radius, checked per page in RENDERED output:

| page | before 064 |
|---|---|
| `/events/schedule` | both seminars absent, Nomadica credit not rendered |
| `/` | both render, but with no day and no time |
| `/events/tattoo-panels` | renders them client-side under a literal "TBD" |

### presentation_credits dual-read, then retire the fallback

Nothing is migrated into it yet, deliberately. The sequence agreed:

1. Dual-read: render from a credit if one exists, else `presented_by_fallback`.
   **Written as migration 065.** Precedence decided 2026-08-31: **confirmed
   sponsorship, then confirmed credit, then fallback.** The sponsorship keeps
   the top slot because it is the only source carrying `website`; invert it and
   an item holding both renders one company's name linked to another company's
   site. Whole Life Aftercare is due both, so this is not hypothetical.
2. **DONE - VERIFIED 2026-08-31.** Evidence below.
3. Only then move the four rows and drop the fallback. `verify_065.sql` block Z
   is the reconciliation: it lists every rendered credit with the source it
   resolves from. Drive `source = 'fallback'` to zero first. **This is the next
   action on this thread**, and it is blocked on nothing but the amounts.

#### Step 2 evidence - 065 changed nothing that renders

**Verified by:** Ryan ran `verify_065.sql` in the SQL Editor (all four credits
resolve with `source = 'fallback'`), and the three pages were re-fetched from
production and compared against a baseline captured before 064 and 065.
2026-08-31.

| page | pre-064/065 | now | reading |
|---|---|---|---|
| `/tickets` | WLA 4 | WLA 4 | unchanged. Hardcoded from `TATTOO_BATTLE_PRESENTER`, so it is the CONTROL - it cannot move when a view changes, and it did not. |
| `/` | WLA 2, Nomadica 2 | WLA 2, Nomadica 2 | credits unchanged. Separately gained `Sunday, April 18 · 1:30 PM` on the seminar cards, which is 064's repair, not 065. |
| `/events/schedule` | WLA 6, Nomadica **0** | WLA 6, Nomadica **2** | the ONLY credit change, and it is 064's: the seminar and its credit were absent before and are present now. |

So every credit that rendered before 065 renders identically after it, and the
only additions are the two seminars 064 restored. `verify_065` block C proves
the same thing one layer down, per row, in SQL.

**Two traps hit while doing this, both worth knowing:**

- **The first re-fetch was a STALE ISR COPY** (`age: 15`, `x-vercel-cache: HIT`)
  and showed Nomadica still absent from `/events/schedule`. Taken at face value
  that reads as "064 did not reach the page". These pages revalidate on a 60s
  ISR window, so **a rendered check must confirm the page actually revalidated** -
  check `age` and poll past the window - or it is a measurement of the past.
  Confirmed stable afterwards by polling 8 times across a full revalidation
  cycle (`age` cycling 0 to 60): Bookkeeping present, Nomadica x2, every time.
  One fetch is not evidence for an ISR page; a full cycle is.
- **Byte-for-byte is the wrong test across a deploy.** Pushing triggered a
  Vercel build, so every asset hash, the `dpl_` deployment id and the RSC build
  id changed. Compare rendered TEXT with those stripped. After stripping,
  `/tickets` differs only by the build id.

065 is **APPLIED and VERIFIED** (Ryan, 2026-08-31). It was a **provable no-op**
on the data as it stood - no confirmed credit item exists, so the new coalesce
branch is never taken. That is exactly why `verify_065`
block D matters: it builds fixtures to take that branch, because blocks A to C
would pass identically for a migration that read the credit wrongly or not at
all.

Same discipline as `TEAM_FALLBACK` and the VIP price. **`verify_044` query F is
the counter** - it stands at 4 and counts ITEM ROWS carrying a text credit, not
credits sold (3 Battle rows + 1 seminar = 2 commitments).

**Amounts are unknown.** Ryan has not said what was charged for the Battle or
the seminar. Do not invent figures; `presentation_credits.amount` stays 0 until
he does.

## 3. THE THREE SPONSORS - NOT YET ENTERED

**Ryan enters production data himself. Do not create these rows.**

| sponsor | invoiced | paid via Square | exclusivity category |
|---|---|---|---|
| Nomadica | $7,500 | $1,875 | `accounting_presentation` |
| All American Tattoo Supply | $5,000 | $2,500 | `on_site_supplier` |
| Whole Life Aftercare | $7,500 | $750 | `tattoo_battle` |

**All three are off-tier** (against Gold $5,000 / Platinum $10,000). Record the
negotiated `amount` and, separately, `based_on_tier` - keeping both means an
off-tier deal loses neither the figure nor the package it came from.

**What each needs:**

1. A `sponsorships` row - name, tier, `amount`, `status = 'confirmed'`, and
   `show_on_sponsors` / `show_on_vote_pages` / `featured_footer` /
   `show_on_homepage` set EXPLICITLY.
2. An `invoices` row for the full amount, with `amount_paid` set to the Square
   figure and `payment_method` recording how it arrived. Migration 033 added
   `payment_method` / `payment_reference` for exactly this; its documented set
   is `stripe_external, cash, check, bank_transfer, other` - **`square` needs
   adding to that convention**, it is free text so no migration is required.
3. An `exclusivity_grants` row - INTERNAL ONLY, never rendered.
4. Whole Life Aftercare additionally has the Tattoo Battle presenting credit,
   already live on three schedule rows and four pages.

**Square to portal does not double-count.** `create-checkout` computes
`balance = amount - amount_paid`, so recording the Square money leaves the
portal offering only the remainder: Nomadica $5,625, AATS $2,500, WLA $6,750.

**What publishing does:** a `sponsorships` row with `status = 'confirmed'` and
`show_on_sponsors = true` appears on `/sponsors`. Nothing else about it is
public - `sponsors_public` exposes a fixed column list, and exclusivity lives in
its own table with no anon grant at all.

**EXCLUSIVITY IS NEVER PUBLIC.** The word "exclusive" appears nowhere on the
site in connection with any sponsor - verified in RENDERED output, not just
source. The four occurrences that do exist are an Artist Lounge tier perk and
VIP poster copy, unrelated.

## 4. DEFERRED, WITH TRIGGERS

| item | blocked on / revisit when |
|---|---|
| **payments ledger** | Revisit BEFORE on-site pre-registration. 2027 is Stripe-dominant; Ryan takes ~20-25% of next year's bookings as cash/card at a table during the show. Estimate 1-1.5 days. See the entry below on why a mis-recorded manual payment is undetectable. |
| **In Memoriam photos** | Blocked on the WordPress media harvest, CUTOVER section A. Building against URLs that die is wasted work, and it is where "no placeholder humans" matters most. |
| **After-party venues** | Nights are live (Thu/Fri/Sat, Thursday pre-convention). Venue, act, door price and time all wait on Ryan. Per-night image slugs already exist. |
| **`/admin/schedule` for content_editor** | Granted 2026-08-31. Done. |

## 5. HOW TO VERIFY ANYTHING

    python3 -c "import pglast; pglast.parse_sql(open('FILE.sql').read())"   # parse
    python3 scripts/check-sql-fixtures.py                                   # fixture columns
    node scripts/check-no-em-dashes.mjs                                     # dashes + harness literals
    npx tsc --noEmit && npm run build                                       # types + build
    curl -s https://aatc-platform.vercel.app/PATH | grep -c 'thing'         # what RENDERS

The last one is not optional - see the code-and-data rule below.


## 6. THE RULES - index

All of these are written out in full further down. They came from real defects
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
| a fallback image or value | **No placeholder humans applies to BRANDS.** The footer substituted a real company's artwork for any sponsor without a logo, captioned with the other sponsor's name. Render the name, not a borrowed asset. |
| a path that has never run | **That is where the next defect sits.** `featured_footer` had never rendered a real sponsor, and the never-executed branch held the cross-brand placeholder. Inspect never-executed paths BEFORE the first real execution, not after. |
| a verify that passes on a view | **Row counts and values do not check SHAPE.** A view can return the right rows with the right credits and be missing a column entirely. `create or replace` refuses a drop, but a DROP + CREATE does not. Assert the column list and order. |
| moving hardcoded content into a table | **Confirm the new source matches the old BEFORE deleting the old.** |
| writing a plpgsql function | **RETURNS TABLE columns become OUT variables** - qualify every column reference. And **a verify block must CALL the function**, not just describe it. |
| writing dates a year ahead | **Check BOTH offsets independently**, especially across March/November. |
| choosing a boundary value | **Encode for robustness over literalness**; let the comment carry the intent. |
| adding a rule, fee, consent or restriction | **Grep for absolute statements** the change makes untrue - `never`, `always`, `all`, `only`, `free`, `public`. |
| a repo-wide find and replace | **The exclusion category is DATA, not syntax** - any string literal compared against stored data. |
| an SQL Editor warning appears | **It parses without plpgsql context.** `select ... into v` reads as CREATE TABLE. Never accept a GRANT it suggests. |

<!-- ============================================================ -->


**Last session:** 2026-08-13
**State:** build green, 66 routes, both prebuild guards passing.
**Git:** see §1 - push state changes as soon as this is acted on.

**Environment (confirmed):** sending domain `send.allamericantattooconvention.com`
verified on an AATC-owned Resend account, DKIM/SPF/MX green.
`PAYMENT_ALERT_EMAIL` = `accounting@allamericantattooconvention.com`, delivering.
DNS is **Cloudflare**-managed (moved from eNom); WordPress records are proxied -
see CUTOVER.md §A for the SSL-mode trap.

The authoritative launch list is [CUTOVER.md](CUTOVER.md). This file is session
state; that file is the plan.

---

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

## 1. Do these first

### 1a. Migration 043 - APPLIED AND VERIFIED AT THE CATALOG LEVEL 2026-08-13

`supabase/migrations/043_service_role_and_owner_reads.sql`. **`verify_043.sql`
has been run. Do not re-run it.** Measured, not inferred:

- **both** clamp functions carry the exemption - `has_exemption = true` on
  `applications_force_safe_insert` AND `applications_protect_staff_columns`
- both are still `SECURITY DEFINER` with `search_path` pinned
- all four owner policies present

That closes the partial-apply question the single insert probe could not
answer. The remaining gap is behavioural, not structural - see the bottom of
this section.

**(1) service_role clamped by the 031/041 triggers - FIXED AND VERIFIED IN THE
DEPLOYED FUNCTIONS.** Both tested `is_admin()`, which is false for service_role
(no `auth.uid()`), and **triggers are not bypassed by service role the way RLS
is**. This silently broke `/api/admin/import-returning`, which inserts
applications with `status:'approved'`, `deposit_due_at` and `final_due_at` - all
three clamped, so imported returning exhibitors landed as `pending` with no
lifecycle dates. **`/api/admin/import-returning` is still not tested end to end** - the clamp is
gone, but nobody has actually run an import.

**The test is written and waiting for you to run it:**
1. Sign in as admin → `/admin/import-returning` → submit with a **throwaway
   address you control**. The route sends a real `returner_invite`.
2. `node scripts/verify-import-returning.mjs --email <that address>` - 17
   checks. 3-8 are the 043 clamp measured through the real route; 14-17 replay
   the lifecycle sweep's four predicates and confirm the exhibitor matches
   none of them.
3. `supabase/seeds/teardown_import_returning.sql` - paste the whole file, set
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
itself fails. Invoice failure also removes the application - an approved
application with no invoice has a `deposit_due_at` and no `deposit_paid_at`,
which is the sweep's expiry profile exactly.

**`deposit_paid_at` - asked and answered: the route is correct.** It sets
`deposit_paid_at` AND `final_paid_at` on the invoice it creates, and the sweep
keys on those same two columns in all four branches, so an imported returner
matches none of them. This is NOT the admin-payment-handler failure mode. The
invariant is now commented at the call site, because it is load-bearing and
non-obvious: dropping to `status`/`amount_paid` alone would silently arm the
sweep against every imported exhibitor.
043 exempts `auth.uid() is null`. Do not widen further - the clamp is what stops
applicants self-approving.

**(2) REGRESSION from 038 - food_trucks.** Dropping `"Public read published
food_trucks"` removed the only SELECT path a vendor had to their own row: 017
granted them UPDATE but never SELECT, so the public policy was silently carrying
it. Breaks the `/portal` food-truck panel and the food_truck branch of
`/api/create-checkout`. Untestable behaviourally right now - `food_trucks` is
empty after the teardown - so **re-test both surfaces once a real food truck
exists.**

**(3) PRE-EXISTING - exhibitors.** No owner INSERT policy has ever existed, so
`RosterCompletionPanel`'s exhibitor-row creation has always been denied for
non-admins. Not caused by 038; found by the same sweep.

**(4) REGRESSION from 042 - booths.** Dropping 001's `booths: public read using
(true)` left only the deposit-gated public policy, so an exhibitor who is
approved but has not yet paid **cannot see their own booth assignment in
/portal** - precisely the person the portal exists to serve. Found by applying
the rule in §4 rather than by a report. Mine.

**Policy EXISTENCE is measured. Policy BEHAVIOUR is not.** Keep these apart -
conflating them is what let all four faults ship unnoticed.

- **Measured (2026-08-13):** all four owner policies confirmed present by
  catalog query - `food_trucks: own read`, `exhibitors: own insert`,
  `exhibitors: own read`, `booths: own read`. Re-checked by
  [verify_043.sql](../supabase/verify/verify_043.sql) query E.
- **NOT measured:** that any of them actually works. `food_trucks` and
  `exhibitors` have no rows and no booth has an `application_id`, so **no owner
  has ever read their own row through any of these policies.** A policy whose
  `using` clause is subtly wrong is indistinguishable in `pg_policies` from a
  correct one and returns zero rows at runtime.

That is still reasoned, not measured, and it is the weakest evidence in this
document. **Re-test all three surfaces once real rows exist:**

1. `/portal` food-truck panel - vendor reads their own truck
2. `RosterCompletionPanel` - creates an exhibitor row
3. `/portal` booth display - an **approved but UNPAID** exhibitor sees their
   booth. Test with an unpaid one specifically: a paid exhibitor is also covered
   by the deposit-gated public policy, so that case passes whether
   `booths: own read` works or not.

The service-role exemption (finding 1) is in a different position: it was
measured behaviourally by probe, but the **deployed function bodies have never
been read**. A probe proves the symptom is gone, not which change removed it -
and a partial paste (the failure that hit 034 three times) would fix the INSERT
clamp and leave the UPDATE clamp broken with no error raised. That is what
[verify_043.sql](../supabase/verify/verify_043.sql) queries A - D exist to catch.

### 1b. Then

- [x] **EMAIL GATE MET - all nine confirmed as INBOX ARRIVALS** in
      `accounting@`, 2026-08-13. Not acceptances. Settled; do not re-litigate.
      Re-run the harness only if the sending domain, the Resend key or
      `/api/send-email` changes.
- [x] **verify_041, verify_042 and verify_043 ALL RUN AND PASSED, 2026-08-13.**
      All three migrations had cited a `verify_NNN.sql` that did not exist; they
      are now written and executed. **Do not re-run them** unless the
      corresponding functions or policies change. Recorded results in §1a.
- [ ] **Run `supabase/verify/verify_034.sql`** if you want the per-FK output on
      record. 034 is the one migration whose effect cannot be probed through
      PostgREST - everything else below was confirmed by direct probe.
- [ ] **Finish the auth-then-read sweep.** Two routes were checked in depth
      (`send-email`, `create-checkout`). The remaining pattern to look for: a
      route that authenticates its caller and then reads with the
      request-scoped client. Cron and webhook callers expose it because they
      have no session. `create-checkout` is request-scoped **correctly** - its
      caller is a logged-in exhibitor paying their own invoice, so RLS should
      scope them - but it reads `food_trucks`, which is why finding (2) above
      matters there.

## 2. Migration state - 027 to 049 (HISTORICAL - not a status)

> **Statuses in this table were CORRECTED 2026-08-31** against the live
> database. Several said "NOT YET APPLIED" and were in fact applied - which is
> the same class of stale claim as the 047 and voting-window incidents. The
> authoritative status is the explicit table in section 0.

> **This heading names a RANGE OF FILES, not an assertion that all of them are
> applied.** The authoritative status is the explicit table in section 0, audited
> against the live database. Do not read a range anywhere in this file as
> "everything in it is applied" - that reading is exactly what hid 047.

Applied through 044. Outstanding: 045, 046, 048, 049 (and 047, deliberately held). 027-033 and 035-042 confirmed by direct probe on
2026-08-03; 034 confirmed by the operator (its effect is not visible through
PostgREST); **041, 042, 043 and 044 confirmed by their verify files on
2026-08-13** - catalog-level, results in §1a and §4a. 045 is the only one
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
| 045 | rename Apply Hub CMS key `home` → `applyHub` | **APPLIED** (live audit 2026-08-31). Effect unobservable either way: `page_content` holds 0 rows, so there was nothing to rename. |
| 046 | panels get real `panel_day` / `panel_start` | **APPLIED** (columns live). Its BACKFILL matched nothing - see 064. |
| 047 | drop the free-text panel date columns | **HELD until 2026-08-20** |
| 048 | profile self-edit: audit trail + logo storage path | **APPLIED** (`profile_edits` live). |
| 049 | sponsor owner UPDATE + commercial clamp + insert clamp | **UNCONFIRMED** - trigger functions and policies only, invisible to the OpenAPI audit. No evidence either way. |

**Convention adopted after 046 failed with 42P16 (2026-08-14): `create or
replace view` can only APPEND columns.** It compares the new column list
positionally against the existing one and cannot reorder, rename or remove.
Both directions bite:

- Inserting a column mid-list → `cannot change name of view column "X" to "Y"`,
  which names the column at that POSITION, not the column at fault. 046 hit
  this putting `panel_day` where `location` was.
- Removing a column → `cannot drop columns from view`. 047 would have hit this.

**Rule: adding to a view? Append at the end and keep `create or replace` -
column order in a view is cosmetic, every caller selects by name, and no DROP
means the GRANT survives and no dependency can be destroyed. Changing shape any
other way? `drop view` then `create view`, WITHOUT `cascade`** - plain RESTRICT
errors if something depends on it, which is information; cascade silently
destroys it. Then reissue the `grant`, which the drop discards. Both statements
inside the same transaction, so readers see no gap.

**Convention adopted 2026-08-14: THE SUPABASE SQL EDITOR IS NOT psql.** It
rejects every psql client meta-command - `\set`, `\i`, `\echo`, `\d` - with
`42601: syntax error at or near "\"`. `teardown_import_returning.sql` opened
with `\set test_email …` and could not run at all. Parameterise with a plpgsql
variable inside a `do` block instead. Checked: that was the only file affected.

**Convention adopted 2026-08-14: the Supabase SQL Editor shows only the LAST
statement's result.** Every earlier statement runs but its output is discarded
silently - nothing errors, the results just never appear, which reads as "this
file only had one check in it".

Consequences, all now applied:
- Every `verify_NNN.sql` carries a header saying to run one lettered block at a
  time, and blocks holding two queries are marked `(2 queries)` with the second
  labelled `X2 of 2`.
- A verify file must never END on a decorative `select 'note'` - that would be
  the only thing displayed to anyone who ran it whole. `verify_046` did; it is
  now a comment.
- A migration that reports two figures must combine them into ONE select. `045`
  reported `rows_moved` and `stale_home_rows` separately, so `rows_moved` - the
  actual outcome - was invisible. Now one row, two columns.
- `verify_034` is immune by construction: it is a single `union all` returning
  one row per check. That is the most robust shape for this editor and is worth
  copying when a file's checks are homogeneous.

**Convention adopted 2026-08-14: a teardown must ASSERT, not just delete.**
`teardown_import_returning.sql` shipped with its placeholder address still in
it. Had the `\set` syntax error not stopped it first, every statement would
have matched zero rows and the file would have reported a clean successful
teardown having deleted nothing - the same silent-success shape as the RLS
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

**Security.** Public tables exposed every column of every visible row - sponsor
`amount`, `email`, `phone` and `notes` were readable with the anon key that
ships in the client bundle. 038 replaced public table access with four
`SECURITY DEFINER` views and revoked anon's SELECT on the base tables. Also
fixed: an RLS recursion (42P17) that made the public directory return nothing to
real visitors for twelve weeks, an unpinned `search_path` on the function gating
every admin policy, and an insert path that let an applicant set their own
`status`, `total_amount` and lifecycle dates.

**Broken write paths.** Three features shipped non-functional because PostgREST
returns `data: []` with `error: null` when RLS filters a write. Roster
completion - which sets `needs_roster`, half the directory gate - and sponsor
self-claim both silently affected zero rows. All ten self-service write sites now
carry `.select()` and a zero-row check via `src/lib/db-write.ts`. Sponsor
self-claim was removed rather than repaired; admin-linking replaces it and still
needs building.

**Email.** Nothing had ever delivered to a real recipient: the sender was
Resend's shared sandbox, which refuses every address but the account owner, and
no call site checked the response. Domain now verified. The harness then found a
second fault: `/api/send-email` read applications with the service role but
sponsorships and invoices with the request-scoped client, which is anonymous for
a cron caller - so after 029/038 tightened those reads, `deposit_reminder`,
`final_reminder` and `sponsor_approved` all failed outright. Fixed in `6bcd882`;
8 of 9 templates now accepted.

**Data.** All 14 test applications, the March test panels/contests/food trucks
and the duplicate 267-booth set removed. Two events existed for the same show;
the inactive one is retained empty as a rollback anchor.

**Pricing.** Sponsor tiers were triplicated across three files with a fourth copy
of the rendered strings - the public application form quoted Gold at $3,000
against a $5,000 packet. Now single-sourced in `lib/sponsor-tiers.ts`. Booth
prices, add-on labels and the final-payment date were the same defect class and
are now derived.

**Built:** the homepage (was a bare redirect to `/apply`), granular admin roles
with `/admin/users`, the directory funnel diagnostic, noindex/robots on
non-production hosts, and the vertical promo video section.

## 4. Standing rules - do not break these

- **The sweep has TWO preconditions, and only one is met.** Email: MET
  (nine inbox arrivals, 2026-08-13). **Stripe reconciliation: STILL OPEN** -
  and it is the one that matters most, because the sweep targets "approved, no
  `deposit_paid_at`", which is exactly an exhibitor who paid you outside the
  platform. Arming now expires the people who have already paid.
- **The sweep is armed in TWO stages, not one.** `LIFECYCLE_SWEEP_ENABLED`
  turns it on in reminders-only mode; `LIFECYCLE_SWEEP_DESTRUCTIVE` enables the
  expiry and cancellation branches that release booths. Run a full cycle on
  reminders-only and review `would_expire` / `would_cancel` before the second
  flag. Booth release is irreversible - no history table. Procedure in
  CUTOVER.md §C.
- **`LIFECYCLE_SWEEP_ENABLED` stays unset until nine templates are confirmed
  ARRIVED IN THE INBOX - not nine API acceptances.** The harness reporting 9/9
  means Resend accepted them, nothing more. The whole reason this gate exists is
  that the platform spent months reporting successful sends that were being
  refused at the API, and no call site noticed. The sweep expires applications and **releases booths**,
  its `sendEmail()` helper never checks the response, and booth release is not
  reversible from inside the platform. Its target profile - approved, no
  `deposit_paid_at` - is exactly an exhibitor who paid outside the platform.
- **`NEXT_PUBLIC_SITE_URL` stays on the vercel.app host** until DNS cutover. It
  is the master switch for robots/noindex/canonical; flipping it early emits
  canonicals for URLs WordPress does not serve.
- **Before writing any RLS policy, list what already exists on the table.**
  Permissive policies OR together, so a stricter policy added alongside a
  `using (true)` baseline is decorative. This happened three times.

- **PERMISSIVE BASELINES WERE DOUBLING AS OWNER POLICIES. Four for four.**
  This is not four mistakes; it is one architectural fact about how the schema
  grew. Every `using (true)` policy was serving two populations at once - the
  public, and the row's own owner - and nobody ever wrote the owner policy
  because the baseline made it unnecessary. Nothing ever tested the owner path,
  so dropping the baseline broke it silently every time.

  | Table | Baseline dropped | Owner path it was silently carrying |
  |---|---|---|
  | `sponsorships` | 030, 038 | sponsor reading their own row (self-claim) |
  | `applications` | 024/028 tightening | owner UPDATE - roster completion |
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

## 4a. Migration 044 + the 2027 schedule - APPLIED AND VERIFIED 2026-08-13

**Done. Do not re-run.** `verify_044.sql` passed:

- day counts **10 / 9 / 6** across Fri - Sun (25 items), Saturday closing 22:00 -
  matching the 2027 spec, not the 2026 schedule that was hardcoded before
- **zero panels with a mismatched day label** - both seminars resolve against a
  real schedule day, so neither is silently absent from the programme. That was
  query D, the check most likely to fail quietly.

`schedule_items` and both public views are live; `/events/schedule` and the
homepage read them.

**`presented_by` is a two-field design.** `presented_by_sponsorship_id` (FK) is
authoritative; `presented_by_fallback` (text) exists so the schedule could ship
before Nomadica and Whole Life Aftercare have sponsorship rows. The FK wins the
moment it is set - no schedule edit. Both views join on `status = 'confirmed'`,
so linking an unconfirmed sponsorship still renders the fallback rather than
announcing them early. `verify_044.sql` F lists the credits still carried as
plain text; it currently returns those two, and it will stay non-zero until the
`presentation_credits` table exists (CUTOVER §E2).

### Still outstanding - apply in THIS order

**046 and 045 have OPPOSITE deploy orders. Read both before starting.**

| # | Step | When |
|---|---|---|
| 1 | `046_panel_real_dates.sql` | **BEFORE the deploy.** Purely additive; the live code keeps working because panel_date/panel_time stay. The new code reads `panel_day`, so deploying first would 42703 three public pages. |
| 2 | Deploy | after 046 |
| 3 | `verify_046.sql` | **B is the gate for 047** - 0 rows required. C is the backfill, side by side; eyeball it, because 047 is the irreversible part. |
| 4 | ~~`047_drop_panel_text_dates.sql`~~ | **DEFERRED - see below** |
| 5 | `045_rename_apply_hub_content_key.sql` | **AFTER the deploy** - opposite of 046. Its step 0 tells you whether ordering matters at all. |
| 6 | `seeds/panels_2027_signup_type.sql` | opens registration on both seminars and sets `max_capacity = 150`. Any time after 046. |
| 7 | `048_profile_self_edit.sql` + `verify_048.sql` | portal self-edit. Any time. |
| 8 | `049_sponsor_owner_update.sql` + `verify_049.sql` | admin sponsor-linking |
| 9 | The import-returning end-to-end test | §1a |

#### 047 IS DEFERRED ON PURPOSE - REVISIT 2026-08-20

**Not forgotten, and not blocked.** `047_drop_panel_text_dates.sql` is written,
correct and ready. It is being held for a week after the 046 deploy.

**Why.** Dropping `panel_date` / `panel_time` is the only irreversible step in
this change - once they are gone, the original display strings are gone, and a
bad backfill has to be rebuilt from the seed rather than compared against the
table. The overlap costs nothing: 046 is purely additive, both column pairs
coexist happily, and nothing reads the old ones any more.

**What the week buys.** If any path neither of us checked still selects
`panel_date`, it keeps working instead of throwing 42703 on a public page - and
we find out while the columns still exist. Grep found every reader we know of;
this is insurance against the ones grep does not catch (a saved query, a
script, an integration).

**On 2026-08-20**, if nothing has surfaced: run `verify_046.sql` once more,
confirm B is still 0 rows, then run 047. After it, `verify_044.sql` query D can
be deleted - it checks a failure mode that no longer exists.

#### Seminar rooms - confirmed 2026-08-13

Both 2027 seminars are on **Sunday**, so both are in the **Ballroom, 150 seats**
 -  that is what the signup_type seed sets. At 150 the amber flag in
`/admin/panels` does not fire until 120 registrations, so last year's ~50
turnout raises nothing.

**The 50-seat Seminar Room is Friday and Saturday only, and nothing is scheduled
in it.** If a Friday or Saturday seminar is ever added, **its `max_capacity` is
50** - and that is the room where a Bookkeeping-sized turnout (~50) would
actually be tight. Worth knowing before a session is placed there.

Remember `max_capacity` is a planning target throughout: nothing enforces it,
registration never closes, and the roster **undercounts the room** because
walk-ins do not register. That caveat is rendered above the registration list in
`/admin/panels` as well as here.

### Detail

1. `supabase/migrations/045_rename_apply_hub_content_key.sql` - **run it AFTER
   the deploy is live, not before.** Step 0 in its header tells you whether the
   ordering matters at all: `select count(*) from page_content where page_key =
   'home';` - a 0 means no window exists and you can run it whenever. Full
   sequence and rollback are in the migration header.
2. The `/api/admin/import-returning` end-to-end test - procedure in §1a.

## 5. Next, in order

1. **BUILT - `/admin/schedule` CRUD.** Full add/edit/delete/publish-toggle with
   a sponsor picker offering only CONFIRMED sponsorships, and `guardedWrite()`
   on all four write paths. A banner points at `/admin/panels` for seminars so
   nobody creates a duplicate. **Admin-only for now - see item 2.**

2. **`content_editor` CANNOT USE THE CONTENT PAGES. Fifth instance of the
   permissive-baseline pattern, and this one is live.** `panels` now carries
   exactly one policy - `panels: admin all` (`is_admin()`) - because 038 dropped
   `"panels: public read"`, which had been the only thing letting a non-admin
   read the table at all. But `/admin/panels` is in `content_editor`'s allowed
   PATHS and in their sidebar.

   So a `content_editor` navigating to Panels sees an **empty list**, and every
   write is refused. The role split is documented as "navigation-level only",
   which undersells it: for panels it is not a weaker boundary, it is a
   **non-functional page**. `schedule_items` has the identical shape, which is
   why `/admin/schedule` was deliberately left out of their PATHS rather than
   shipped broken.

   Not measured against a live `content_editor` session - reasoned from policy
   state, same evidence class as §1a. **Verify before fixing:** sign in as a
   `content_editor` and open `/admin/panels`.

   **NOT A LAUNCH BLOCKER - IT IS A PREREQUISITE FOR THE INVITE.** No
   `content_editor` account exists, so nobody can reach the broken page today.
   **Tie this fix to creating the first one.** Issuing that account without it
   means the marketing person signs in, opens `/admin/panels`, sees an empty
   list, and every write they attempt is silently refused - they will assume
   they broke something, or that the platform is empty.

   Fix is a small migration adding `has_role('content_editor')` policies to
   `panels` and `schedule_items` - 039 added `has_role()` and nothing has ever
   used it. Then add `/admin/schedule` to their PATHS in the same change.

   **Build it at the moment the account is created, not before**, so it is
   verified against a real `content_editor` session rather than shipped
   reasoned-but-unmeasured for the sixth time.

3. **BUILT - Portal profile self-edit.** Artists and vendors can now edit
   business name, website, Instagram, Facebook, phone and logo from `/portal`.
   Publishes immediately, no queue. Needs migration 048.

   **No new table policy was required.** The directory reads `applications`
   directly (not `exhibitors`), 041 already granted owners UPDATE on their own
   row, and its clamp does not cover any directory-facing field - so the write
   path was already open. `verify_048.sql` E re-checks that, because if any of
   those six columns ever joins the clamp the portal will save "successfully"
   and the value will revert.

   **048 adds two things that WERE missing.** An audit trail (`profile_edits`,
   written by an AFTER UPDATE trigger - after, so it records what was stored
   rather than what was submitted and then clamped), and owner write policies on
   the `exhibitor-media` storage bucket, which had only admin insert/delete.
   That second one also fixes a live latent bug: **the existing sponsor logo
   upload in `/portal` writes to the same bucket and has never worked for a
   non-admin.**

   Admin feed is on the `/admin` dashboard - exhibitor edits by default, staff
   edits behind a toggle, old → new per field. `business_name` is the one to
   watch: it is not only the directory listing, it is how staff find an
   exhibitor on an invoice and a booth assignment.

   Also guarded `saveSponsorProfileFn` while in the file - it had no `.select()`
   and `sponsorships` has no owner UPDATE policy at all, so it was toasting
   success having changed nothing.

4. **BUILT - Admin "link sponsor to user account".** `/admin/sponsorships` now
   has Link account / Linked ✓ per row, backed by `/api/admin/link-sponsor`.
   Needs migration 049.

   **The account must already exist.** The route deliberately does not create
   one - minting a login the sponsor never asked for and cannot access is worse
   than asking them to sign up first, and the account existing is itself proof
   the address is theirs. That is the whole difference from the removed
   self-claim, which matched on email alone with no verification.

   **049's clamp is an ALLOW-LIST, and that is a deliberate divergence from
   041.** 041 enumerates what a non-admin may not change, so every column added
   to `applications` later is owner-editable unless somebody remembers to extend
   the trigger - it fails open, silently. 049 rebuilds NEW from OLD and takes
   only seven keys from the submitted row (contact_name, email, phone, website,
   instagram, facebook, logo_url), so a new column on `sponsorships` is
   protected by default. On a table holding tier, amount, placement flags and
   `amount_locked`, failing closed is the only safe direction.
   `verify_049.sql` C checks the allow-list has not been "fixed" into a
   deny-list.

   **Found while enumerating: the public sponsor insert has the same hole 031
   closed on applications.** `"Anyone can submit sponsor application"` is
   `with check (status = 'pending')` - row-level, so it constrains one column
   and the submission can set every other. That was survivable before; with an
   owner UPDATE policy in place it is not, because a submission setting its own
   `user_id` **self-links past the admin linking step** and grants itself the
   edit rights 049 creates. It could also set `amount_locked`, the flag whose
   entire job is resisting price correction. 049 clamps the insert too. `tier`
   and `amount` are deliberately left alone - they are the request an admin
   confirms, and recomputing price in SQL would duplicate
   `lib/sponsor-tiers.ts`.

   **`verify_049.sql` F is worth running even if you trust the rest**: the
   insert hole was open until 049, so it lists every existing link and every row
   that already carries a placement flag or a lock, to be cross-checked against
   what staff actually did.
5. **Floor plan, read-only. ~2.5 days** now that booth coordinates are
   extractable from the venue PDF. Needs the current-year plan from the Crown
   Complex; the 2024 one has 265 real booths, a mislabelled 165/166, and no 233.
6. **Wall of Honor. 8-9 days.** Largest unscoped item, and its WordPress media is
   a cutover dependency. `scripts/import-wall-of-honor.mjs` is written and tested
   against a representative CSV.

   **It has a slot in the programme: Friday 12:30 PM.** The *Missing Man Table
   Presentation / Fallen Artists Moment of Silence* is the Wall of Honor's
   in-show moment, seeded as a `schedule_items` row with `kind = 'tribute'`.
   That changes the scope: the Wall of Honor is not only ambient signage and a
   web page, it is a scheduled presentation, and whatever is built needs
   something presentable in the room at that time. Treat the copy accordingly -
   same for the **Gold Star VIP Meet & Greet** (Sat 10:00 AM), where Gold Star
   means the families of fallen service members and must not read as a ticket
   tier.
7. **Role split part 2** - column-level protection. Today's split is
   navigation-only: a `content_editor` who knows the API can still read artist
   government photo IDs. Accepted for two trusted colleagues; not for anyone
   external.
8. **Contest results public build** - early 2027; schema already landed.

## 6. Scripts

| | |
|---|---|
| `verify-email-templates.mjs --to <addr>` | proves all nine templates |
| `test-payment-alert.mjs` | payment alert deliverability |
| `verify-sponsor-visibility.mjs` | anon-key RLS surface check |
| `check-event-dates.mjs` | prebuild: config vs DB dates |
| `check-no-date-literals.mjs` | prebuild: no date literals in email templates |
| `import-wall-of-honor.mjs` | Gravity Forms media harvest |

`supabase/verify/verify_0NN.sql` - post-migration checks, read-only.
`supabase/seeds/` - RLS harness records, teardown scripts, held Tattoo Goo SQL.

## 7. Loose ends

- **RLS harness records are live, anon-readable, and must stay that way.**
  Two sponsorships named `ZZ TEST ... RLS Harness`, plus an invoice and an auth
  user. Their visibility to anon is the thing under test: delete them and
  `scripts/verify-sponsor-visibility.mjs:131` does not fail, it goes **vacuous**
  - printing PASS with no pending row left to prove anything about. A test that
  cannot fail is worse than no test.

  They are hidden from visitors at the **presentation layer only**, by
  `src/lib/sponsor-display.ts`, applied at the three public read sites (homepage,
  `/sponsors`, footer). Never hide them with RLS - that would disable the thing
  being verified. This filter could not wait for cutover because `sponsor_name`
  is rendered as an image `alt`, so screen readers announced the row as a real
  sponsor of the convention.

  Full removal is a cutover step and is FK-ordered; see docs/CUTOVER.md section B.

- **Skin Specialists is the first real presentation credit.** They fund all
  three Miss AATC Pinup Contest gift certificates ($200 / $150 / $100). Credited
  in the prizes section of `/events/pinup-contest`, rendered from
  `PINUP_PRIZE_SPONSOR` in `src/lib/event-config.ts`.

  **Not** in `presentation_credits` - that table does not exist yet. When it is
  built, this is its first genuine row, and the hardcoded credit on the pinup
  page should be migrated to read from it rather than left as a second source.

  Prize copy lives in exactly one place, `src/lib/event-config.ts`, and is
  imported by the page. It was previously inline and wrong in two ways at once,
  both live: first place overstated by $300, and all three described as CASH
  when every award is a gift certificate. The wording is the substance of the
  prize - do not shorten '$200 Gift Certificate to Skin Specialists' to '$200'
  on any surface.

  'Convention Feature' is a photo shoot at the show, with the images used in
  AATC promotional material. Confirmed by Ryan, 2026-08-28, and rendered as a
  note on the first place row.

- **OPEN, for Ryan: does the pinup entry flow need a likeness release?** The
  first place Convention Feature prize uses a contestant's image in AATC
  promotional material. Whether that needs explicit consent captured at entry
  is a decision for Ryan, not a code question, and nothing has been built.

  Recorded here because of WHEN it has to be decided rather than whether. If a
  consent checkbox is wanted, it belongs in the same form as `age_confirmed`,
  captured at entry and stored on the row. Added later, it splits the entry list
  into people who agreed and people who were never asked - and the ones never
  asked are the early registrants, who are also the most likely to place.

- **Rate limiting is a Vercel WAF rule and is NOT in this repository.** Read
  the code alone and both anonymous public write paths look unprotected,
  because at the application level they are. That is by design, not an
  oversight.

  **EXACTLY TWO active rules**, both scoped to POST:

  | path | method | rule | where |
  |---|---|---|---|
  | `/api/pinup-entry` | POST | 5 req / 60s per IP, Deny 403 | Vercel dashboard |
  | `/api/panel-register` | POST | 5 req / 60s per IP, Deny 403 | Vercel dashboard |

  **Two DISABLED duplicates also exist in the dashboard - delete them, do not
  leave them disabled.** They cover the same two endpoints without POST in the
  description. A disabled rule reads as coverage to anyone scanning the list,
  so the next person adjusting a threshold may edit a rule that does nothing and
  conclude the change had no effect - or re-enable one and end up with two rules
  counting the same requests against different windows. Four rules for two
  endpoints is how that starts.

  Project -> Firewall -> Custom Rules, Pro plan or above. Chosen over an
  application throttle because it runs at the edge before a function is
  invoked, needs no dependency, no table and no migration, and cannot drift out
  of sync with the code it protects.

  Two consequences worth holding on to:

  1. **It is invisible to every check in this repo.** No test, no build guard
     and no verify script can observe it. Deleting the rules breaks nothing and
     reports nothing.
  2. **It does not survive recreating the Vercel project.** It is not in
     `vercel.json` and is not restored by a redeploy or a re-import. See
     docs/CUTOVER.md section B2.

  `src/lib/bot-trap.ts` is a complement, not a substitute: a honeypot field and
  a minimum fill time, both client-supplied and both forgeable. It filters
  generic form spam, which fills every input and posts instantly. The WAF is
  what stops anything written for this site specifically.

  The honeypot is rendered by `src/components/HoneypotField.tsx` off-screen
  rather than with `display:none`, with `aria-hidden` on the wrapper and
  `tabIndex={-1}` on the input, so nobody using a screen reader or a keyboard
  can land in it - the penalty for touching it is a silently rejected
  submission, which is not a thing to leave reachable. `autoComplete="off"`
  stops a saved-address feature filling it in and locking a real person out.

- **CONFIRMED: both "10th" claims are correct. Do not strip them.**

  | claim | where |
  |---|---|
  | 10th annual Miss All American Pin-Up Contest | `content/registry.ts:67`, `:211` |
  | 10th Annual All American Tattoo Convention | `lib/aatc-template.ts:60` |

  Source: Ryan, direct confirmation 2026-08-31. Recorded because the ordinal is
  exactly the shape of unverified factual claim this project has removed
  elsewhere - fabricated venues, invented DJ names, a $500 prize that was
  actually a $200 gift certificate - so a future audit will flag it again.
  It has been checked. Leave it.

- **RULE: when adding a consent, rule, fee or restriction, grep for absolute
  statements the change makes untrue.** A blanket claim can become false through
  a change made on a different page, and nothing will flag it - it was true when
  written, still compiles, and still reads fluently.

  Search visitor-facing copy for: `never`, `always`, `all`, `only`, `every`,
  `free`, `anyone`, `nothing`, `public`. Most hits are the brand name and are
  noise; the ones that matter are promises about what is required, who can do
  something, and what it costs.

  Two live examples, both found this way rather than by anyone noticing:

  1. `/info/policies` said marketing consent is "never required - you can enter a
     contest, or vote, without opting in". True when written. Migration 055 added
     a REQUIRED likeness release on the pinup form, and the sentence silently
     became a description of all consent on the site that was no longer accurate.
  2. `/contests` and the `contests` CMS default both promised "30 days of PUBLIC
     voting". True when written. Migration 053 tied a vote to `auth.uid()`, so
     voting now needs an account - and the copy still told visitors it did not.
     Corrected to say voting is free but needs an account, matching the sign-in
     prompt the board already renders.

  The second is the sharper one: the code change was correct, the copy change was
  simply never made, and no test can catch a sentence that has quietly stopped
  being true.

- **The likeness release IS a condition of entry. That is a deliberate
  exception.** The pinup form carries three consents and they are not equivalent:

  | consent | required? | why |
  |---|---|---|
  | `age_confirmed` | yes | contestants must be 18+ |
  | `likeness_release` | **yes** | the first place prize is a photo shoot |
  | `marketing_opt_in` | **no** | never a condition of anything |

  Confirmed by Ryan, 2026-08-31. The reasoning for making the release mandatory
  rather than optional-with-a-contingent-prize: judging happens on the day, and a
  contest whose top prize cannot be awarded to some entrants forces you either to
  check consent before judging or to re-award afterwards. Both are worse than
  asking up front. It over-collects in one sense - 24 of 25 entrants consent to
  something only the winner uses - which is why the wording states the tie to the
  prize on its face instead of reading as boilerplate.

  Enforced in THREE places so the route is not the only thing standing between a
  POST and a stored entry: the check constraint, the anon insert policy
  (`with check (... and likeness_release = true)`), and `register_pinup_entry`
  itself.

  `/info/policies` distinguishes the two explicitly. Without that the page's
  "marketing is opt-in and never required" section would read as covering all
  consent on the site, which is no longer true.

- **RULE: never edit a migration someone is partway through applying.** Add a
  new one instead. A migration edited mid-run yields a database matching neither
  version of the file, and nothing in the run looks wrong - the editor reports
  success for whatever text was pasted. 058 exists for exactly this: the
  after-party night slugs belonged logically in 056, but Ryan was applying 056
  at the time. Migrations are cheap; a database in an unrecorded state is not.

- **RULE: confirm the new source matches the old BEFORE deleting the old.** When
  moving hardcoded content into a table, the table does not exist until the
  migration is applied, and a deploy usually lands first. Deleting the hardcoded
  copy in the same change means the section goes dark in between.
  `TeamSection` takes a temporary `fallback` prop carrying the same two people,
  used only while 059 is unapplied; it and `TEAM_FALLBACK` in
  `src/app/info/about/page.tsx` are deleted once the rendered output is
  confirmed to match. Same discipline the VIP price and Collector's Choice
  consolidations used.

- **DEFERRED DECISION: payments ledger. Not rejected - deferred, with a trigger
  condition.**

  `amount_paid` is a mutated running total, so a manual payment has no
  representation as an EVENT and a mis-recorded one is undetectable after the
  fact (see `reconcile_approved_without_invoice.sql` block H, and the entry
  below).

  Acceptable while payment is Stripe-dominant, which 2027 is. Block H plus the
  Stripe reconciliation is proportionate; an append-only ledger is real schema
  work on a live billing path for a small share of revenue.

  **REVISIT BEFORE ON-SITE PRE-REGISTRATION for the following year.** Ryan takes
  next year's bookings at a table during the show on Sunday, normally 20-25% of
  them as cash and card. That did not happen in 2026 - an artist issue ran past
  close - which is why the exposure has not been felt yet. Those are exactly the
  conditions `recordPayment` fails worst under: cash in hand, a queue, one
  operator, and no external record to reconcile against afterwards.

  Shape if it is built: append-only payment ATTEMPTS - method, amount, operator,
  timestamp, outcome - with `amount_paid` DERIVED rather than mutated. That is a
  schema change to a live billing path and wants a plan before a migration.

  Decision recorded 2026-08-31. Do not rebuild the reasoning from scratch; if
  the answer changes, it should change because the cash share did.

- **There is NO payments table, and a mis-recorded manual payment is therefore
  UNDETECTABLE after the fact.** `invoices.amount_paid` is a running total
  mutated in place by `/admin/invoices`. A payment is not an event that gets
  recorded; it is an increment that gets applied.

  So if `recordPayment` ever silently affected zero rows, `amount_paid` was
  never incremented and NOTHING anywhere says a payment was attempted - no row,
  no log, no column. `reconcile_approved_without_invoice.sql` block H finds
  invoices that contradict THEMSELVES (marked paid but underpaid, paid_at with a
  non-paid status, overpaid); it cannot find an invoice that is simply, quietly,
  short. The only record of that payment is the cash in the box and what the
  exhibitor remembers.

  Stripe payments are the exception: they carry `stripe_payment_intent_id` and
  can be reconciled against the Stripe dashboard. Cash and card-at-the-booth
  cannot. If that gap ever needs closing, it is a payments/ledger table - an
  append-only record of attempts, not a mutated total - and it should be costed
  against how much cash actually changes hands at the booth.

- **RULE: a pattern applied correctly once in a file does not extend to the next
  branch. "This file already handles it" is not evidence about the branch you
  have not read.**

  `src/app/api/webhooks/stripe/route.ts` was held up throughout the guard sweep
  as the model - `.select()`, an explicit zero-row branch, and a 500 so Stripe
  retries. It is the model, in ONE of its two branches. Ten lines below the
  invoice branch, the `panel_registrations` branch checked only `error`: Stripe
  takes the money, the update matches no row, nothing errors, and the log says
  'marked as paid'. Same file, same function, same author, same session.

  It was found by a mechanical final sweep, not by reading the file - and the
  file had been read several times by then, each time confirming the pattern was
  present. Confirming a pattern EXISTS in a file is not the same as confirming
  it is applied everywhere in that file.

- **COUNTERWEIGHT, and it belongs with the rule above: a rule applied
  mechanically produces its own bugs.** The clear-previous-assignment update in
  `/admin/booths/[id]` is checked for an error but deliberately NOT for zero
  rows, because zero rows is the NORMAL case - an exhibitor with no prior
  assignment has nothing to clear. A row-count check there would fail every
  first assignment.

  It is recorded as deliberate precisely so the next person applying the
  guard-everything rule does not "fix" it. The rule is right almost everywhere;
  knowing where it is wrong is part of the rule.

- **Owed-and-unrendered, and sold-and-unrendered, are the same defect from
  opposite directions. Neither surfaces as an error.**

  | | what happened | how it looked |
  |---|---|---|
  | owed, unrendered | Whole Life Aftercare presented the Tattoo Battle and the credit appeared on one of four pages naming it | nothing wrong; the docs recorded the obligation and no page contradicted it |
  | sold, unrendered | a sponsorship placement toggle silently affected zero rows, then `requestRevalidate` purged the cache and re-served the page WITHOUT the sponsor | the toggle showed ON, and the purge actively confirmed the wrong state |

  Both are a sponsor paying for something a visitor never sees. Neither throws,
  neither logs, and neither appears in any queue. The first is caught by reading
  the commitments and diffing against rendered HTML; the second by guarding the
  write. They need different checks, which is why finding one says nothing about
  the other.

- **THE MODEL for a money-path write: `src/app/api/webhooks/stripe/route.ts`.**
  It was the only site in the entire guard sweep that needed no change, and it
  is worth copying rather than merely noticing. Three parts:

  1. `.select()` on the write, so there are rows to count.
  2. An EXPLICIT zero-row branch, separate from the error branch.
  3. **A failure mode that is loud in the direction that matters.** It returns
     500 rather than 200, because Stripe retries on non-2xx - so a transient
     cause self-heals and a permanent one keeps alerting instead of vanishing
     into one silent success.

  Point 3 is the part that does not generalise mechanically and has to be
  thought about per site. For Stripe the loud direction is a retry. For an
  operator recording cash at the booth it is the opposite: `recordPayment` must
  REFUSE to show 'paid in full', because the natural next action after a payment
  error is to take the payment again, and the person has already handed the
  money over.

  The difference between that file and everything around it is not technique.
  Somebody reasoned about what a silent success would COST on that specific
  path, and wrote the failure mode to match.

- **RULE: where a silent failure has a financial consequence, a guard on the
  write is necessary but not sufficient. There must also be a way to find the
  bad state after the fact.** The guard prevents; a reconciliation query
  detects. Neither alone would have surfaced an unbilled exhibitor.

  The unguarded invoice insert on the approve path is the case that produced
  this: an application could reach `approved` with no invoice, appear in no
  queue, and simply never be billed, at $500 to $1,200 a booth. Guarding the
  write stops it happening again; it does nothing about rows already in that
  state, and nothing at all if a future edit reintroduces the gap.

  `supabase/verify/reconcile_approved_without_invoice.sql` is the detector.
  Where a guard protects money, ask what query would find the damage, and write
  it at the same time.

- **RULE: 'anon cannot see it' has TWO failure modes, and a test must accept
  either.** Assert the OUTCOME, not the mechanism.

  | table state | what anon gets |
  |---|---|
  | grant exists, RLS filters | zero rows |
  | grant revoked | **42501 insufficient_privilege - it THROWS** |

  Every anon test written before `exclusivity_grants` ran against a table where
  the grant existed, so `select count(*)` returned 0 and a plain comparison
  worked. 062 is the first table in the project with NO anon grant at all, and
  the same test threw instead - the isolation working correctly, reported as a
  harness failure.

  Wrap the read, catch `insufficient_privilege` BY NAME (never `when others`,
  which swallows unrelated failures and prints PASS), and pass on either
  outcome. Asserting the specific error would fail the test if someone later
  added a harmless grant while leaving RLS correct - a pass that should stay a
  pass.

  **Tables currently revoked from anon**, where a naive anon test will throw:
  `sponsorships`, `exhibitors`, `food_trucks`, `panels` (038), `schedule_items`
  (044), `presentation_credits`, `presentation_credit_items` (060),
  `exclusivity_grants` (062).

  **And when this block errors, Postgres hints
  `GRANT SELECT ... TO anon`. DO NOT RUN IT.** It resolves the error by handing
  anon the table, which is the precise thing the migration exists to prevent.
  The hint is printed by the database on every run and it is the exact wrong
  action; verify_062 carries that warning inline for the same reason.

- **RULE: test the boundary ITSELF, not a point safely either side of it.** A
  case placed comfortably inside or outside a limit passes under any nearby
  comparison and proves nothing about which one is in use.

  `verify_061`'s after-close case sets the closing bound to exactly `now()`.
  `<=` accepts that and `<` refuses it, so the test distinguishes them. The
  first version put the bound a second in the past, which passes either way -
  it would have reported a pass against the comparison it was written to catch.

  Same principle as swapping `sort_order` in the database to tell whether the
  About page was reading `team_members` or `TEAM_FALLBACK`: when two possible
  behaviours produce identical output, you have to construct the input that
  makes them differ.

- **Exclusivity categories are a CONTROLLED LIST, and adding one is a code
  change in TWO places.** `EXCLUSIVITY_CATEGORIES` in `src/lib/exclusivity.ts`
  and the `check (category in (...))` constraint in migration 062 must agree.
  Add to one only, and either the admin offers a category the database refuses,
  or the database allows one the admin never shows.

  The duplication is deliberate. The guarantee is a unique index on
  `(event_id, category)`, and an index cannot tell that `tattoo_battle` and
  `Tattoo Battle` are the same exclusive - free text would make the check
  unenforceable. If Ryan sells a new exclusive in 2028: add it to the constant,
  add it to the constraint in a new migration, and the admin picks it up.

  Current list: `on_site_supplier`, `accounting_presentation`, `tattoo_battle`.

- **RULE: a date pair written a year ahead needs BOTH offsets checked
  independently, especially if it spans March or November.** US DST changes on
  the second Sunday in March and the first Sunday in November. A window whose
  two ends fall either side of a changeover has two different UTC offsets, and
  writing one offset for both is wrong in a way nothing flags: the value parses,
  the constraint passes, the verify passes, and the boundary is an hour out.

  The 2027 voting window is `2027-04-21T12:00:00-04:00` to
  `2027-05-22T00:00:00-04:00`. Both fall inside DST 2027 (14 March to 7
  November), so `-04:00` is correct for each - CHECKED, not assumed, because the
  cost of being wrong is silent and the cost of checking is one calculation.

  Dates written far ahead are exactly where this bites: nobody is holding a
  calendar for April 2027 in their head, and the error surfaces on the day.
  `FINAL_DUE_AT` in event-config.ts already takes the safer route of storing UTC
  with the local time in a comment; either convention works, provided the offset
  is derived rather than copied from a neighbouring value.

- **RULE: encode for robustness over literalness at a boundary.** The voting
  window closes at end of day 21 May, stored as `2027-05-22T00:00:00-04:00` and
  compared with `<`. The literal reading - `23:59:59` with `<=` - was rejected
  because it depends on the comparison staying `<=`, and one edit to `<` would
  silently drop the final second with nothing to catch it. The comment carries
  the literal intent so the midnight value does not read as an off-by-one.

  The verify makes the distinction real: it sets the bound to exactly `now()`,
  which `<=` would accept and `<` refuses. A bound in the past passes either way
  and proves nothing about which comparison is in use.

- **RULE: a claim about what a page RENDERS must check both code and data.**
  Rendered HTML on the deployment is the authority; a source grep is a hint.

  I reported the Tattoo Battle credit as appearing on no page, having grepped
  `src/` and found nothing. It was rendering on `/events/schedule` the whole
  time, from `schedule_items.presented_by_fallback` - data, not code. Nomadica
  is the same, rendering on the homepage from `panels.presented_by_fallback`.

  This is the absence rule again, one layer over: **an absence found by one
  method is not an absence.** It will recur and get worse as the section 16 work
  moves content out of source files and into tables - page_content,
  page_images, page_galleries, team_members, schedule_items and panels all now
  render text or images that no source grep will ever find.

  Practically: `curl` the deployed page and grep THAT. It is the only check that
  sees both layers at once, and it is what caught every rendered-output claim in
  this session that turned out to be right.

- **RULE: rollback direction follows which failure is VISIBLE.** When a write
  spans a file and a row, the order and the rollback are not a style choice -
  pick whichever failure a visitor can see, and make that one impossible.

  | operation | order | why |
  |---|---|---|
  | upload | file, then row - **remove the file if the row fails** | an unreferenced file is invisible; a row pointing at nothing is a broken image |
  | remove | row, then file | a blocked row delete leaves the image showing, which is harmless; the reverse leaves a live row pointing at a deleted file |

  Both are in `/admin/page-images` and `/admin/galleries`. The same reasoning
  already applied to the contest entry delete, which removed the storage photo
  BEFORE the row and so left a competition record pointing at a dead image when
  the delete was silently blocked.

- **RULE: make the invalid state unreachable, not merely detectable.** Alt text
  is validated BEFORE the upload in both image admins, not after. 050 has a
  check constraint that rejects an image with blank alt, so uploading first
  would put a file in the bucket and then fail the row write - an orphan that
  looks like a successful upload to whoever browses the bucket later. The
  constraint is the backstop; the ordering is the fix.

  `page_galleries.alt` is NOT NULL outright rather than conditionally, because
  a gallery row IS an image - there is no state in which its alt text is
  legitimately absent. `page_images.alt` has to stay conditional because a slot
  can exist before its image does.

- **RULE: a residue check and a cleanup are different jobs and must not share a
  block.** A final block that deletes fixtures AND reports what is left destroys
  the evidence that the owning block failed to clean up - it always reports
  clean, because it just made itself clean. Cleanup belongs to the last block
  that needs the fixture; the last block in the file only LOOKS. `verify_054`
  block Z is the pattern: four counts, no deletes.

- **RULE: a test fixture supplies every required column itself; it does not rely
  on a trigger to fill them in.** `verify_054` created an `auth.users` row and
  then inserted a `profiles` row with only `(id, role)`, depending on
  `on_auth_user_created` to have already created the profile so that
  `ON CONFLICT` would take the update branch. The trigger did not fire, the
  insert branch ran with a null `email` - which is NOT NULL - and the file
  aborted before a single assertion executed. Migration 054 was fine; it was
  simply untested.

  Write fixtures so they work whether or not the trigger runs, and have the
  conflict branch set the same columns as the insert, so both paths converge on
  one fully-populated row instead of one of them leaving a half-populated one.

- **RULE: when a fix produces a new failure downstream, check whether that code
  had ever run before assuming the fix broke it.** Two bugs can stack, the first
  masking the second, and the repair then presents as a regression it did not
  cause.

  Concretely: `verify_052` block D had a snapshot defect that aborted the whole
  file. Block G had a separate defect - it set capacity to 1 while inheriting two
  rows that blocks D and E leave behind, so it asserted 'confirmed at position 1'
  against a count of 2. Because D aborted first, and the whole file is one
  transaction, **block G had never executed once**. Fixing D did not break G; it
  revealed G.

  The tell is that the "new" failure is in code with no history of passing. Check
  that before treating it as a regression - the alternative is reverting a
  correct fix to restore a state where the second bug was merely invisible.

- **RULE: cleanup belongs with the LAST BLOCK THAT NEEDS the fixture, not with
  whichever block happens to run next.** In `verify_052`, blocks D and E created
  rows and the delete lived at the end of block G. That made G's correctness
  depend on undeclared ordering, and G is the block whose assertion the rows
  broke.

  A block that has a precondition must ESTABLISH it, not inherit it - and then
  ASSERT it, because ensuring only covers the fixtures you know about. A real
  row would produce the same off-by-N against a script that looks correct.
  `verify_051` block F was hardened the same way even though it passes: a pass
  that depends on undeclared block ordering is luck, not a guarantee.

- **A speculative error message is evidence of an unguarded write.** The
  page_content save handler read `toast.error('Save failed - are you an admin?')`.
  Nobody writes that by accident: someone hit the failure, diagnosed the cause
  correctly, and shipped a GUESS in place of a check. The write had no
  `.select()`, so there was nothing to check with - it reported a save that
  never happened, then purged the cache and re-served the old copy as the new
  one. An editor would have saved twice and concluded the CMS was broken.

  When hunting the remaining unguarded writes, grep for error strings that
  speculate about the cause rather than report it: `are you`, `you may not`,
  `permission`, `try again`, `?'` inside a toast. Each one marks a place
  somebody already met this failure and could not detect it.

- **Admin write-guard inventory. 33 calls remain unguarded, all money/identity.**
  A Supabase write that RLS filters out returns `error: null` and zero rows.
  Checking only `error` therefore reports success for a write that never
  happened. `guardedWrite()` (src/lib/db-write.ts) treats zero-rows-no-error as
  a failure, and it requires a `.select()` on the query or there are no rows to
  count.

  **Paths scanned:** `src/app/admin/**`, `src/app/api/admin/**`,
  `src/app/api/webhooks/**`, `src/components/admin/**`. Recorded because the
  first pass omitted `webhooks` and therefore reported `invoices` as 10 sites
  when it is 12. An inventory that under-reports leaves sites unguarded with
  nobody looking for them, so the scope of the count belongs beside the count.

  59 write calls at first scan, 61 including the two in `webhooks`:

  **COMPLETE as of 2026-08-31. 76 write calls, 76 guarded, 0 outstanding.**

  | | count |
  |---|---|
  | total admin write calls | 76 |
  | guarded, or checking returned rows | **76** |
  | unguarded | **0** |

  ONE DELIBERATE EXCEPTION, and it is not a gap: the booth-clearing update in
  `/admin/booths/[id]` is checked for an ERROR but not for zero rows, because
  zero rows is the NORMAL case there - an exhibitor with no prior assignment has
  nothing to clear. Guarding it on row count would fail every first assignment.
  A row-count check is right almost everywhere and wrong here, so it is written
  down rather than left looking like an oversight.

  `invoices` turned out to be 12 sites, not the 10 first counted - the original
  scan covered `src/app/admin` and `src/app/api/admin` and missed
  `src/app/api/webhooks/stripe`. That one needed no change: it already checks
  for zero rows explicitly and returns 500 so Stripe RETRIES, with a comment
  explaining why. It is the model the rest of the codebase should have followed
  and did not. These stay admin-only under the RLS
  widening, so a role mismatch is unlikely to trigger them - but a wrong `.eq()`
  or an already-deleted row produces the identical silent success today, on the
  tables where it costs the most.

  A note on counting them: an insert using `.select(...).single()` IS guarded,
  because `.single()` errors on zero rows. Several inserts read as gaps to a
  naive scan because the `.single()` sits twenty lines below the `.from()` call.
  Check the whole statement before treating one as unprotected.

  Tracked here rather than remembered. Fixing RLS without fixing this pattern
  leaves the same class of bug waiting for the next mismatch.

- **Audit fixture inserts:** `python3 scripts/check-sql-fixtures.py`

  Flags any `insert into` in a verify script that omits a column the table
  requires (NOT NULL, no default). Written after `verify_054` aborted before a
  single assertion ran because its fixture left out `profiles.email`.

  It builds the schema by walking the migrations IN ORDER and applying
  `create table`, `add column`, `drop column` and `set not null` - not from
  `create table` alone. The first version did the latter and reported
  `contest_votes.voter_token` missing from five inserts in verify_053; migration
  053 drops that column, so it was noise. An extractor that ignores later ALTERs
  emits that forever and costs somebody an investigation each time to rediscover
  it is nothing.

  It also knows the difference between two kinds of trigger, which is the whole
  point rather than a detail:

  - **BEFORE INSERT on the same table** always runs, so omitting the column is
    correct. `contest_votes.vote_date` is set by `set_vote_date()` this way, and
    naming it in an INSERT would be wrong since the trigger overwrites it.
    Excused.
  - **AFTER INSERT on a different table** is a cross-table side effect that may
    not fire. `profiles.email` was left to `on_auth_user_created`, a trigger on
    `auth.users`. NOT excused - that is the bug this exists to catch.

  Mutation-tested: re-introducing the `profiles` omission is caught, and the
  legitimate `vote_date` omission stays clean.

- **Parse-check SQL without applying it.** `pip3 install pglast`, then:

      python3 -c "import pglast,sys; pglast.parse_sql(open(sys.argv[1]).read())" FILE.sql

  Real libpg_query bindings, so it is PostgreSQL's own parser. Catches the class
  that costs a round trip in the SQL editor - unterminated dollar quotes,
  reserved words as identifiers, unbalanced parens - without touching a
  database. All 75 files under supabase/ currently parse.

  Deliberately NOT wired into `prebuild`: the Vercel build image has no Python,
  so it would break deploys to catch a class of error that only ever reaches a
  human running a script by hand.

  Note what it does NOT cover: the plpgsql body of a DO block or a function is a
  string to the SQL parser, so errors inside one - an ambiguous column, a bad
  variable reference - parse clean. Only calling it finds those.

- **SQL Editor pre-flight warnings are parsed WITHOUT plpgsql context.** The
  analyzer reads a script as plain SQL, so constructs that are local to a DO
  block can present as DDL. `select id into v_event from ...` is a variable
  assignment inside plpgsql; outside it, `SELECT ... INTO name` is
  `CREATE TABLE name AS`. The editor duly warned that verify_051 "creates a
  table without enabling Row Level Security" and named `v_event` - a DECLARE
  variable, in a file that creates no table at all.

  Renaming the variable would not have helped: the trigger is the INTO syntax,
  not the identifier, so any name is misread identically. The verify scripts now
  assign with `v := (select ...)` and use `FOR r IN ... LOOP` for records, with
  a style note in each file. Do not convert them back.

  **The reason this was worth fixing rather than dismissing:** a warning that
  fires spuriously on every run trains the operator to click through warnings.
  That habit costs more than the rewrite, because the same dialog also carries
  a TRUE warning. "This query includes destructive operations" is accurate for
  every verify script here - verify_051 alone has nine DELETEs and one UPDATE.
  They are fixture cleanup, every one filtered to the `zz-` prefix, and each
  block removes its own rows. That warning should be read and recognised, which
  it will not be if the dialog has already been taught to mean nothing.

  Never accept "Run and enable RLS" on one of these. It appends an ALTER TABLE
  the script never contained, against a target chosen by the same misparse that
  invented the table.

- **DO NOT RE-RUN migration 051. It would break the live intake path.**
  051 contains `create or replace function register_pinup_entry(...)` with
  EIGHT arguments. 052 drops that signature and creates a NINE argument version
  carrying `p_marketing_opt_in`. Both are applied, and the live function is
  correctly the nine argument one - verified against the deployed PostgREST
  schema.

  Re-running 051 now would recreate the eight argument overload ALONGSIDE the
  nine argument one. Postgres allows that; the damage shows up at call time,
  because the route calls the function with NAMED arguments and a named call
  can match either overload. That raises an ambiguity error on the pinup intake
  path, in front of a contestant, and nothing about the migration run would look
  wrong.

  `verify_052` block C exists for exactly this: it asserts that only ONE
  `register_pinup_entry` survives. If a future migration needs to change that
  function again, it must drop the previous signature explicitly rather than
  relying on `create or replace`, which only replaces an identical signature.

- **RULE: in plpgsql, RETURNS TABLE column names become OUT variables.** Any
  bare reference to one inside the function body is ambiguous between the
  variable and the column of the same name. plpgsql's default
  `variable_conflict` is `error`, so it does NOT fail at `CREATE FUNCTION` - it
  raises `column reference "x" is ambiguous` at CALL time.

  Qualify every column reference in a function whose RETURNS TABLE shares a name
  with a column it touches. `register_pinup_entry` returns `(id, status,
  queue_position)` and reads `pinup_entries.status`; the unqualified version
  created cleanly and would have thrown a 500 for the first contestant to
  submit, on a contest capped at 25 where the earliest entries matter most.

  **Applying the migration cannot catch this.** Nor can inspecting `pg_proc`, nor
  checking the returned column names - all three report a healthy function. Only
  calling it does.

- **RULE: a verify block must CALL a function, not just describe it.** The two
  defects in `register_pinup_entry` failed at different moments and only one was
  loud:

  | defect | caught at | announces itself |
  |---|---|---|
  | `position` as a RETURNS TABLE column | CREATE FUNCTION (parse) | yes, 42601 |
  | bare `status` shadowed by the OUT variable | first CALL | no |

  So every function a migration creates or replaces needs a verify block that
  invokes it and reads back EVERY returned column, including the ones nothing
  consumes yet. `queue_position` is returned by `register_pinup_entry` and used
  by nothing - a hardcoded 1 or a null would have satisfied every other
  assertion in `verify_051`, which is why block F2 registers twice and asserts
  the value ADVANCES rather than merely existing.

  Note also that a `create or replace` in a later migration is a SEPARATE
  definition and needs its own verify. 052 rewrites `register_pinup_entry`
  wholesale, so `verify_052` re-asserts the capacity branch and the returned
  shape rather than trusting `verify_051`, which tested a different function
  body. Both copies carried both defects until they were fixed in both places.

- **RULE: a negative assertion needs a positive control.** Any check that
  something is absent, blocked, invisible, or rejected must be paired with a
  check proving the query could have found something in the first place.
  Without the control, the assertion passes when the mechanism it tests is
  broken, when the data is missing, and when the query is simply wrong - and it
  prints PASS in all three cases.

  This is not a style preference. It happened three times in one session, in
  three unrelated places, and every instance was silent:

  1. `verify_050.sql` block G asserted anon cannot read a deactivated row, using
     `set local role anon` as a bare statement. SET LOCAL outside a transaction
     is a no-op, so the check ran as `postgres` - the table owner, which
     bypasses RLS entirely. It would have reported PASS while testing nothing.
     Fixed by moving it into a DO block and adding an active-row control.
  2. `scripts/verify-sponsor-visibility.mjs:131` asserts anon cannot see pending
     sponsorships. Delete the harness rows and it does not fail - it goes
     vacuous, with no pending row left for anon to be blocked from seeing. This
     is why the harness rows are kept; see the entry above.
  3. The dash sweep rewrote the harness LIKE literals in `supabase/seeds/` and
     took every teardown match from two to zero. Both teardowns then aborted
     their preflight, and the teardown block deleted nothing while reporting
     success. Fails closed, announces nothing.

  4. `verify_051` block G counted advisory locks without filtering
     `pg_backend_pid()`. The whole file runs in one transaction and blocks F, F2
     and H all call `register_pinup_entry()`, whose `pg_advisory_xact_lock`
     holds until that transaction ends - so the block found the lock ITS OWN
     session was holding and reported it as a concurrent registration.

     **This one was read and believed.** It printed the strong PASS on a real
     run, a person read it, and moved on to the next script. The other three
     were caught by inspection before anyone relied on them; this is what the
     shape does when it is not caught. Fixed by adding
     `and pid <> pg_backend_pid()`.

  5. **A log that only fires on error cannot report a silent success.** The
     `import-returning` rollback deleted an application after a failed invoice
     insert and logged only when `error` was non-null. Its own comment says the
     surviving row is 'approved with no invoice and IS A SWEEP TARGET' - so the
     warning about that state could not fire in the case that creates it, since
     a zero-row delete returns no error. Guarded on row count in 723aa82.

  The shape is always the same: the check looks for an absence and an absence is
  what a broken check produces too. A check that observes a RESOURCE has the
  same failure - it finds the one it created itself. And a check that only runs
  on the error path cannot see the failure that produces no error.

- **Silent success is the default failure mode of an RLS write, not an edge
  case.** Measured on the live `page_images` table, not reasoned about: an anon
  `PATCH` to a row it has no policy for returns **HTTP 204**, and the row is
  unchanged. There is no 403 and no error body. PostgREST reports success
  because the UPDATE succeeded - against zero rows, since the policy's USING
  clause filtered the row out before the update applied.

  INSERT behaves differently: the WITH CHECK clause rejects the row outright and
  raises 42501. So the two halves of "can this role write?" fail in different
  shapes, and only one of them is loud.

  This is the exact case `guardedWrite()` (src/lib/db-write.ts) exists to catch,
  and why it treats `0 rows affected, no error` as a failure rather than a
  no-op. Any new write path that does not go through it needs its own row-count
  check. Any verify block asserting a write is blocked must assert on the row
  count, not wait for an exception that never arrives.

- **OPEN: `content_editor` write access on the section 16 content tables.**
  Migration 039 added a `content_editor` role. `page_images` (migration 050) is
  editorial content but is scoped to admin only, as specified. There are eight
  section 16 tables coming; the decision should be made once and applied to all
  of them rather than per migration. Widening is one line per table:
  `has_role(array['admin','content_editor'])` in place of `is_admin()`.
  Held deliberately - quietly granting write access is not a decision a
  migration should make on its own.

- **The pinup entry form does not submit anywhere.**
  `src/app/events/pinup-contest/PinupContestClient.tsx` `handleSubmit()` is a
  stub: it waits 800ms and sets `submitted`. There is no API route, no Supabase
  write, no table, no try/catch and no error state. The entrant is then shown
  **"You're Registered! We'll see you backstage at 6:30 PM on Saturday."**

  So a real person can fill in name, email, phone and address, be told they are
  registered for a contest with a $500 first prize, and have nothing recorded
  anywhere. Predates the server-shell refactor - it arrived in `2cd1448` - and
  the refactor did not change it, but it is a live intake path on a public page
  and should either be wired up or the form removed. Contrast with
  `/apply/artist` and `/apply/sponsor`, which write through `guardedWrite()`.

  HTML validation is present (`required` on name/email/phone, `type=email`,
  `type=tel`), so the browser blocks empty submits. Nothing else is validated
  and no failure is possible, because there is no request to fail.

- **Dashes: the real exclusion category is data, not syntax.** The repo-wide em
  dash sweep excluded regexes, URLs and import paths - all of them syntactic.
  That list was wrong. The category that actually matters is **any string
  literal compared against stored data**: SQL `LIKE` patterns and `WHERE`
  clauses, fixture strings, enum values matched to rows. They read as prose,
  which is exactly why they slip through.

  This is not hypothetical. The sweep rewrote the harness `LIKE` patterns in
  `supabase/seeds/` from an em dash to a hyphen while the rows still stored an
  em dash, taking every teardown match from two to zero. Both teardown scripts
  would have aborted their preflight and the harness would have been
  unremovable - and the teardown block would have deleted nothing while
  reporting success. It failed closed, so nothing was destroyed, but nothing
  announced it either.

  Guarding: `scripts/check-no-em-dashes.mjs` covers **`src/` only**. It does two
  opposite things - it fails on any dash in `src/`, and it fails if the harness
  literals in `supabase/seeds/` have **lost** theirs. The second half exists
  because a dash-presence guard cannot catch a dash being removed: after the
  sweep there is no dash left to find. `supabase/migrations/` is not guarded and
  must never be edited; the rest of `supabase/` is swept by hand.
- **Tattoo Goo** is `status='pending'` - an unanswered Gold offer at $3,000, hold
  expiring 2026-08-28. Accept path is held, commented, in
  `supabase/seeds/tattoo_goo_offer.sql`.
- **Two invoices exist, and this note used to describe the wrong ones.** It
  previously said $160 each against deleted food trucks (Jazz N Soul, Tacos
  Snacks). Those are gone. As of 2026-08-31 the two live invoices are:

  | amount | attached to | what it is |
  |---|---|---|
  | $3,000 | sponsorship `32ef207d` | Tattoo Goo, the unanswered Gold offer |
  | $500 | sponsorship `8a7cd934` | the ZZ TEST RLS harness pending row |

  Neither is an orphan - both carry a `sponsorship_id`. The harness one goes
  with the harness at cutover, FK-ordered. Verified by query, not by reading
  this note, which is why the note was wrong.
- **Storage still holds test uploads.** Delete `contest-photos`,
  `food-truck-logos`, `panel-images`, and the user-id folders in
  `application-docs` and `exhibitor-media`. Keep `exhibitor-media/sponsors/`
  (Tattoo Goo's logo), `aatc-graphics`, and `site-assets`.
- **PITR is off** - daily snapshots only, so restore granularity is one day.
- Two requests late in the session - a consent/pixel audit and an SEO schema -
  belong to other repositories. Neither has anything in this one: no pixels, no
  consent layer, no `/privacy-policy`.

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
