# Wall of Honor WordPress import

The Wall of Honor tributes collected on WordPress (the 2026 Gold Star story
form, Gravity Forms form 81, and the two 2025 Wall of Honor pages) are
imported as **approved, unpublished** entries with `imported_at` set. Nothing
goes on the public wall until you fill in the branch, pick the photos and
publish each entry in `/admin/wall-of-honor`.

The seed is generated on your machine and is **never committed**: it holds the
families' tributes and email addresses. These paths are git-ignored:

- `supabase/seeds/woh_wordpress_import.sql` (the seed)
- `supabase/seeds/woh_wordpress_import_teardown.sql` (its undo)
- `woh-import-report/` (the report)

## Before you start

- Migrations 104, 105 and 106 are applied (106 adds the three past events the
  seed looks up by exact name: AATC 2025 East, AATC 2025 West, AATC 2026 East).
- `.env.local` in the checkout you run from has `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` (only `--apply` reads them).
- The WordPress site archive is unzipped somewhere outside the repo. The
  script only reads it. Never copy it into the repo: it contains
  `wp-config.php` with the WordPress database password.

## 1. Dry run (the default)

```
node scripts/import-woh-wordpress.mjs --backup <path to the unzipped site archive>
```

Parses the SQL dump and the uploads folder and writes
`woh-import-report/report.md`. Nothing is uploaded and no seed is written.
`--out <dir>` puts the report somewhere else.

## 2. Review the report

The report is written so you can approve the import without reading SQL:

- the row counts per source and the GF entries skipped by ruling (#34877, a
  duplicate of #34875; #34920, whose extra photos go into #34717's folder);
- the Perry pair (the 2025 page entry and GF #34719, both imported, both noted
  in admin_notes);
- per entry: the event, the original date, the email (or none), the life years
  that go to admin_notes, the tribute length, every photo copied (with size and
  quality; photo 00 is the suggested main photo) and every photo skipped with
  its reason (a WordPress size variant whose original is copied instead, or a
  byte-identical duplicate);
- the page-to-event check for the two 2025 pages;
- **BLOCKING PROBLEMS**: `--apply` refuses to run while any are listed.

## 3. Apply

```
node scripts/import-woh-wordpress.mjs --backup <path to the unzipped site archive> --apply
```

It checks the three events exist and that no import ran before, writes the
teardown, uploads every photo in the report to the private
`wall-of-honor-submissions` bucket (`<entry id>/photo-NN-<random>.<ext>`), then
writes the seed. Each run makes new entry ids, so the seed and the uploads of
one run belong together. It refuses to run while a previous run's seed or
teardown is still in `supabase/seeds/`.

## 4. Run the seed in a direct SQL session

Paste `supabase/seeds/woh_wordpress_import.sql` into the Supabase SQL editor
(or run it with psql as postgres). It must be a direct SQL session: there
`auth.uid()` is null, which is what lets `aatc.woh_import` keep each tribute's
original consent date (migration 104's guard). From a signed-in session the
dates would be overwritten; the seed checks for that and rolls back.

The seed is one transaction. A missing event, a database error or a second run
(the ids are fixed, so it fails on the primary key) aborts all of it; it never
inserts part of the import or doubles the wall.

Then, in `/admin/wall-of-honor`, for each imported entry: fill in the branch,
pick up to 3 wall photos (extras stay in the entry's folder), and publish.

## Undo

1. Unpublish any imported entry that is on the wall (that removes its public
   copies).
2. Run `supabase/seeds/woh_wordpress_import_teardown.sql` in a direct SQL
   session. It deletes exactly the imported ids and fails unless every one was
   there.
3. Remove the uploaded photos it lists, one path at a time:
   `node scripts/remove-storage-object.mjs wall-of-honor-submissions <path> --delete`.
4. Delete both generated files before running `--apply` again.

## After the import has run

docs/CUTOVER.md's "Wall of Honor media off WordPress" box stays unticked until
the import has actually run in production; tick it on a later docs PR.
