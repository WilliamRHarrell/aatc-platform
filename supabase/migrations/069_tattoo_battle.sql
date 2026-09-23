-- ============================================================
-- Migration 069: The All American Tattoo Battle.
--
-- One table (an entry per numbered bucket), one public storage bucket, one
-- RPC that keeps "at most one champion per event" atomic, and one page_images
-- slot for the Veteran Ink logo.
--
-- POLICIES ENUMERATED BEFORE WRITING (HANDOFF §4): this is a NEW table and a
-- NEW bucket, so nothing permissive exists to OR against. Related tables were
-- read for shape only: contests/contest_entries carry `using (true)` public
-- reads; page_images narrows to `active = true`. This table narrows to
-- `is_published = true`, the same idea.
--
-- Why two check constraints rather than admin discipline: "make the invalid
-- state unreachable". A published slot always has an artist and media; a
-- champion is always published. The partial unique index is the one-champion
-- guarantee; the RPC exists so the UI never races it.
--
-- No vote data of any kind is stored. Money is counted on paper on Sunday.
--
-- NOT APPLIED by the author. Ryan runs production SQL. Verify with
-- supabase/verify/verify_069.sql afterwards.
-- ============================================================

begin;

create table if not exists public.tattoo_battle_entries (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  bucket_number int  not null check (bucket_number >= 1),
  artist_name   text not null default '',
  shop_name     text not null default '',
  city_state    text not null default '',
  instagram     text not null default '',
  -- [{ type: 'image'|'video', path, poster_path? }], paths relative to the bucket
  media         jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array'),
  is_published  boolean not null default false,
  is_champion   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tattoo_battle_bucket_per_event unique (event_id, bucket_number),
  constraint tattoo_battle_publish_complete
    check (not is_published or (length(trim(artist_name)) > 0 and jsonb_array_length(media) > 0)),
  constraint tattoo_battle_champion_is_published
    check (not is_champion or is_published)
);

create unique index if not exists tattoo_battle_one_champion_per_event
  on public.tattoo_battle_entries (event_id) where is_champion;

drop trigger if exists tattoo_battle_entries_updated_at on public.tattoo_battle_entries;
create trigger tattoo_battle_entries_updated_at
  before update on public.tattoo_battle_entries
  for each row execute function handle_updated_at();

comment on table public.tattoo_battle_entries is
  'One row per Tattoo Battle bucket. Public reads see is_published rows only. No vote or money data lives here, by design.';
comment on column public.tattoo_battle_entries.media is
  'jsonb array of {type: image|video, path, poster_path?}. Paths are relative to the tattoo-battle-media bucket, like page_images.image_path.';

alter table public.tattoo_battle_entries enable row level security;

drop policy if exists "tattoo_battle: public read published" on public.tattoo_battle_entries;
create policy "tattoo_battle: public read published"
  on public.tattoo_battle_entries for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "tattoo_battle: editorial write" on public.tattoo_battle_entries;
create policy "tattoo_battle: editorial write"
  on public.tattoo_battle_entries for all
  to authenticated
  using (public.has_role(array['admin','content_editor']))
  with check (public.has_role(array['admin','content_editor']));

grant select on public.tattoo_battle_entries to anon, authenticated;
grant insert, update, delete on public.tattoo_battle_entries to authenticated;

-- ── champion RPC ─────────────────────────────────────────────
-- Returns the rows it changed so guardedWrite() can see a non-empty result.
-- null clears the champion for the active event.
create or replace function public.set_tattoo_battle_champion(p_entry_id uuid)
returns setof public.tattoo_battle_entries
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_event uuid;
begin
  if not public.has_role(array['admin','content_editor']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_entry_id is null then
    v_event := (select id from public.events where is_active limit 1);
    return query
      update public.tattoo_battle_entries
         set is_champion = false
       where event_id = v_event and is_champion
      returning *;
    return;
  end if;

  v_event := (select event_id from public.tattoo_battle_entries where id = p_entry_id);
  if v_event is null then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;

  update public.tattoo_battle_entries
     set is_champion = false
   where event_id = v_event and is_champion and id <> p_entry_id;

  return query
    update public.tattoo_battle_entries
       set is_champion = true
     where id = p_entry_id
    returning *;
end;
$$;

revoke all on function public.set_tattoo_battle_champion(uuid) from public;
grant execute on function public.set_tattoo_battle_champion(uuid) to authenticated;

-- ── storage ──────────────────────────────────────────────────
-- Mime list matches the admin file input EXACTLY (spec §3.8). HEIC is not
-- here on purpose: iOS converts to JPEG when the input does not accept HEIC.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tattoo-battle-media', 'tattoo-battle-media', true, 52428800,
        array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
on conflict (id) do nothing;

drop policy if exists "Public can read tattoo battle media" on storage.objects;
create policy "Public can read tattoo battle media"
  on storage.objects for select
  using (bucket_id = 'tattoo-battle-media');

drop policy if exists "Editorial can insert tattoo battle media" on storage.objects;
create policy "Editorial can insert tattoo battle media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tattoo-battle-media' and public.has_role(array['admin','content_editor']));

drop policy if exists "Editorial can update tattoo battle media" on storage.objects;
create policy "Editorial can update tattoo battle media"
  on storage.objects for update to authenticated
  using (bucket_id = 'tattoo-battle-media' and public.has_role(array['admin','content_editor']));

drop policy if exists "Editorial can delete tattoo battle media" on storage.objects;
create policy "Editorial can delete tattoo battle media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'tattoo-battle-media' and public.has_role(array['admin','content_editor']));

-- ── Veteran Ink logo slot (renders nothing until filled) ─────
insert into public.page_images (slug) values ('tattoo-battle-veteran-ink')
on conflict (slug) do nothing;

commit;
