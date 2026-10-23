# 2026-10-23 - Wall of Honor publish (PR 2 of 3)

Plan: docs/superpowers/plans/2026-10-23-wall-of-honor-publish.md (Ryan's
2026-10-23 decisions). PR 2 turns the intake from PR 1 into a public,
permanent, multi-year wall with admin publish and unpublish. Print export and
the WordPress import are PR 3.

## Delivered (migration NOT applied)

- **Migration 105** + verify_105: `wall_of_honor_public` no longer filters to
  the active event and appends `event_year` (the nine 104 columns keep their
  order); `imported_at` and `published_email_sent_at` columns on
  `wall_of_honor_entries`; the guard stamps `published_at` on first publish
  (a republish keeps it, unpublish never clears it) and protects the two new
  columns from non-admins.
- `src/lib/wall-of-honor-publish.ts` + tests (`canPublish`,
  `shouldSendPublishEmail`, `groupByEventYear`) and the
  `wallOfHonorPublishedEmail` "now on the Wall" template.
- `POST /api/admin/wall-of-honor/publish`: publish and unpublish, race-guarded,
  revalidates the wall.
- Public `/info/wall-of-honor` is now a server page reading the view with the
  anon client, grouped by event year newest first, honoree cards with a
  lightbox, content from the `wallOfHonor` registry page.
- Admin `/admin/wall-of-honor` lists every event with a Year column and
  filter; the drawer has Publish/Unpublish with a disabled reason, warning and
  error banners, an Imported badge and an email-sent line.

## Ryan: apply 105 AFTER 104

- Run migration 105, then verify_105 per its header (a FRESH session, read the
  MESSAGES pane).
- verify_104 C1 and C4 are superseded by 105 (both describe 104's
  active-event-only visibility). They are expected to FAIL if verify_104 is
  re-run after 105 is applied.
- **Deploy-before-apply is safe and verified.** Until 105 is applied the live
  view lacks `event_year`, so the page read fails cleanly (42703) and the
  public page shows its empty state. Apply 105 to light the wall up.

## Publish mechanics

Publish copies the photos to the public bucket first and then flips the row; a
failed copy or row update deletes the copies, and if any copy cannot be
removed the 500 names the stray public photos. Unpublish flips the row first
and then deletes the copies; a failed delete returns a warning naming them,
which the admin sees in the drawer.

## Verification (this branch, 2026-10-23)

- `npm test`: Test Files 58 passed (58); Tests 434 passed (434).
- `npm run build`: exit 0 (prebuild guards and compile passed).
- `npm run verify:local -- supabase/verify/verify_105.sql`: PASS verify_105.sql
  (A, B1-B5, C1-C2 all PASS; fixtures removed).
- `npm run verify:local -- --audit`: 191 fixture inserts checked, 0 missing a
  required column.

## COPY HOLDS for Ryan

Removed from the public page until he confirms them (each returns as a content
entry or copy edit on his word):

- The "quiet, contemplative space" sentence.
- The "dedicated area separate from the main convention floor" paragraph.
- The flowers / challenge coins / tokens-returned paragraph.

Removed permanently: "accepted on a rolling basis" (it contradicts the
deadline). The page header's "A dedicated space at..." was reworded to "The
Wall of Honor at..." for the same reason (it claims a venue layout); Ryan can
restore the original wording by confirming the claim.

## Import-email rule (PR 3)

Publishing an entry with `imported_at` set never sends the "now on the Wall"
email. PR 3's import MUST set `imported_at`, and MUST import entries
UNPUBLISHED (the `published_at` stamp only runs on UPDATE, so Ryan publishes
them afterward). It uses `aatc.woh_import` from a trusted context (service
role or direct SQL, never a signed-in admin). It still needs the historical
event rows (real dates and venue from Ryan) before it can run; nothing is
invented.

## PR 3 scope

Print export and the WordPress import, per the rule above.
