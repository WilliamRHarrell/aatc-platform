# 2026-10-12 - Artist top posts: Section 4 admin page (+ migration 102)

Spec: [docs/specs/aatc-artist-top-posts-spec.md](../../specs/aatc-artist-top-posts-spec.md),
superseded in places by Ryan's 2026-10-12 build prompt (no callback route;
media paths bucket-relative; identity is (application_id, artists[].uid);
opt-outs in artist_repost_opt_outs). 101 is applied; both n8n workflows are
live and write post state themselves.

## Delivered

- **Migration 102 (delivered, NOT applied)** + verify_102: `updated_at` +
  the standard trigger on artist_social_posts. Needed because "sending older
  than 15 minutes shows as Stuck - retry" had no timestamp to age against;
  n8n's outcome write, a skip and a re-send all bump it. verify_102 passed
  verify:local; the page still loads before 102 is applied (select('*')), a
  sending row just shows Stuck immediately.
- **/admin/social/artist-posts** (server-rendered, admin-only; also in the
  admin nav): grid grouped by artist (name, @handle, booth label, shop) with
  up to 5 ranked cards - signed-URL thumbnail (private bucket, service role
  used ONLY for signing, after the page's own role check), hover-play video,
  type/slide badge, likes (or "likes hidden") / comments / views, posted
  date, link to the original, first caption line, status pill with Stuck
  rule, last_error on failures. Filters: status chips, artist search (plain
  GET form), "Show dropped posts" (is_current_top5=false). Header: Refresh
  all artists, last refresh (max artist_scrape_runs.last_run_at), counts.
  Bottom: Private or not found, No posts, Opted out (with remove).
- **Send modal** (ArtistPostCards.tsx): caption prefilled from
  `defaultCaption()` (event-config dates/venue/name, PRODUCTION_HOST ticket
  domain - no literals); channels from `AATC_POSTIZ_CHANNELS`
  (src/lib/postiz-channels.ts, IG+FB default); IG collaborator checkbox
  (default on, shown only with IG); Draft default or Schedule with a
  datetime-local read as America/New_York and sent as UTC
  (`easternToUtcIso`); "Already sent" warning requiring an explicit resend
  tick.
- **Routes** (the n8n secret stays server-side):
  - POST /api/admin/artist-posts/refresh - workflow A; `{handles?}`;
    returns at once (10 s acknowledge window; a timeout still counts as
    started).
  - POST /api/admin/artist-posts/send - validate via `validateSend`
    (allow-listed channels, caption, future schedule), set
    status='sending' (admin RLS), POST workflow B with sent_by; only a call
    that never reaches n8n is marked 'failed' here - n8n writes the outcome.
  - Skip/unskip and opt-outs go straight through the browser client
    (admin RLS, guardedWrite) - the house pattern; no routes needed.
- **Editor opt-out toggle**: "Exclude from social reposts" per roster artist
  beside the VIP / veteran ticks; syncRepostOptOuts in the editor route
  mirrors syncVip but never touches whole-application (null-uid) rows, which
  belong to the admin page.
- **src/lib/artist-posts.ts** (+21 tests): boothText (Booth 126 /
  Booths 142-145 collapse / Booths 126, 142 - hyphens, not dashes: the
  em-dash prebuild guard bans every dash spelling in src/, so the caption
  deviates from the prompt's em dash), defaultCaption, easternToUtcIso
  (DST-aware, two-pass Intl), isStuckSending, mediaItems, validateSend.
- Types for the three 101 tables added to src/types/database.ts by hand
  (the 098/100 practice); artist_social_posts Insert is `never` and Update
  lists only state columns, so ingest columns cannot be written from the
  app by construction.

## Added 2026-10-13 (same PR)

- **Google Business** channel (unchecked by default; disabled "Photo posts
  only" when the post's media has no image) and a **dormant YouTube** entry,
  commented out with a placeholder id - Ryan supplies the real id, and
  uncommenting it is the only change needed: unchecked by default, disabled
  "Videos only" without a video, and an editable "YouTube title" (max 100,
  default "Tattoo by @{handle} | {EVENT_NAME}") sent as `youtube_title`.
  n8n accepts both platforms and enforces the same rules server-side.
- Channel media rules live on the entries (`requires`/`requireHint`,
  `channelUnavailable()` in postiz-channels.ts); `validateSend` takes an
  injectable channel list so the dormant YouTube rules stay tested.

## Evidence (2026-10-12)

- `npm run build` compiles (prebuild guards pass); `npm test` 404/404;
  `verify:local` verify_101 + verify_102 PASS; `--audit` 169/0.
- Policies re-read before writing (101's enumeration): the app writes only
  through "admin update" on artist_social_posts and "admin all" on
  artist_repost_opt_outs.
- Production (read-only): 62 posts across 13 handles already scraped,
  media paths bucket-relative, one private_or_not_found run, one post
  already 'sent' - the page will have real data on first load.

## Not done

- **Screenshots.** The page needs an admin session; the only local path was
  running the dev server with an auth-bypass patch over production data,
  which the permission system refused as a security weakening - rightly.
  The patch was reverted (nothing of it is committed). Ryan sees the page
  on the Vercel preview or after merge; if screenshots from Claude are
  wanted, say how you'd like it done.
- 102 must be applied (then verify_102) before the Stuck rule works from a
  real timestamp; everything else on the page works with 101 alone.
