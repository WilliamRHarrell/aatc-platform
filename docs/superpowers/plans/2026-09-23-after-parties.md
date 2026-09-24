# After Parties, Venues and Part A Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make schedule rows the single source for after parties (Thursday kickoff, Friday, Saturday, Sunday brunch) backed by a venues table, render venue cards that match the panels thumbnails, and land the four Part A fixes, each as its own commit, on `feat/after-parties` stacked on `feat/tattoo-battle`.

**Architecture:** Migration 070 adds `venues`, `schedule_items.venue_id`, the `after_party` kind, nullable `start_time` guarded by "null only while unpublished", and `contests.sponsor_id`. Public pages read `schedule_items_public` (already filtered to published rows) joined to a new `venues_public` view; the after-parties page and homepage grid select `kind = 'after_party'`. `AFTER_PARTIES` and `mapsUrl` in homepage-content retire. Admin gains a venues screen, a venue picker and optional time on the schedule editor, and a sponsor picker on contests.

**Tech Stack:** as the battle plan (Next.js 16, Supabase RLS, vitest for pure helpers, guardedWrite on every admin write).

**Spec:** Ryan's messages of 2026-09-23 in this session (venue data, schedule rows, Part A), plus the approved chat design. This file is the written record of both.

## Global Constraints

- Everything in the battle plan's Global Constraints still applies (no em/en dashes in `src/`, `guardedWrite()` on every write, hand-maintained `database.ts`, no invented content, small gold text is `#C4A882`, migrations delivered and never applied by the implementer).
- Migration number is **070**, delivered as one file plus one guarded data SQL file. Ryan runs both.
- Fields Ryan marked null stay null. Blurbs are Ryan's text verbatim; the old page_images alt strings are NOT copied anywhere.
- Rows with `start_time` null render nowhere (they are unpublished by the check constraint, and the public view filters unpublished).
- After-party cards match the tattoo-panels thumbnail: square 144 px, 160 px from `sm`, beside the text, same grid; logos `object-contain` with padding on the brand background.
- Battle credit renders only on `/tattoo-battle` among event/contest pages (see Task 9 for the two reads of that sentence).
- Never render tier, payment or exclusivity details for any sponsor.

## Review Focus

1. **A published after-party row whose venue has no address.** Card shows name and blurb, no maps link, nothing "TBA". Test: `venueCard()` helper with address null.
2. **A row published with `start_time` null slips through the admin.** DB check refuses; the admin refuses first with a clear message. Verify block + UI guard.
3. **Thursday is before the convention.** Badge derives from `day_date < events.start_date`, not from a weekday name. Test with a Friday-before-Friday event date.
4. **Kids contest row gets a sponsor whose sponsorship is later un-confirmed.** Credit disappears (join is through `sponsors_public`, confirmed only). Verify block.
5. **The Instagram label with a null URL.** No icon, no dead link. Test: `venueLinks()` with url null and label set.

---

## Decisions recorded (Ryan can overturn any)

- **D1. Venue logo slots.** `venues.logo_slot` points at a `page_images` slug. 070's data SQL RENAMES the three existing uploads in place so nothing is re-uploaded: `after-party-thursday` → `venue-uptowns`, `after-party-friday` → `venue-group-therapy`, `after-party-saturday` → `venue-club-luna`, and sets each alt to "[Venue name] logo". Four fresh per-night slots `after-party-thursday/friday/saturday/sunday` are created empty for an optional night flyer under the card (this is the "Sunday slug" Ryan asked for; Sunday's venue logo comes from Uptown's venue row). If Ryan would rather the night slots not exist, drop Task 2 step 4.
- **D2. `schedule_items.note` already exists** (044, `text not null default ''`), so no column is added; Thursday's "Live karaoke" goes in `note` and the card renders it under the blurb.
- **D3. "Battle credit only on /tattoo-battle"** is read as: no page ABOUT ANOTHER EVENT names the Battle's presenter. The homepage Battle card (`HOME_EVENTS.presentedBy`) and the Battle's own three schedule rows keep their credit, because they are about the Battle and the schedule credit is a sold placement (HANDOFF: owed-and-unrendered is a defect). If Ryan means literally only the one page, Task 9 step 3 removes those two as well.
- **D4. Per-contest sponsor renders** on `/events/kids-contest` (reads its own `contests` row via `is_kids_category`) and on `/contests` above each contest's entries. `/events/tattoo-contests` lists categories from a hardcoded constant, not the table, so it cannot show per-contest credits without migrating that list; out of scope, flagged.
- **D5. A3 data SQL is a scan-only guard**: the sweep of every readable table found zero database hits, so the file scans every text/varchar/jsonb column and PASSes on zero, ABORTs listing any hit. No blind updates.
- **D6. A2 asset**: `public/images/miss-aatc-pinup/logo.png` does not exist in the repo; the file at `~/Downloads/aatc-miss-aatc-pinup.png` (1467×477, white on transparent) is copied there. Collectors' Choice uses `ASSETS` (site-assets bucket), not a page_images slot, so the pinup logo joins `ASSETS` as a `/public` path, same component and classes.

---

## File structure

```
NEW
supabase/migrations/070_after_parties_venues_contest_sponsor.sql
supabase/seeds/070_after_parties_data.sql          venues, 4 schedule rows, page_images renames + slots
supabase/seeds/contact_email_scan.sql              A3 scan-only guard
supabase/verify/verify_070.sql
src/lib/venues.ts                                  pure helpers (tested): venueLinks, mapsUrl, isPreConvention, weekdaySlug
src/lib/venues.test.ts
src/lib/after-parties-data.ts                      cached anon reads: after-party rows + venues, contest sponsor
src/components/VenueCard.tsx                       server: thumbnail + text + icon links (panels treatment)
src/components/ContestPresentedBy.tsx              server: "The X is presented by Y" with logo/link
src/app/admin/venues/page.tsx                      'use client' venues CRUD
public/images/miss-aatc-pinup/logo.png

MODIFIED
src/app/events/after-parties/page.tsx              server rewrite, cards from rows
src/app/page.tsx                                   after-parties grid from rows; JSON-LD subEvent list; cta text via registry
src/lib/homepage-content.ts                        remove AFTER_PARTIES + mapsUrl
src/lib/schedule-data.ts                           expose venue + kind + day_date on Item; pre-convention flag
src/app/events/schedule/page.tsx, src/app/tickets/page.tsx   after_party rows render with the badge
src/app/admin/schedule/page.tsx                    kind after_party, venue picker, optional time while unpublished
src/app/admin/contests/page.tsx                    sponsor picker
src/app/admin/page-images/page.tsx                 WHERE map: venue slots + sunday
src/components/admin/AdminShell.tsx, src/lib/roles.ts   /admin/venues
src/app/events/kids-contest/page.tsx               A4: remove battle credit; add contest credit
src/app/contests/VotingBoard.tsx                   per-contest credit
src/app/events/tattoo-panels/page.tsx              A3: CONTACT_EMAIL
src/content/registry.ts                            A1: cta_booth default
src/app/events/pinup-contest/page.tsx + PinupContestClient.tsx   A2
src/lib/event-config.ts                            ASSETS.missAatcPinupLogo
src/types/database.ts                              venues, schedule_items.venue_id, contests.sponsor_id, venues_public
supabase/verify/verify_044.sql                     4 days; published rows have times
docs/HANDOFF.md
```

---

### Task 1: Part A1, A2, A3 (three commits)

**A1 (commit 1).** `src/content/registry.ts:37` default `'Reserve a Booth'` → `'Apply for a Booth'`; label stays. Report: the only other instance anywhere is that same registry entry; `page_content` has 0 rows so the homepage renders the default; no other file, seed or table carries the phrase (swept 2026-09-23). The `/apply` target is unchanged.

**A2 (commit 2).** Copy `~/Downloads/aatc-miss-aatc-pinup.png` to `public/images/miss-aatc-pinup/logo.png`. Add `ASSETS.missAatcPinupLogo: '/images/miss-aatc-pinup/logo.png'`. In `PinupContestClient.tsx` header, above the eyebrow, the exact Collectors' Choice pattern:

```tsx
<Image src={ASSETS.missAatcPinupLogo} alt="" aria-hidden="true" width={1467} height={477} priority
       sizes="(min-width: 640px) 420px, 80vw" className="mx-auto h-auto w-4/5 max-w-[420px]" />
<h1 className="sr-only">Miss AATC Pinup Contest</h1>
```
Ryan asked for alt "Miss AATC Pinup logo"; Collectors' Choice uses `alt=""` with an sr-only h1 so the page does not announce the title twice. Ruling: follow Ryan, `alt="Miss AATC Pinup logo"`, and keep the visible h1 text as the eyebrow's sibling (the h1 becomes sr-only, as on Collectors' Choice). The header's dark band already exists at every breakpoint.

**A3 (commit 3).** `tattoo-panels/page.tsx:350-351` → `CONTACT_EMAIL` from `@/lib/event-config` (the existing one home). Report of the sweep: one repo hit (that file); zero hits in `page_content, panels, events, sponsorships, schedule_items, contests, page_images, team_members, food_trucks, presentation_credits, exclusivity_grants, profiles, applications, exhibitors, invoices`; Resend `from` is `RESEND_FROM_EMAIL` and no template or reply-to carries the string, so no stop was needed. Deliver `supabase/seeds/contact_email_scan.sql`: the same dynamic scan as the spelling seed for `%armoredarmadillo%`, PASS on zero, ABORT listing hits. Add a vitest that greps `src/` for the string (one home for the address).

---

### Task 2: Migration 070, data SQL, verify_070, types

**070 schema** (in this order):
1. `create table venues (id uuid pk, event_id uuid null references events, name text not null, slug text not null unique, blurb text not null default '', address text, phone text, website_url text, instagram_url text, instagram_label text, facebook_url text, tiktok_url text, logo_slot text references page_images(slug) on delete set null, created_at, updated_at)`; RLS: public read `using (true)` (venues carry nothing private), editorial write `has_role(admin, content_editor)`; grants as 069. `venues_public` view not needed: the table is fully public; read it directly.
2. `alter table schedule_items add column venue_id uuid references venues on delete set null; alter column start_time drop not null; add constraint schedule_items_time_required_when_published check (start_time is not null or is_published = false); drop constraint schedule_items_kind_check; add check (kind in ('programme','contest','ceremony','tribute','seminar','after_party'))`. `schedule_items_public` view: DROP then CREATE (HANDOFF: read the LIVE column list first; verify_065 block E pinned it) adding `venue_id` as the last column; every existing column stays in order. Live list read 2026-09-23 with the anon key: `id, event_id, day_date, start_time, sort_order, title, location, note, kind, presented_by, presented_by_website, presented_by_logo_url, presented_by_linked` (13); 070 makes it 14 and verify_070 pins that.
3. `alter table contests add column sponsor_id uuid references sponsorships on delete set null`. No new policy: `contests: public read` already `using (true)`, and the join to `sponsors_public` is confirmed-only.
4. `insert into page_images (slug) values ('after-party-sunday') on conflict do nothing`.

**Data SQL** (guarded like `tattoo_battle_credit.sql`): three venues with Ryan's values verbatim; rename the three page_images slugs and set alt "[Venue name] logo" (guarded: each old slug must exist exactly once with an image); recreate the three old night slugs empty; four schedule rows (Thursday 18:00 published note "Live karaoke"; Fri/Sat/Sun null time unpublished; titles "After Party" ×3, "Sunday Brunch"; kind after_party; location = venue name for the programme's text column) with `venue_id` resolved by slug; abort if any Thursday row or after_party row already exists.

**verify_070**: policies list; constraint refuses `is_published = true` with null time (fixture); check allows null time while unpublished; kind check; view column list pinned (with `venue_id` last); anon can read venues; anon cannot write venues; contests.sponsor_id join returns nothing for an unconfirmed sponsorship (fixture ZZ sponsorship pending); fixture teardown; block Z residue.

**verify_044**: block G expects 4 days (2027-04-15 (1) first; Fri 10, Sat 9, Sun 6 unchanged; the unpublished rows are not in the public view, and this block reads the base table, so note "base table: Fri 11, Sat 10, Sun 7 once 070 data has run; public view 10/9/6"). Add block I: no published row with a null start_time.

**database.ts**: `venues` table; `schedule_items` + `venue_id`, `start_time: string | null`; `contests` + `sponsor_id`.

---

### Task 3: Pure helpers `src/lib/venues.ts` (TDD)

- `mapsUrl(address)` (moved from homepage-content, same output).
- `venueLinks(v)`: returns `[{kind:'website'|'instagram'|'facebook'|'tiktok', href, label}]` for non-null URLs only; Instagram `label = instagram_label ?? '${name} on Instagram'`; all hrefs through `safeHttpUrl`.
- `isPreConvention(dayDate, eventStartDate)`: string compare of ISO dates.
- `weekdaySlug(dayDate)`: `'after-party-thursday'` etc., built from the date's weekday in `America/New_York` (rebuilt from parts, not `new Date(iso)`).
- `nightLabel(dayDate)`: `'Thursday'` / `'April 15'` pair via `dayLabel`.
Tests cover Review Focus 1, 3, 5.

---

### Task 4: Data layer `src/lib/after-parties-data.ts`

`getAfterParties()`: cached anon read of `schedule_items_public` where `kind = 'after_party'` for the active event, joined client-side to `venues` (one query each), plus `events.start_date`; returns `{ id, day_date, start_time, title, note, venue: Venue | null, preConvention }[]` ordered by day. Tag `'after-parties'`; add the tag and `/events/after-parties` to the revalidate allow-list. `getContestSponsor(contestId)` and `getContestSponsors(eventId)`: `contests.sponsor_id` → `sponsors_public` (`id, sponsor_name, logo_url, website`), `excludeHarnessSponsors`, tag `'contests'`.

`schedule-data.ts`: `Item` gains `kind`, `venueId`, `dayDate`; `getSchedule` returns `preConvention` per day (from `events.start_date`). Schedule and tickets pages render a "Before the convention opens" badge on such a day heading. `timeToMinutes`/`timeLabel` are only reached for published rows, which have times; guard anyway (`start_time ?? '00:00:00'`).

---

### Task 5: `VenueCard` and the two public surfaces

`VenueCard({ party })`: outer card as the panels card (`rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5`), `flex gap-4`; left a `h-36 w-36 sm:h-40 sm:w-40 shrink-0 overflow-hidden rounded-xl bg-[#0a0a0a] p-3` box holding the venue logo `object-contain` from `page_images` (server read by slug, alt from the row) or nothing when the slot is empty; right: night + date + badge, venue name (h3), blurb, `note` when non-empty, address as maps link when present, time when present ("Doors" wording NOT used; the row's `timeLabel`), then icon links (lucide `Globe`, `Instagram`, `Facebook`, `Music2` for TikTok) each `aria-label` and `title` = label, 44 px hit area. A row with no venue: night, date, badge, title only.

After-parties page: server component; header unchanged; hero slot unchanged; cards from `getAfterParties()`; the per-night flyer slot `PageImage slug={weekdaySlug(day_date)}` under each card; the "Venue and details to be announced" line and the "Venue details and addresses will be announced" bullet removed; the rest of Important Information stays. Homepage grid: same rows, compact (venue name, night, address link), "Venue TBA" branch removed, `afterparty_note` stays. `AFTER_PARTIES`/`mapsUrl` deleted from homepage-content; the file's long comment about invented venues stays as history in git only.

JSON-LD: the homepage `eventJsonLd` gains `subEvent: [...]` with one `Event` per PUBLISHED after-party row: `name`, `startDate` (`day_date`+`start_time` in `-04:00`), `location: { '@type': 'Place', name, address }` when the venue has an address, else `name` only. The battle page's JSON-LD is untouched.

---

### Task 6: Admin: venues screen, schedule editor, page-images map

- `/admin/venues`: list + form for every column, logo slot picker limited to slugs starting `venue-`, all writes via `guardedWrite`, `roles.ts` grants content_editor, AdminShell nav entry. Delete refused when a schedule row references the venue (surface the FK error as "Unlink it from the schedule first").
- Schedule editor: `KINDS` gains After Party; a venue select (venues of the active event, plus "none"); time input optional; Save refuses `is_published && !start_time` with "Set a start time before publishing" (DB backs it); the publish toggle refuses the same.
- page-images `WHERE` map: three `venue-*` slugs ("Venues" page, "logo on every card for this venue"), `after-party-sunday`, and the three night slugs re-described as "optional flyer under the card".

---

### Task 7: Per-contest sponsor (A4 part 2)

- Contests admin: sponsor select listing confirmed sponsorships of the active event (`sponsorships` is admin-readable) by name only; writes `sponsor_id` via `guardedWrite`.
- `ContestPresentedBy({ contestName, sponsor })`: renders `The {contestName} is presented by {sponsor_name}` with logo (h-10) and website link when present; nothing when `sponsor` is null. Tier/amount never selected.
- Kids page: `getContestSponsor` for the `is_kids_category` row; render the credit in the header block. `/contests` VotingBoard: the server page passes `sponsorsByContest` down; credit under each contest heading.

---

### Task 8: A4 part 1, the battle credit leak (own commit)

Root cause: `kids-contest/page.tsx:97-101` deliberately rendered `TATTOO_BATTLE_PRESENTER` because the page's `when_note` copy mentions the Battle and the repo convention said "the credit goes wherever it is named". Every other contest/event page was swept: only the kids page does this. Fix: delete the paragraph and its comment; the `when_note` sentence naming the Battle stays (it is timing information). Per D3 the homepage Battle card and the Battle's schedule rows keep their credit; step 3 (optional, on Ryan's word) removes `presentedBy` from `HOME_EVENTS` and the three `presented_by_fallback` values via a data SQL.

---

### Task 9: Verification and hand-off

`npm test`, `tsc`, lint on touched files, `npm run build`; Lighthouse accessibility ≥ 0.95 on `/events/after-parties` and `/`; served checks: after-parties page renders 0 cards before 070 data (no "TBA" copy anywhere), homepage grid empty-safe; `node scripts/check-event-dates.mjs`; HANDOFF entry (070 not applied, data SQL not run, A3 scan not run); PR #2 against `feat/tattoo-battle`.
