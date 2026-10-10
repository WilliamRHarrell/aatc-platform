# 2026-10-09 - directory "Featured" badge and homepage "Featured artists" (099)

Last step of docs/superpowers/plans/2026-10-09-application-editor-and-vip.md.
Ryan's go 2026-10-09 (after #105: Adu Ink featured, /admin/vip and the VIP
page checked).

## Delivered (this branch; not merged, NOT APPLIED)

- **099** `supabase/migrations/099_vip_featured_public_ids.sql`:
  `vip_featured_public` gains `application_id`, `artist_uid`,
  `in_directory` (appended; 098 columns unchanged). verify_099: exact column
  list (supersedes verify_098 block A's), anon reads the view only,
  in_directory false then true as an approved fixture becomes listed. Local
  PASS, `--audit` PASS (147); fails before 099; a mutant with in_directory
  always true fails B1.
- **Badge** "Featured" (`src/components/FeaturedBadge.tsx`): /directory
  exhibitor card (an artist there is featured), /directory/artists artist
  card and the /directory/[id] roster, by roster uid (`useVipFeatured`,
  `src/lib/vip.ts`).
- **Homepage** "Featured artists" section after the intro: content-editor
  switch `featured_artists_on` (homepage, off by default) and heading
  `featured_artists_title` in /admin/content; shown only with at least
  `MIN_FEATURED_FOR_HOMEPAGE` = 3 (`src/lib/vip-config.ts`); cards link to
  the directory profile when it is published; a link to the VIP page.
- One cached read (`src/lib/vip-server.ts`, tag `vip`) for the VIP page and
  the homepage; the three admin writers purge both paths.

`npm test` 377 passed, `npm run build` passed.
