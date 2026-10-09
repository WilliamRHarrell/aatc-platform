# Migration and seed status

_The one home for whether a migration or seed is applied. Moved from docs/HANDOFF.md (develop b5a1d3f) on 2026-09-26._

**How this file changes.** A branch that delivers a migration records it as
delivered in its own session file and its PR, not here. This file is updated
only after Ryan applies something, on its own small docs PR (or the
end-of-session START HERE PR), and every row names who verified it and how.

### Migration status - EXPLICIT, because a range is not a status

**Never write "applied through N" again.** That phrasing is what produced the
047 incident: it reads as contiguous, it was not, and a migration sat unapplied
inside the range for months. A number omitted from a range says nothing about
why. Every migration below is stated as APPLIED, HELD (with its gate and the
gate's current status) or NOT APPLIED.

Audited 2026-08-31 against the LIVE DATABASE, not against this file.

| # | status | detail |
|---|---|---|
| 001-046 | **APPLIED**, except 015 | every table, view and column each one creates is present live. |
| **015** | **NEVER APPLIED; superseded by 079b** | `applications.user_id drop not null`. Invisible to the 2026-08-31 audit (see the list below the table); found 2026-09-26 when verify_079 block E failed with 23502 and Ryan read is_nullable = NO. 079b applied the same statement. |
| **047** | **HELD - GATE NOW OPEN, DO NOT RUN AS-IS** | Drops `panels.panel_date` / `panel_time`. Gate: step 3 of its own header, "verify_046 returns zero rows". That gate FAILED SILENTLY for months - both panels had a null `panel_day`, which is the defect 064 repaired - so the hold became permanent without anyone deciding it. **The gate is now satisfiable.** 047 was AMENDED 2026-08-31 to carry 065's credit join; before amendment, running it would have silently reverted the panels dual-read. Running it also changes `panels_public` from 20 columns to 18, so `verify_065` block E must be updated in the same pass. Its header carries the replacement list. |
| 048-063 | **APPLIED** | as above. |
| **064** | **APPLIED + VERIFIED** 2026-08-31 | panel day/start repair, `panels_published_has_schedule`. |
| **065** | **APPLIED + VERIFIED** 2026-08-31 | dual-read. Rejected on its FIRST run with `42P16` because its column list came from unapplied 047; fixed to the live shape and re-run. Verified by Ryan via `verify_065.sql` (four credits, all `source = 'fallback'`) and by re-fetching the three pages against a pre-064 baseline. |
| 066-068 | present on develop before 2026-09-23 | `sponsorship_is_custom`, `placement_check_runs`, `payment_method_square`. Not re-audited in the 2026-09-23 sessions; their tables/columns are read by live code. |
| **069** | **APPLIED + VERIFIED** 2026-09-23 | Tattoo Battle: `tattoo_battle_entries`, bucket `tattoo-battle-media`, `set_tattoo_battle_champion()`, slot `tattoo-battle-veteran-ink`. Ryan ran `verify_069.sql`: fixtures_remaining = 0, no raise. |
| **070** | **APPLIED** 2026-09-23 | `venues`, `schedule_items.venue_id`, kind `after_party`, `start_time` nullable only while unpublished, `contests.sponsor_id`, slot `after-party-sunday`; `schedule_items_public` recreated with `venue_id` last (14 columns). `verify_070.sql` run status NOT reported by Ryan - run it if unsure. |
| **071** | **APPLIED** 2026-09-24 (Ryan; verify_071 block A showed exactly the three policies) | application-docs policies (drop unscoped upload + own read; own folder insert, admin insert, admin read), `applications.veteran_doc_verified_at/by`, clamp + reset on `veteran_id_url` change. Run `verify_071.sql` after; block D needs the RLS harness user. |
| **072** | **APPLIED** 2026-09-24 (Ryan) | `comp_2026_09_24.sql` RUN, both rows correct. `verify_072` ABORTED at block B (anon grant; see 073) - re-run after 073. |
| **073** | **APPLIED** 2026-09-24 (Ryan; verify_073 exact, verify_072 re-run PASS) | anon/PUBLIC EXECUTE revoked on the seven non-anon functions; expire/cancel gain an internal guard. Run `verify_073.sql`, then re-run `verify_072.sql`. |
| **074** | **APPLIED + VERIFIED** 2026-09-24 (Ryan). verify_074 first run failed on its own fixture; PR #8 fixed it and the re-run is done (Ryan, 2026-09-26). | `events.pinup_capacity`; register_pinup_entry parameter-free + service_role only; pinup_spots_remaining(uuid); two anon INSERT policies dropped; anon column grant on applications. Run `verify_074.sql` (includes the grant audit). |
| **075** | **APPLIED** 2026-09-24 (Ryan; verify_075 A-E passed, F failed only on aatc_submissions - fixed by 076) | `applications_public` view; public read policy dropped; anon off the table; staff read policy; 13 write policies re-scoped. Run `verify_075.sql`. Apply BEFORE deploying the branch (directory reads the view). |
| **076** | **APPLIED** (Ryan, recorded in the 2026-09-26 START HERE; verify_076 result not recorded here) | aatc_submissions pinned + 4 policies to authenticated; admin pinup insert; sponsor anon insert dropped. |
| **077** | **APPLIED** 2026-09-25 (Ryan; verify_077 PASSED) | `applications.submission_receipt_sent_at` + clamps (072 bodies + one line each; 076 does not touch the clamps, so 076 then 077 applies in either order). Apply with the PR #12 deploy. Run `verify_077.sql`. |
| **078** | **APPLIED + VERIFIED** 2026-09-25 (Ryan: verify_078 passed; `scripts/verify-graphics-owner.mjs` 4 PASS) | storage: "exhibitor-media: own aatc-graphics insert". |
| **079** | **APPLIED + VERIFIED** 2026-09-26 (Ryan). First verify_079 failed at block E (23502, 015 never applied); after 079b, verify_079 and verify_079_matrix passed, and the duplicate-application refusal was checked by hand. | `application_list_price()`, insert clamp refuses a client total, one-active-application index. |
| **079b** | **APPLIED + VERIFIED** 2026-09-26 (Ryan: verify_079b passed, block D returned no admin-owned applications) | `applications.user_id` drop not null - 015's statement. |
| **080** | **APPLIED + VERIFIED** (Ryan, reported 2026-09-27: verify_080 and re-run verify_073 passed) | panel capacity: `hard_cap`, seat holds, `register_panel_seat()`, `panel_seats_taken()`, `panel_seats_remaining()` (anon). |
| **081** | **APPLIED + VERIFIED** (Ryan, reported 2026-09-27: verify_081 passed) | `invoices.due_reminder_30_sent_at` / `due_reminder_7_sent_at` for sponsor due reminders. |
| **082** | **APPLIED + VERIFIED** (Ryan, 2026-09-28: 082, then `protect_2026_09_26.sql`, then verify_082, no errors; grid C listed applications 13c265d7 Skin Reserve and 44c185e8 The Pinback Button Club, sponsorship 3c393126 Skin Reserve; Ryan's own check flag_columns = 2, protect_triggers = 8) | protected records: `is_protected` on applications and sponsorships, delete-refusal triggers (including cascades from the owner account), flag changeable only in SQL. |
| **083** | **APPLIED + VERIFIED** (Ryan, 2026-09-28: verify_083 passed) | `sponsor_tier_counts()` excludes `'ZZ %'` test sponsorships. |
| **084** | **APPLIED + VERIFIED** (Ryan, 2026-09-28: verify_084 first failed on `bronze`, then passed after 084b) | `sponsor_tier_settings`: per-tier show_price, seeded packages hidden / items shown. |
| **084b** | **APPLIED + VERIFIED** (Ryan, 2026-09-28: verify_084b passed, verify_084 re-run passed) | hidden `bronze` row (leftover enum value from 001). |
| **085** | **APPLIED + VERIFIED** (column read from production 2026-09-28; Ryan, 2026-09-29: verify_085 "Success. No rows returned", no panel marked Full yet) | `panels.signup_closed`, appended to `panels_public`. |
| **086** | **APPLIED + VERIFIED** (Ryan, 2026-09-30: verify_086 passed; real save booth 126 to Skin Reserve worked; booth 108 refused) | `assign_booths()`: Assign Booth in one transaction, event-scoped, not-sellable refused, count capped at slots (fewer allowed). |
| **087** | **APPLIED + VERIFIED** (Ryan, 2026-09-30: first verify_087 run failed on its own fixture, sponsorships.tier NOT NULL, fixed in #60; re-run passed; hold / refuse-other / linked-assign clears hold / release all checked by hand) | booth holds: `booths.held_for`, optional application or sponsorship link, required `held_until`; `hold_booth()`, `release_booth_hold()`, `release_expired_booth_holds()` (service_role, daily cron); `assign_booths()` refuses active holds except for the linked application. |
| **088** | **APPLIED + VERIFIED** (Ryan, 2026-10-07: verify_088 passed, then verify_079_matrix (regenerated for 088) passed) | artist capacity 2 per single / 4 per double (CHECK + `application_list_price` cap), roster guard, per-artist ID verification written only by `set_artist_id_verified()`. |
| **089** | **APPLIED + VERIFIED** (Ryan, 2026-10-07: verify_089 passed; read 2026-10-07: `set_comp` exists, anon refused; `events.permit_submission_date` = 2027-03-01; comps split as mapped) | Comp booth (`comped_at`) / Comp permits (`permits_comped_at`) via `set_comp()`; comped booths secured in the directory; public view strips artist verification keys. |
| **090** | **APPLIED + VERIFIED** (Ryan, 2026-10-06: verify_090 passed; `scripts/verify-food-truck-owner.mjs` 4 PASS) | food-truck owners read their own invoice; staff-only truck columns; logo uploads scoped to the owner's truck folder. |
| **091** | **APPLIED + VERIFIED** (Ryan, 2026-10-08: verify_091 passed; applied before #75 merged) | food truck applications: `food_trucks.status` (existing rows approved), application/decision columns, `events.food_truck_applications_open` (off) and `food_truck_cap` (8), cap trigger, publish only while approved, decision columns admin-only, one active application per email per event, `food-truck-logos` limit 10 MB. |
| **092** | **APPLIED + VERIFIED** (Ryan, 2026-10-08: verify_092 passed; applied before #77 merged) | `invoices.deposit_rule` (percent_25 for every existing row; food_truck_flat for truck invoices created from #77 on), `due_reminder_14_sent_at` / `due_reminder_1_sent_at`, `events.food_truck_unpaid_report_sent_at`. |
| **093** | **APPLIED + VERIFIED** (Ryan, 2026-10-08: verify_093 passed; `scripts/verify-food-truck-docs.mjs` all PASS; applied before #80 merged) | private bucket `food-truck-docs` (10 MB, PDF/JPG/PNG) with owner-insert / admin-insert / admin-read storage policies; `food_trucks` permit and license path / uploaded / verified columns (path must sit in the truck's folder); `food_trucks_docs_guard` (a new document clears its verification); admin-only `set_food_truck_doc_verified()`. |
| **094** | **APPLIED + VERIFIED** (Ryan, 2026-10-09: verify_094 passed; applied before #89 merged) | `applications.tv_show_featured` (artist form's TV show Yes/No; null = not asked or applied before 094); backfill true for artist rows that named a show. |
| **095** | **APPLIED + VERIFIED** (Ryan, 2026-10-09: verify_095 passed; applied before #90 merged) | `sponsorships.applicant_notes` (the public form's notes; `notes` stays internal). No rows moved: the 4 existing notes were staff-written (production read 2026-10-09). |

**What this audit could and could not see.** It reads the live schema through
PostgREST's OpenAPI document, which exposes tables, views, columns and callable
RPCs. It CANNOT see policies, grants, indexes, constraints, trigger functions or
function bodies. So the migrations that only change RLS, grants or trigger
functions - **002, 003, 007, 011, 015, 024, 025, 031, 034, 041, 043, 049, 054** -
are not confirmed by it. There is no evidence of absence for any of them; they
are simply invisible to this method. Anything asserting one of those needs a
verify block run in the SQL Editor.

**2026-09-26: one of them was in fact never applied.** 015 is on that list and
turned out to be missing live (see its row). The others (002, 003, 007, 011,
024, 025, 031, 034, 041, 043, 049, 054) are still unconfirmed by anything in
this file; several were superseded by later migrations, but none has a
recorded check. Open item: a single read-only catalog check for them.

**CONFIRMED 2026-09-26: all twelve are in their expected final state.**
Ryan ran `supabase/verify/audit_unconfirmed_migrations.sql` (48 checks, one
read-only SELECT): 48 PASS, 0 DIFFERS. That covers 002, 003, 007, 011, 024,
025, 031, 034, 041, 043, 049 and 054, including the later drops (007 by 024,
024's applications policy by 075, 025 by 030) and 042's booths body.
070's header note that "schedule_items: admin all" and "contests: admin write"
were live is wrong: both are absent.

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
