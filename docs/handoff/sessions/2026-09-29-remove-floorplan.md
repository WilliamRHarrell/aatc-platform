# Session 2026-09-29: /floorplan removed (branch fix/remove-floorplan)

`src/app/floorplan/page.tsx` was `export default function FloorplanPage() {
return <div /> }`. It had been a stub since the initial setup (8468f36 "stub
empty pages"), and nothing linked to it: no ROUTES entry, no nav or footer
link, no sitemap. It rendered an empty page between the header and the
sponsor section. The route is deleted, so /floorplan returns Next's 404
(checked on a local build, 2026-09-29).

**For START HERE / open-items (next docs PR, after merge):** /floorplan is
intentionally absent. Re-add it only with a real floor plan. That needs booth
geometry first: all 267 booths are still x=0, y=0, 1x1 (docs/CUTOVER.md,
"No floor plan geometry"). When it comes back, add it to `ROUTES`, the nav
and the footer.

Found here, not changed (content decisions for Ryan):
- The apply hub copy (registry `applyHub`, step 3) says "A printable
  confirmation and floor plan are available in your exhibitor portal." The
  portal has no floor plan.
- `src/app/robots.ts` points at `/sitemap.xml`, but the app has no sitemap
  route.
