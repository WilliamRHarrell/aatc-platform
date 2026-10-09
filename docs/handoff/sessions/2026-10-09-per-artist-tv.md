# 2026-10-09 - TV show per artist

Ryan, after the editor PR 2 live test (2026-10-09): the editor had two TV
questions (per-artist "TV credit" and the application's Yes/No), and the
drawer did not show which artist was on the show. Decisions:
- The ARTIST is the source of truth for TV (drawer, directory, VIP).
- The application-level question is REMOVED from admin (editor and booth
  page). Existing values stay in the database.
- The public artist form asks per artist.

## Delivered (this branch; not merged, nothing applied)

- `src/lib/tv-show.ts`: `artistTv(app, i)` (own `tv_featured` / `tv_credit`,
  else the application's answer only for a one-artist roster, decision f),
  `unattributedTv(app)` (an older multi-artist Yes no artist carries),
  `publicTvShows(app)`. A PR 2 `tv_credit` without the Yes/No counts as Yes.
- Drawer roster: TV show, bio, photo per artist. The application line shows
  only "TV show (not attributed to an artist)".
- Booth page: per-artist Yes/No + show in the artist edit; its TV Show
  profile field is gone. Print sheet and booth packet PDF: TV per artist.
  Portal and directory (card and profile): per-artist shows.
- Public artist form: "Has this artist been featured on a tattoo TV show?"
  in each artist card. The application keeps `tv_show_featured` = any artist
  Yes, `tv_show` empty.
- Editor: per-artist Yes/No + show; no application-level TV.
  `planApplication` writes `tv_show_featured` / `tv_show` only when sent.
- Fix: the portal "complete your roster" panel rebuilt the roster from
  blanks, dropping bio, photo, TV, styles and portfolio (and any artist
  without a new ID upload). It now starts from the saved roster and keeps
  every key; an artist with an ID on file needs no new upload.

Production read (2026-10-09, read-only): 3 rows had an application-level
answer: an approved 1-artist row (falls back automatically), an approved
2-artist row (needs Ryan to set the artist, on the booth page), and a
pending 2-artist row with both answers (likely the ZZ editor test).

No migration, no verify. `npm test` 360 passed, `npm run build` passed.

## Order from here (Ryan, 2026-10-09)

1. This PR.
2. Editor PR 3, moved ahead of VIP: open any application in any status in
   the editor, with an "Edit in editor" button in the drawer. Ryan could not
   add documents or photos to an editor-made application after leaving the
   form (details of the failure not given). Waits for this PR to merge
   (same files; no stacked PRs).
3. Retire Add A Booth.
4. VIP Meet & Greet featured artists.
5. Directory "Featured" badge and homepage section.

The ZZ editor test teardown waits until editor PR 3 is merged (Ryan tests
uploads on the same entries first).
