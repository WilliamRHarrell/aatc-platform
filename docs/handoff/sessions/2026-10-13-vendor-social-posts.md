# 2026-10-13 - Vendors in the top-posts pipeline (103)

Extends docs/specs/aatc-artist-top-posts-spec.md to approved VENDORS (Ryan's
2026-10-13 go; vendors only, no food trucks or sponsors).

## Discovery that shaped it (production, read-only, 2026-10-13)

- 6 approved vendor applications on the active event; 4 pass
  booth_publicly_visible(); 3 of those have a handle (bare name, @name) -
  the view emits 3 vendors today. One out-of-gate vendor holds a full
  instagram.com URL with a ?stkn/utm query string; the normalization
  handles it (verify B2).
- Vendors never have rosters (0 in production across all statuses/events;
  the editor's planner builds artists only for artist type), so the handle
  is applications.instagram and the identity is (application_id, NULL).
- No artist-vs-vendor handle collisions today; artists win ties anyway.

## Delivered (not applied)

- **Migration 103** + verify_103: artist_social_posts.exhibitor_type
  ('artist' | 'vendor', default backfills the 62 rows; INGEST column - the
  app's Update type excludes it); the view DROPPED and RECREATED with a
  vendor arm (artist_uid NULL, display_name = business_name, same gate /
  normalization; a NULL-uid opt-out excludes the vendor) and an
  exhibitor_type column; explicit artist-wins tie-break
  (handle, exhibitor_type <> 'artist', created_at, uid). The revoke +
  service_role-only grant is REPEATED after the recreate (DROP discards
  grants and default privileges re-grant anon/authenticated) and verify_103
  re-asserts it. **verify_101 is historical from 103 on** (pre-103 view
  columns).
- **n8n DEPENDENCY (Ryan):** workflow A must pass exhibitor_type from the
  view into its upsert BEFORE the first vendor refresh, or vendor posts land
  as 'artist' and show under the wrong tab.
- **Admin page:** Artists / Vendors tabs (type=vendors param; pre-103 rows
  read as artist); vendor groups titled by business name, opt-out button
  writes the NULL-uid row; vendor caption first line
  "(shopping-bags emoji) Shop @{handle}{boothText}.", rest unchanged;
  vendor YouTube title default "Shop @{handle} | {EVENT_NAME}".
- **Editor:** vendor-section "Exclude from social reposts" checkbox manages
  the NULL-uid row (the business_veteran_badge pattern). On artist
  applications the editor still never touches NULL rows.

## Evidence

- verify:local verify_103 PASS (shape + grants after recreate, vendor gate,
  URL-with-query normalization, facebook exclusion, NULL opt-out,
  artist-wins dedupe, ingest column default + check); --audit 178/0.
- npm test 410/410 (2 new: vendor caption line, vendor YouTube title);
  npm run build compiles with all prebuild guards.

## Apply order

102 (if not yet applied) -> verify_102 -> 103 -> verify_103, each copied
from the Raw file on develop. The n8n exhibitor_type change before the
first vendor refresh.
