# 2026-10-10 - public Veteran badges (100)

Ryan's go 2026-10-10: "Veteran artist" / "Veteran artists" on an artist
shop's /directory card; "Veteran-owned" for a vendor; "Veteran" on an
artist. Ryan ticks each badge himself after checking with the person; none
is set from is_veteran.

## Delivered (this branch; not merged, NOT APPLIED)

- **100** `supabase/migrations/100_veteran_badges.sql`: `veteran_badges`
  (application_id cascade, artist_uid = roster uid or NULL for a vendor's
  business; one per subject), admin-only RLS; `veteran_badges_public` (ids
  only; approved, active event; artist still on the roster of an artist
  application; business badge only on a vendor).
- **verify_100**: structure, policy, grants, owners cannot write or read,
  pending hidden, only ticked artists, one per subject, wrong-kind and
  removed artists hidden. Local PASS; `--audit` PASS (153); fails before
  100; four mutants (no status filter, no vendor-only rule, no unique
  index, no roster check) each fail their block.
- Admin: "Show a public Veteran badge" per artist and "Show a public
  Veteran-owned badge" for a vendor, in the editor (saved with the
  application, `syncVeteranBadges`) and on the booth page (saved at once).
- Badge (`src/components/VeteranBadge.tsx`): text label plus a small gold
  flag, aria-hidden, stripes and a plain canton, no stars. On /directory
  (shop or vendor card), /directory/artists, the profile, the VIP page and
  the homepage featured cards.

Read-only answer for Ryan: Joey Spindler Tattoos is approved with its roster
complete, but its $700 invoice has $0 paid and no deposit, no comp, no
override, so it is off the directory until the 25% deposit ($175) is paid or
an override is set.

Current veteran-discount applications (2026-10-10, for Ryan to decide each):
Chop Shop Tattoo, Downtown Ink, Joey Spindler Tattoos (artists); Henna
Warrior LLC, Rhino's Exotic Wooden Pipes (vendors).

`npm test` 383 passed, `npm run build` passed.
