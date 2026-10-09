-- ============================================================
-- Migration 098: Gold Star VIP Meet & Greet featured artists.
-- Verification: supabase/verify/verify_098.sql
-- Plan: docs/superpowers/plans/2026-10-09-application-editor-and-vip.md
--
-- Ryan (2026-10-09): a per-ARTIST "Attending Gold Star VIP Meet & Greet"
-- checkbox in admin; /events/vip-meet-greet lists checked artists (photo,
-- artist name, shop, Instagram, TV credit, bio) from APPROVED applications
-- only; sending an application back drops its artists automatically; admin
-- sets the order. Public fields only, never contact or ID information.
--
-- 1. A STABLE ARTIST ID. Roster identity was the array index. Every roster
--    element now carries a permanent `uid`, assigned by a trigger when
--    missing, kept through edits (every writer carries unknown keys:
--    editor `extra`, booth page and portal spread the entry, the portal's
--    roster completion keeps the saved entry since #101). Unique within a
--    roster. A non-admin cannot introduce a uid the row did not already
--    have (a forged or duplicated one is replaced). Existing rows are
--    backfilled here.
-- 2. vip_featured_artists: (application_id, artist_uid) with display_order.
--    Admin-only RLS. Owners and anon have no access: a flag inside
--    applications.artists would be owner-writable (088 keeps unknown keys)
--    and is wiped by any client that rebuilds the roster.
-- 3. vip_featured_public: a security-barrier view (the applications_public
--    pattern, 075) joining the table to APPROVED applications of the ACTIVE
--    event and to the roster entry with that uid. A pending application, a
--    removed artist or a deleted application drops out by itself.
--    TV mirrors src/lib/tv-show.ts artistTv(): the artist's own answer
--    (tv_featured / tv_credit), else the application's tv_show only for a
--    one-artist roster; named shows only. Photo: photo_url, else the first
--    portfolio image.
--
-- POLICIES ENUMERATED BEFORE WRITING: applications keeps every policy (own
-- read, own insert, own update, admin all, staff read directory rows); none
-- is changed. vip_featured_artists is new: one policy, below.
-- ============================================================
begin;

-- ── 1. stable artist uid ───────────────────────────────────
create or replace function public.applications_artist_uids()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare
  v_staff boolean := public.is_admin() or auth.uid() is null;
  v_old text[] := '{}';
  v_seen text[] := '{}';
  v_out jsonb := '[]'::jsonb;
  e jsonb;
  u text;
begin
  if new.artists is null or jsonb_typeof(new.artists) <> 'array' then return new; end if;
  if tg_op = 'UPDATE' and old.artists is not null and jsonb_typeof(old.artists) = 'array' then
    select coalesce(array_agg(x.value->>'uid'), '{}') into v_old
      from jsonb_array_elements(old.artists) as x(value)
     where jsonb_typeof(x.value) = 'object' and coalesce(x.value->>'uid', '') <> '';
  end if;
  for e in select value from jsonb_array_elements(new.artists) loop
    if jsonb_typeof(e) <> 'object' then v_out := v_out || jsonb_build_array(e); continue; end if;
    u := nullif(e->>'uid', '');
    if u is null or u = any(v_seen) or (not v_staff and not (u = any(v_old))) then
      u := gen_random_uuid()::text;
    end if;
    v_seen := v_seen || u;
    v_out := v_out || jsonb_build_array(e || jsonb_build_object('uid', u));
  end loop;
  new.artists := v_out;
  return new;
end $$;

revoke execute on function public.applications_artist_uids() from public, anon, authenticated;

comment on function public.applications_artist_uids is
  'Gives every applications.artists element a permanent, roster-unique uid (098). Kept through edits; a non-admin cannot introduce one.';

-- Fires after applications_roster_guard_trg (alphabetical: roster_guard < roster_uid).
drop trigger if exists applications_roster_uid_trg on public.applications;
create trigger applications_roster_uid_trg
  before insert or update of artists on public.applications
  for each row execute function public.applications_artist_uids();

-- Backfill: the trigger assigns the missing uids (run as the SQL editor: staff).
update public.applications set artists = artists
 where jsonb_typeof(artists) = 'array'
   and exists (select 1 from jsonb_array_elements(artists) as x(value)
                where jsonb_typeof(x.value) = 'object' and coalesce(x.value->>'uid', '') = '');

-- ── 2. the table ───────────────────────────────────────────
create table if not exists public.vip_featured_artists (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications on delete cascade,
  artist_uid     text not null,
  display_order  integer not null default 0,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  unique (application_id, artist_uid)
);

comment on table public.vip_featured_artists is
  'Artists attending the Gold Star VIP Meet & Greet (098): one row per checked roster artist (applications.artists[].uid). Admin only; the public reads vip_featured_public.';

alter table public.vip_featured_artists enable row level security;

drop policy if exists "vip_featured_artists: admin all" on public.vip_featured_artists;
create policy "vip_featured_artists: admin all"
  on public.vip_featured_artists for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.vip_featured_artists from anon;
grant select, insert, update, delete on public.vip_featured_artists to authenticated;

-- ── 3. the public view ─────────────────────────────────────
create or replace view public.vip_featured_public with (security_invoker = false, security_barrier = true) as
select v.id,
       v.display_order,
       coalesce(nullif(btrim(el->>'nickname'), ''), nullif(btrim(el->>'name'), '')) as artist_name,
       a.business_name as shop,
       nullif(ltrim(btrim(el->>'instagram'), '@'), '') as instagram,
       coalesce(nullif(el->>'photo_url', ''),
                case when jsonb_typeof(el->'portfolio_urls') = 'array' then nullif(el->'portfolio_urls'->>0, '') end) as photo_url,
       case
         when el->'tv_featured' = 'false'::jsonb then null
         when nullif(btrim(el->>'tv_credit'), '') is not null then btrim(el->>'tv_credit')
         when el->'tv_featured' = 'true'::jsonb then null
         when jsonb_array_length(a.artists) = 1 and a.tv_show_featured is distinct from false
           then nullif(btrim(a.tv_show), '')
         else null
       end as tv_credit,
       nullif(btrim(el->>'bio'), '') as bio
  from public.vip_featured_artists v
  join public.applications a on a.id = v.application_id
  join public.events ev on ev.id = a.event_id and ev.is_active
  cross join lateral (
    select x.value as el from jsonb_array_elements(case when jsonb_typeof(a.artists) = 'array' then a.artists else '[]'::jsonb end) as x(value)
     where jsonb_typeof(x.value) = 'object' and x.value->>'uid' = v.artist_uid
     limit 1
  ) r
 where a.status = 'approved';

comment on view public.vip_featured_public is
  'Public fields of the VIP Meet & Greet artists (098): approved applications of the active event only; no contact or ID data.';

grant select on public.vip_featured_public to anon, authenticated;

commit;
