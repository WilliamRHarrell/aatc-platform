# Migration and seed status

_The one home for whether a migration or seed is applied. Moved from docs/HANDOFF.md (develop b5a1d3f) on 2026-09-26._

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
| 066-068 | present on develop before 2026-09-23 | `sponsorship_is_custom`, `placement_check_runs`, `payment_method_square`. Not re-audited in the 2026-09-23 sessions; their tables/columns are read by live code. |
| **069** | **APPLIED + VERIFIED** 2026-09-23 | Tattoo Battle: `tattoo_battle_entries`, bucket `tattoo-battle-media`, `set_tattoo_battle_champion()`, slot `tattoo-battle-veteran-ink`. Ryan ran `verify_069.sql`: fixtures_remaining = 0, no raise. |
| **079b** | **NOT APPLIED** (delivered 2026-09-26, PR #17) | `applications.user_id` drop not null - 015's statement, which was never applied live. Run `verify_079b.sql`, then re-run `verify_079.sql` and `verify_079_matrix.sql`. |
| **079** | **APPLIED** 2026-09-26 (Ryan). verify_079 FAILED at block E (23502: user_id NOT NULL, because 015 was never applied); re-run after 079b. | `application_list_price()`, insert clamp refuses a client total, one-active-application index. |
| **078** | **NOT APPLIED** (delivered 2026-09-25) | storage: "exhibitor-media: own aatc-graphics insert". Run `verify_078.sql` and `node scripts/verify-graphics-owner.mjs`. |
| **077** | **APPLIED** 2026-09-25 (Ryan; verify_077 PASSED) | `applications.submission_receipt_sent_at` + clamps (072 bodies + one line each; 076 does not touch the clamps, so 076 then 077 applies in either order). Apply with the PR #12 deploy. Run `verify_077.sql`. |
| **076** | **NOT APPLIED** (delivered 2026-09-25) | aatc_submissions pinned + 4 policies to authenticated; admin pinup insert; sponsor anon insert dropped. APPLY AFTER PR 1 DEPLOYS. Run `verify_076.sql`. |
| **075** | **APPLIED** 2026-09-24 (Ryan; verify_075 A-E passed, F failed only on aatc_submissions - fixed by 076) | `applications_public` view; public read policy dropped; anon off the table; staff read policy; 13 write policies re-scoped. Run `verify_075.sql`. Apply BEFORE deploying the branch (directory reads the view). |
| **074** | **APPLIED** 2026-09-24 (Ryan). verify_074 first run failed on its own fixture; PR #8 fixes it - re-run. | `events.pinup_capacity`; register_pinup_entry parameter-free + service_role only; pinup_spots_remaining(uuid); two anon INSERT policies dropped; anon column grant on applications. Run `verify_074.sql` (includes the grant audit). |
| **073** | **APPLIED** 2026-09-24 (Ryan; verify_073 exact, verify_072 re-run PASS) | anon/PUBLIC EXECUTE revoked on the seven non-anon functions; expire/cancel gain an internal guard. Run `verify_073.sql`, then re-run `verify_072.sql`. |
| **072** | **APPLIED** 2026-09-24 (Ryan) | `comp_2026_09_24.sql` RUN, both rows correct. `verify_072` ABORTED at block B (anon grant; see 073) - re-run after 073. |
| **071** | **APPLIED** 2026-09-24 (Ryan; verify_071 block A showed exactly the three policies) | application-docs policies (drop unscoped upload + own read; own folder insert, admin insert, admin read), `applications.veteran_doc_verified_at/by`, clamp + reset on `veteran_id_url` change. Run `verify_071.sql` after; block D needs the RLS harness user. |
| **070** | **APPLIED** 2026-09-23 | `venues`, `schedule_items.venue_id`, kind `after_party`, `start_time` nullable only while unpublished, `contests.sponsor_id`, slot `after-party-sunday`; `schedule_items_public` recreated with `venue_id` last (14 columns). `verify_070.sql` run status NOT reported by Ryan - run it if unsure. |

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

### Seed status - also explicit, also audited live 2026-08-31

| seed | status | evidence |
|---|---|---|
| `contests_2027.sql` | **APPLIED** | 49 contests live |
| `schedule_2027.sql` | **APPLIED** | 25 schedule_items live |
| `panels_2027.sql` | **APPLIED** | 2 panels live. NOTE: it ran AFTER 046, which is why 046's backfill matched nothing and 064 was needed. |
| `tattoo_battle_credit.sql` | **APPLIED** | 3 Battle rows carry the presenter credit (spelling since changed by `wholelife_spelling.sql`, below) |
| `wholelife_spelling.sql` | **APPLIED + VERIFIED** 2026-09-23 | sponsorships row + 3 Battle rows + presentation_credits/exclusivity_grants read `WholeLife Aftercare`; verify_044 passed. First run aborted by its own guard on presentation_credits, re-run landed. |
| `070_after_parties_data.sql` | **APPLIED** 2026-09-23 | 3 venues, 3 logo slots renamed to `venue-*`, 4 night slots, 4 after_party rows. Live rows since edited in the admin (times, publish state, Club Luna address) - see the 2026-09-23 after-parties entry. Do not re-run. |
| `contact_email_scan.sql` | run status not reported | scan only; expects one PASS notice. |
| `voting_window_2027.sql` | **APPLIED + VERIFIED** 2026-08-31 | Ryan ran it and read the report: opens 2027-04-21 12:00 ET, closes 2027-05-22 00:00 ET, `days_to_exclusive_bound` 31, `voting_state()` returns "before". See above. |
