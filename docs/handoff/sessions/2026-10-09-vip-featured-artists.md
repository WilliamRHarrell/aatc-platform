# 2026-10-09 - Gold Star VIP Meet & Greet featured artists (098)

Plan: docs/superpowers/plans/2026-10-09-application-editor-and-vip.md,
"VIP Meet & Greet featured artists". Ryan's go 2026-10-09.

## Delivered (this branch; not merged, NOT APPLIED)

- **098** `supabase/migrations/098_vip_featured_artists.sql`:
  - every `applications.artists` element gets a permanent, roster-unique
    `uid` (trigger `applications_roster_uid_trg`; a non-admin cannot
    introduce or duplicate one; existing rows backfilled);
  - `vip_featured_artists` (application_id cascade, artist_uid,
    display_order), RLS admin-only ("vip_featured_artists: admin all"),
    no anon grant;
  - `vip_featured_public` (security-barrier view): approved applications of
    the active event, the roster entry with that uid; artist name, shop,
    Instagram, photo (photo_url else first portfolio image), TV (mirrors
    lib/tv-show.ts), bio. No contact or ID fields.
- **verify_098**: structure, grants, backfill, uid assignment and
  preservation, forged/duplicate uids, owner cannot read or write, pending
  hidden, public fields, TV and photo fallbacks, send back and roster
  removal drop out. Local PASS; `--audit` PASS (145); mutation-tested
  (before 098; no forged-uid guard; no status filter; no TV fallback; anon
  grant on the table): each fails at its block.
- Admin: "Attending Gold Star VIP Meet & Greet" per artist in the editor
  (saved by the route, synced by uid; the form reads uids back after a
  save) and on the booth page (saved at once). `/admin/vip` (nav "VIP Meet
  & Greet", admin only): order (up/down), remove, shown/hidden status.
- `/events/vip-meet-greet` is now a server component reading the view
  (unstable_cache 60 s, tag `vip`, purged by the three admin writers); the
  three "Artist Announcement Coming Soon" placeholders are gone; the
  section is hidden while no artist is ticked.

Decisions taken here, within the plan: bio shown on the VIP page
(decision c); the order list lives at /admin/vip; only the active event.

`npm test` 375 passed, `npm run build` passed.
