-- ============================================================
-- Migration 101: artist top posts (Instagram repost pipeline).
-- Spec: docs/specs/aatc-artist-top-posts-spec.md
-- Verification: supabase/verify/verify_101.sql
-- Bucket (separate SQL, Ryan runs it): supabase/seeds/artist_posts_bucket.sql
--
-- Ryan (2026-10-12):
--   * artist_social_handles_v uses the SAME gate as the public directory,
--     reused through public.booth_publicly_visible(application_id) (089):
--     approved + needs_roster = false + (deposit paid or directory_override
--     or comped_at). The view adds what the gate leaves to its callers:
--     active event and exhibitor_type = 'artist'.
--   * Roster artists only (applications.artists[].uid, 098). No fallback row
--     for roster-less applications with an application-level handle.
--   * Opt-out is a row in artist_repost_opt_outs, not a roster flag: a flag
--     inside applications.artists is owner-writable and wiped by any client
--     that rebuilds the roster (same reasoning as 098). artist_uid NULL =
--     the whole application opted out. Admin control lands in the
--     application editor beside the VIP / veteran controls (later PR).
--   * View is security_invoker with a service_role-only grant: it exists for
--     n8n, which reads it with the service key. Nothing public reads it.
--   * No DB trigger guard for the ingest/state column split; n8n's upsert
--     sends ingest columns only.
--
-- There is no artist table: an artist is a roster entry under an
-- application, identified by (application_id, artists[].uid). Tables here
-- key on that pair; handle is the durable key for posts, so sent history
-- survives an application deletion (application_id set null, rows kept).
--
-- POLICIES ENUMERATED BEFORE WRITING (pg_policies via verify:local replay,
-- 2026-10-12): applications (admin all / own insert / own read / own update /
-- staff read directory rows), booths (admin write / own read / public read
-- deposit-paid), events (admin write / public read) — none changed. The
-- three tables below are new, each with its own policies.
--
-- Supabase default privileges grant ALL on new tables and views to anon,
-- authenticated and service_role, so every REVOKE below is load-bearing.
-- ============================================================
begin;

-- ── 1. opt-out (admin-ticked, the veteran_badges pattern) ───
create table if not exists public.artist_repost_opt_outs (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications on delete cascade,
  artist_uid     text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

create unique index if not exists artist_repost_opt_outs_one_per_subject
  on public.artist_repost_opt_outs (application_id, coalesce(artist_uid, ''));

comment on table public.artist_repost_opt_outs is
  'Artists excluded from the top-posts repost pipeline (101). artist_uid = applications.artists[].uid; NULL = the whole application. Admin only.';

alter table public.artist_repost_opt_outs enable row level security;

drop policy if exists "artist_repost_opt_outs: admin all" on public.artist_repost_opt_outs;
create policy "artist_repost_opt_outs: admin all"
  on public.artist_repost_opt_outs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.artist_repost_opt_outs from anon;
revoke all on public.artist_repost_opt_outs from authenticated;
grant select, insert, delete on public.artist_repost_opt_outs to authenticated;

-- ── 2. the handles view (n8n input; service_role only) ──────
-- One row per publicly listed roster artist with a usable Instagram handle.
-- handle is normalized: trimmed, URL and @ stripped, lowercased. Facebook
-- links pasted into the IG field are dropped. Duplicate handles collapse to
-- the earliest application (explicit order: handle, created_at, uid).
-- If the shape ever changes: DROP VIEW then CREATE VIEW, never
-- CREATE OR REPLACE.
create view public.artist_social_handles_v
  with (security_invoker = true) as
select distinct on (h.handle)
       r.el->>'uid'                              as artist_uid,
       a.id                                      as application_id,
       coalesce(nullif(btrim(r.el->>'nickname'), ''),
                nullif(btrim(r.el->>'name'), '')) as display_name,
       h.handle,
       b.booth_label
  from public.applications a
  join public.events ev on ev.id = a.event_id and ev.is_active
  cross join lateral (
    select x.value as el
      from jsonb_array_elements(case when jsonb_typeof(a.artists) = 'array'
                                     then a.artists else '[]'::jsonb end) as x(value)
     where jsonb_typeof(x.value) = 'object'
       and coalesce(x.value->>'uid', '') <> ''
  ) r
  cross join lateral (
    select nullif(
             regexp_replace(
               split_part(split_part(
                 regexp_replace(lower(btrim(r.el->>'instagram')),
                                '^(https?://)?(www\.|m\.)?instagram\.com/', ''),
                 '?', 1), '/', 1),
               '^@', ''),
           '') as handle
  ) h
  left join lateral (
    select string_agg(bo.booth_number, ', ' order by bo.booth_number) as booth_label
      from public.booths bo
     where bo.application_id = a.id
  ) b on true
 where a.exhibitor_type = 'artist'
   and public.booth_publicly_visible(a.id)
   and h.handle is not null
   and btrim(coalesce(r.el->>'instagram', '')) !~* 'facebook\.com'
   and not exists (select 1 from public.artist_repost_opt_outs o
                    where o.application_id = a.id
                      and (o.artist_uid is null or o.artist_uid = r.el->>'uid'))
 order by h.handle, a.created_at, r.el->>'uid';

comment on view public.artist_social_handles_v is
  'n8n input for the top-posts refresh (101): publicly listed roster artists (booth_publicly_visible, the directory gate) of the active event with a normalized Instagram handle. service_role only.';

revoke all on public.artist_social_handles_v from public, anon, authenticated;
grant select on public.artist_social_handles_v to service_role;
-- security_invoker: the caller runs the gate function itself.
grant execute on function public.booth_publicly_visible(uuid) to service_role;

-- ── 3. the posts ─────────────────────────────────────────────
create table if not exists public.artist_social_posts (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid references public.applications on delete set null,
  artist_uid       text,
  handle           text not null,
  platform         text not null default 'instagram',
  shortcode        text not null,
  post_url         text not null,
  post_type        text check (post_type in ('image', 'video', 'carousel')),
  posted_at        timestamptz,
  likes            integer,          -- null when hidden by the owner
  comments         integer,
  views            integer,          -- reels/video only
  score            numeric,          -- computed in n8n
  rank             smallint check (rank between 1 and 5),
  is_current_top5  boolean not null default true,  -- never delete rows; dropped posts flip to false
  caption_original text,             -- reference only, never reposted
  media            jsonb not null,   -- storage paths in artist-posts, never IG CDN URLs
  scraped_at       timestamptz not null,
  -- state columns: written by admins and the callback route, never by ingest
  status           text not null default 'new'
                     check (status in ('new', 'sending', 'sent', 'skipped', 'failed')),
  admin_caption    text,
  postiz_post_id   text,
  sent_at          timestamptz,
  sent_by          uuid,
  last_error       text,
  unique (platform, shortcode)       -- n8n upsert key
);

create index if not exists artist_social_posts_handle_top5_idx
  on public.artist_social_posts (handle, is_current_top5);
create index if not exists artist_social_posts_status_idx
  on public.artist_social_posts (status);
create index if not exists artist_social_posts_application_idx
  on public.artist_social_posts (application_id);

comment on table public.artist_social_posts is
  'Top Instagram posts per artist (101), scraped by n8n. Admin reads and updates state; inserts come from the service role. media holds artist-posts storage paths only.';

alter table public.artist_social_posts enable row level security;

drop policy if exists "artist_social_posts: admin read" on public.artist_social_posts;
create policy "artist_social_posts: admin read"
  on public.artist_social_posts for select to authenticated
  using (public.is_admin());

drop policy if exists "artist_social_posts: admin update" on public.artist_social_posts;
create policy "artist_social_posts: admin update"
  on public.artist_social_posts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.artist_social_posts from anon;
revoke all on public.artist_social_posts from authenticated;
grant select, update on public.artist_social_posts to authenticated;

-- ── 4. scrape status ─────────────────────────────────────────
create table if not exists public.artist_scrape_runs (
  handle             text primary key,
  last_run_at        timestamptz not null default now(),
  result             text not null
                       check (result in ('ok', 'private_or_not_found', 'no_posts', 'error')),
  post_count_scanned integer
);

comment on table public.artist_scrape_runs is
  'Last scrape outcome per handle (101), written by n8n: lets the admin page say why an artist has nothing.';

alter table public.artist_scrape_runs enable row level security;

drop policy if exists "artist_scrape_runs: admin read" on public.artist_scrape_runs;
create policy "artist_scrape_runs: admin read"
  on public.artist_scrape_runs for select to authenticated
  using (public.is_admin());

revoke all on public.artist_scrape_runs from anon;
revoke all on public.artist_scrape_runs from authenticated;
grant select on public.artist_scrape_runs to authenticated;

commit;
