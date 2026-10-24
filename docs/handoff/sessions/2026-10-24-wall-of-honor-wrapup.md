# 2026-10-24 - Wall of Honor series wrap-up (docs only)

The post-merge, post-apply docs PR for the Wall of Honor series (#114-#120)
and the 2026-10-24 logo PR (#121). No code changes. Everything here records
what Ryan reported applied and verified; the evidence is restated in
migrations.md per its no-ranges rule.

## Recorded in this PR

- **migrations.md**: rows for 104, 105, 106, 107 (each APPLIED + VERIFIED,
  stated individually with its evidence) and 108 (APPLIED; slot row existed
  with a null image_path at apply time, the logo since uploaded). 105's
  verify block A and the verify_104 C1/C4 checks are superseded by design -
  the rows say which later verify carries the replacement. The seed table
  gains `woh_wordpress_import.sql`: **APPLIED 2026-10-23** by Ryan in a
  direct SQL session - 31 rows (AATC 2025 East 6, 2025 West 12, 2026 East
  13), all approved + unpublished at import. Do not re-run: fixed UUIDs
  refuse on the primary key. The teardown stays local and git-ignored, and
  refuses while any imported row is published.
- **Gap flagged, not filled**: migrations **101-103** (#110-#113, artist and
  vendor social posts) were never recorded in migrations.md. Their rows now
  say "status not recorded here" so the gap is visible instead of silent.
  Whoever knows their apply state records each alone, no ranges. 103's
  header requires n8n to send `exhibitor_type` before the first vendor
  refresh.
- **CUTOVER**: "Wall of Honor media off WordPress" is DONE (2026-10-23) -
  67 original photos re-hosted in the private bucket, tribute text verbatim.
- **START HERE**: refreshed to 2026-10-24 / develop 2b723a1, covering
  #109-#121 (the social-posts PRs bridged from their merge subjects, the
  Wall of Honor series, the rodeo/Veteran Ink logo PR).
- **open-items**: seven new entries (print layout on the printer's specs
  with the 8 over-length tributes noted; the TEMPORARY Veteran Ink frame;
  keyboard focus-setting; the PR 1 form a11y pass; IMAGE_TYPES
  Object.hasOwn hardening; import-script lstat + tag-strip verification,
  relevant only if the script ever runs again; the print route timeout
  note).

## Where the Wall of Honor stands

All four PRs merged, 104-107 applied and verified, the import done. The wall
is permanent and multi-year. Ryan's remaining per-row work in
/admin/wall-of-honor: fill the branch (publish refuses without it), pick the
wall photos (three imported entries have low-resolution suggested mains:
Searcy, Mangiboyat, Kirker), set crop focus where the default upper-center
crops badly, and publish. The Perry pair (2025 East page + 2026 form) is an
either/both call; both entries' admin notes point at each other. Publishing
an imported row never emails the family (`imported_at` gates it); form
submissions get the "now on the Wall" email on first publish.
