# 2026-10-24 - Wall of Honor WordPress import (PR 3 of 3)

Plan: docs/superpowers/plans/2026-10-23-wall-of-honor-import.md (Ryan's
2026-10-24 decisions). PR 3 brings the tributes collected on WordPress onto
the new wall, gives the admin a photo picker, and adds a print export.

## Delivered (migration NOT applied)

- **Migration 106** + verify_106: imported rows (`imported_at` set) may leave
  branch and submitter name, relationship and email empty; form rows stay
  strict; `honoree_name` and `tribute` are required for every row. Publish now
  also requires a branch. Adds three inactive past events: AATC 2025 East,
  AATC 2025 West, AATC 2026 East.
- **Admin photo picker** in the `/admin/wall-of-honor` drawer: tick up to 3
  photos from the entry's folder, the tick order is the wall order, Make main
  moves one to the front, and it saves `photo_paths`. It is read-only while the
  entry is published: unpublish first, change the photos, publish again.
- **Import script** `scripts/import-woh-wordpress.mjs` and the committed
  `supabase/seeds/woh_wordpress_import_README.md`. It reads the WordPress site
  archive (the SQL dump and the uploads), writes a report, and on `--apply`
  uploads the photos and writes a one-transaction seed and a teardown.
- **Print export**: admin-only zip of the published print entries (originals
  from the private bucket, `tribute.txt` per honoree, `wall-of-honor.csv`,
  `MISSING-PHOTOS.txt` for failed downloads) and a Download print export
  button on the admin page.

## Ryan: apply 106 AFTER 105, and run the check first

106 is delivered, not applied. **BEFORE APPLYING**, run the relationship
check from its header. `submitter_relationship` is newly required for form
rows, so one dirty form row rolls the whole migration back:

```
select id, honoree_name from public.wall_of_honor_entries
where imported_at is null and btrim(submitter_relationship) = '';
```

Fix any rows it returns, then apply 106, then verify_106 per its header.
branch, submitter_name and submitter_email need no check (104 already
enforced them).

## THE PAGE MAPPING SWAP (Ryan: confirm this when you read the report)

Your brief said page 48157 = 2025 East and page 48512 = 2025 West. **The
dump's own evidence says the opposite**, so the import maps them the other
way:

- **48157 -> AATC 2025 West.** Its parent page is "AATC West" and its photos
  were uploaded 2025/09 (the September West event).
- **48512 -> AATC 2025 East.** Its parent page is "AATC East" and its photos
  were uploaded 2025/04 (the April East event).

`post_date` is the misleading field: the April-created page was rewritten for
the West wall, and the September-created page archives the East content. The
script ASSERTS both signals (parent title and majority upload month) on every
run and refuses to write anything if either disagrees. The import report opens
with this swap and its evidence. The dry run (step 3 below) is the review
gate: it uploads nothing and writes no seed, so nothing is applied before you
review the report. A wrong call at that point is a one-line swap in `PAGES`
plus a regenerated report.

## Ryan's run order

1. Merge this PR.
2. Run the BEFORE-APPLYING check above, then apply 106.
3. From YOUR checkout (with `.env.local` present), run the dry run, which is
   the default and has NO `--apply`:
   `node scripts/import-woh-wordpress.mjs --backup <backup root>`.
   The backup stays where it is (Downloads, read-only; never copy it into the
   repo, it holds the WordPress config). This writes only
   `woh-import-report/report.md`.
4. Read `woh-import-report/`: confirm the swap header, the counts, the skips,
   the Perry flag and the low-resolution main-photo warnings. `--apply`
   refuses while any BLOCKING problem is listed.
5. Re-run the same command with `--apply`. Photos upload to the private bucket
   and the seed and teardown are written. **--apply is the point where
   cleanup means the teardown, not just a regenerated report.**
6. Skim the final report.
7. Run the generated `supabase/seeds/woh_wordpress_import.sql` in a DIRECT SQL
   session. That is what makes `aatc.woh_import` trusted, so each tribute keeps
   its original consent date; from a signed-in session the seed notices and
   rolls back.
8. In `/admin/wall-of-honor`, for each imported entry: fill the branch, pick
   the photos (the new picker), and publish.

A bad run: unpublish anything on the wall, run
`supabase/seeds/woh_wordpress_import_teardown.sql` in a direct SQL session (it
deletes exactly the imported ids and fails unless every one was there), remove
the uploaded photos it lists with `scripts/remove-storage-object.mjs`, and
delete both generated files before running `--apply` again. The README has the
full steps.

## Dry-run facts (real backup, Task 3)

- 31 rows: 13 Gold Star form (2026), 6 from the 2025 East page, 12 from the
  2025 West page.
- 67 photos copied, 7 skipped (5 size variants whose originals are kept, 2
  byte-identical duplicates).
- 8 entries hold more photos than the 3-photo wall selection; the extras stay
  in the entry folder.
- 3 low-resolution main-photo warnings (Searcy, Mangiboyat, Kirker): pick
  another main photo in the picker.
- 0 blockers.

## Import rulings

- #34877 is skipped (exact duplicate of #34875).
- #34920 is folded into #34717 (Mikos): same person, empty story; its
  non-duplicate photos are added to #34717's folder.
- Both Perry entries are imported and flagged in the report and in each row's
  admin_notes: the 2025 East page entry and the 2026 form entry (#34719).
- #34889 has no email, so it never gets the publish email (imported rows never
  send it anyway).
- `consent_social` is false on every imported row.
- Life years from the 2025 page headings go into admin_notes only, never
  `service_years`.
- 8 imported tributes exceed the form's 1,500-character cap. They are imported
  verbatim, per the spec. This is a print-fit question for Ryan.

## Seed and report are git-ignored

`supabase/seeds/woh_wordpress_import.sql`, its teardown and `woh-import-report/`
embed family tributes and email addresses, so they are generated on Ryan's
machine and never committed. The README documents the flow.

## CUTOVER

docs/CUTOVER.md's "Wall of Honor media off WordPress" box stays unchecked. It
ticks on a docs PR after the import has actually run.

## Verification (this branch, 2026-10-24)

- `npm test`: Test Files 59 passed (59); Tests 440 passed (440).
- `npm run build`: exit 0 (prebuild guards and compile passed).
- `npm run verify:local -- supabase/verify/verify_106.sql`: PASS verify_106.sql
  (A1-A3, B1-B4, C and fixture removal all PASS).
- `npm run verify:local -- --audit`: 196 fixture inserts checked, 0 missing a
  required column.
