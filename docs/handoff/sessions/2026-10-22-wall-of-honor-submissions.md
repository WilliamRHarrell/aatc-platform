# 2026-10-22 - Wall of Honor submissions (PR 1 of 3)

The 2026-10-22 spec was pasted in session and is summarized in the plan
(docs/superpowers/plans/2026-10-22-wall-of-honor-submissions.md). PR 1 is
intake and admin review only. Nothing is published to the public page yet.

## Delivered (migration NOT applied)

- **Migration 104** + verify_104: `wall_of_honor_entries` (publish-invariant
  CHECKs, partial unique index for one active entry per submitter email and
  honoree, guard trigger that stamps `consent_at` from the database clock and
  keeps the submitted tribute immutable), admin-only RLS, anon revoked on the
  table, `wall_of_honor_public` view (honoree fields, the tribute as
  `coalesce(tribute_display, tribute)`, and the public photo paths; published
  rows of the active event only), `events.wall_of_honor_open` (default off), buckets
  `wall-of-honor-submissions` (private, admin read) and `wall-of-honor`
  (public; written by the service role in PR 2).
- The `aatc.woh_import` setting lets a trusted import keep a supplied
  `consent_at`. It works only when `auth.uid()` is null, so a signed-in admin
  cannot backdate consent (verify B3). PR 3 may use it from service-role or
  direct SQL only.
- **Ryan:** run migration 104, then paste verify_104 in a FRESH session and
  read the MESSAGES pane (per its header).
- `src/lib/wall-of-honor-submission.ts` + tests: tribute over 1,500 is a field
  error (never sliced), branch and relationship pick-lists with Other, 1 to 3
  JPG/PNG/WebP photos up to 10 MB by manifest, photo quality, duplicate key.
- Routes `/api/wall-of-honor-submit` (bot trap, validation, switch check,
  insert without `consent_at`, signed upload URLs) and `/files` (records the
  uploads). Receipt to the submitter and an internal notice to
  `WALL_OF_HONOR_EMAIL` (new constant in `src/lib/event-config.ts`); mail
  never fails the save.
- Content: `wallOfHonorSubmit` page entries and `WALL_OF_HONOR_DEADLINE_LABEL`
  (one home for the deadline), apply-hub card link.
- Public form `/info/wall-of-honor/submit`, switch-gated, in the sitemap via
  `ROUTES`. The two mailto literals on `/info/wall-of-honor` now read
  `WALL_OF_HONOR_EMAIL`.
- Admin `/admin/wall-of-honor` + AdminShell nav: switch (purges the
  `wall-of-honor` tag, added to the revalidate `ALLOWED_TAGS`), pending count,
  status filter, possible-duplicate badge, signed private photos with size and
  quality, Approve/Reject (no email), display-field edit beside the read-only
  tribute, include-in-print, admin notes. `is_published` is shown only.
- Hand-kept types for the 104 table and the events switch added to
  `src/types/database.ts`. The submit path is in revalidate `ALLOWED_PATHS` and
  `PAGE_ROUTE`/`ROUTES` (test-mandated).

## Launch gate (Ryan)

1. Add ONE Vercel WAF rule: Request Path starts with
   `/api/wall-of-honor-submit` AND Method equals POST, 5 requests / 60 s per
   IP, Deny. The prefix covers both routes. Now listed in docs/CUTOVER.md B2
   (which now says THREE rules).
2. Verify it BY OBSERVATION (the `PINUP_REGISTRATION_OPEN` precedent in
   event-config), not by reading the dashboard.
3. THEN flip the admin switch.

The switch defaults off, so merging before the rule exists is safe.

## Content follow-up (Ryan)

Re-check /admin/content for live overrides of `honor_body` and the applyHub
deadline entries; an override hides the new defaults.

## Decisions

Spec defaults 1 to 12 as built. Decision 7 (contact mailbox) resolved to
`WALL_OF_HONOR_EMAIL`, confirmed by Ryan 2026-10-22.

## Not in this PR

- PR 2: publish/unpublish, public page rewrite, "now on the Wall" email.
- PR 3: print export and WordPress import. The CUTOVER.md "Wall of Honor media
  off WordPress" item stays unchecked until then.

## Evidence (local, 2026-10-22)

- `npm test`: Test Files 57 passed (57), Tests 424 passed (424).
- `npm run build`: exit 0, "Compiled successfully", prebuild guards pass.
- `npm run verify:local -- supabase/verify/verify_104.sql`:
  `[verify-local] PASS verify_104.sql` (PASS A, B1-B10, C1-C5, fixtures
  removed). Replayed 104 migrations.
- `npm run verify:local -- --audit`: `audit: 186 fixture inserts checked, 0
  missing a required column`.

## 2026-10-23 scope rulings from Ryan (bind PR 2 and PR 3)

- One address for all tribute mail: the duplicate 409 and the did-not-save 500
  now use WALL_OF_HONOR_EMAIL (commit a9e3dc4 on this PR).
- Published tributes stay up permanently, across years. PR 2's migration (105,
  never an edit to 104) recreates wall_of_honor_public without the
  ev.is_active filter and APPENDS event_year derived from events.start_date
  (one home; no copied year column). verify_105 asserts a published row on an
  inactive event IS visible with the right year; verify_104's C1 described
  104's behavior and is superseded, not edited.
- The admin page must widen from the active event to all events (year column
  or filter) or imported historical tributes can never be reviewed,
  published, or unpublished. The open/closed switch stays on the active event.
- PR 3's WordPress imports (manifest carries year 2025/2026) need real
  historical event rows (inactive; true dates and venue from Ryan - never
  invented) so event_id stays NOT NULL and the year derives from start_date.
- Open question for Ryan before PR 2: should first-publish of an IMPORTED
  tribute send the "now on the Wall" email to a years-old submitter address?
  Proposed default: no (mark imports, e.g. imported_at in the PR 3 migration,
  and skip them); families who submit through the new form always get it.
