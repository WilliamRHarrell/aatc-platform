# 2026-10-12 - Artist top posts: migration 101, bucket SQL, verify

Spec: [docs/specs/aatc-artist-top-posts-spec.md](../../specs/aatc-artist-top-posts-spec.md)
(Sections 0-1 of it; n8n workflows and the admin page are later PRs).

## Delivered (not applied)

- `supabase/migrations/101_artist_social_posts.sql`:
  - `artist_repost_opt_outs` - admin-only opt-out rows keyed
    (application_id, artists[].uid); NULL uid = the whole application.
    The veteran_badges pattern; a roster flag was rejected for 098's reason
    (owner-writable, wiped by roster rebuilds).
  - `artist_social_handles_v` - n8n's input. One row per publicly listed
    roster artist with a normalized Instagram handle (trim, URL and @
    stripped, lowercased; facebook.com values dropped; dedupe by handle,
    earliest application wins with an explicit order by). Gate REUSED from
    the directory: `public.booth_publicly_visible(application_id)` (089)
    plus active event + exhibitor_type = 'artist'. security_invoker,
    readable by service_role ONLY (Supabase default privileges would have
    granted anon/authenticated; the revoke is load-bearing).
  - `artist_social_posts` - scraped top posts. Upsert key
    (platform, shortcode); `application_id` is on delete SET NULL so sent
    history survives; admin select/update only, inserts are service-role.
  - `artist_scrape_runs` - one row per handle, why an artist has nothing.
- `supabase/seeds/artist_posts_bucket.sql` (Ryan runs it, separate from the
  migration): PRIVATE `artist-posts` bucket, 50 MB,
  jpeg/png/webp/mp4/quicktime (matching tattoo-battle-media, Ryan
  2026-10-12), `on conflict (id) do nothing`, self-check DO block, no
  storage.objects policies on purpose (signed URLs + service key only).
- `supabase/verify/verify_101.sql`.

## Decisions (Ryan, 2026-10-12)

- The view uses the SAME gate as the public directory (approved +
  needs_roster=false + deposit paid / directory_override / comped_at),
  reused through `booth_publicly_visible()`, not copied.
- Roster artists only - no fallback row for roster-less applications with an
  application-level handle.
- No DB trigger guard for ingest vs state columns (n8n sends column lists);
  verify C2 pins the behavior the split protects.
- Opt-out admin control goes in the application editor beside the VIP /
  veteran controls - Section 4 work, not this migration.

## Evidence

- `npm run verify:local -- supabase/verify/verify_101.sql`: PASS (A-E, all
  notices), after 2 fixture fixes: comped_at is stripped on insert so the
  fixture comps through `set_comp()` as the admin, and same-transaction
  fixtures share now() so app2's created_at is bumped to break the dedupe
  tie.
- `npm run verify:local -- --audit`: 168 fixture inserts, 0 missing a
  required column.
- Production read-only checks (service key, REST, 2026-10-12): 17 approved
  artist applications on the active event; 6 pass the directory gate; 14
  roster artists with handles behind the gate. Handle formats are clean
  (bare names, some capitalized; one `@name` at application level on a
  roster-less app; no URLs or facebook links). Comp representations: Adu Ink
  comped_at + directory_override + deposit; Pennyboy and Chop Shop comped_at
  + directory_override; Sir George comped_at ONLY - verify B5 covers that
  pure-comp path via set_comp.

## Discovery notes (Section 0 of the spec)

- No artist table exists: an artist is (application_id, artists[].uid)
  (098). Handles live at `applications.artists[].instagram`; an
  application-level `applications.instagram` also exists.
- "Approved" lives on the application (`status = 'approved'`); public
  surfaces add the active event and the deposit/override/comp gate.
- Booth number is on `public.booths.booth_number` via
  `booths.application_id` (an application can hold several booths; the view
  aggregates them into booth_label).
- Policies on applications / booths / events enumerated from the
  verify:local replay before writing; none changed.
