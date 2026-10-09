# 2026-10-09 - Save the artist form's TV show Yes/No (item C of the form audit)

Branch `feat/tv-show-featured`. Found in the 2026-10-09 form audit: /apply/artist
asks "Were you featured on a tattoo TV show?" Yes/No and, on Yes, the show.
Only the name (`applications.tv_show`) was saved, so Yes with no name was lost.

## Delivered, NOT applied: migration 094

**Order: apply 094, run verify_094.sql, THEN merge.** The artist form inserts
`tv_show_featured`; deployed before the column exists, every new artist
application would fail.

- `applications.tv_show_featured` boolean, nullable, no default: true / false;
  null = not asked (vendors) or applied before 094.
- Backfill: artist rows that named a show become true. A past "No" was never
  stored, so those rows stay null.
- Not exposed to anon or `applications_public`; no policy changes.

verify_094 (read-only):
- `npm run verify:local` PASS (A, B); `--audit` PASS.
- Backfill proven with `--before 094`: a seeded artist row given a show name
  passes; the same with the backfill removed fails B.
- Block C prints yes / no / not recorded per exhibitor type.

## Code

- The artist form saves `tv_show_featured` (and the name only on Yes).
- `src/lib/tv-show.ts` `tvShowLabel()`: "Yes: <show>", "Yes (show not named)",
  "No", or nothing. Shown as "Featured on a tattoo TV show" in the
  applications drawer and on the booth detail page.
- The public directory is unchanged: it still shows the show name only.

`npm test` 310 PASS.
