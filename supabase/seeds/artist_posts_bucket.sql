-- ============================================================
-- artist-posts storage bucket (goes with migration 101; Ryan runs this in
-- the Supabase SQL Editor, copied from the Raw file on develop).
-- Spec: docs/specs/aatc-artist-top-posts-spec.md §1d.
--
-- PRIVATE bucket for rehosted Instagram media. No storage.objects policies
-- on purpose: no anon or authenticated path exists. n8n writes with the
-- service key; the admin page reads through signed URLs minted server-side.
-- Limits match tattoo-battle-media: 50 MB, jpeg/png/webp/mp4/quicktime
-- (Ryan, 2026-10-12). Re-running is safe (on conflict do nothing).
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artist-posts', 'artist-posts', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

-- Read-back: the bucket is private with the intended limits, and nothing in
-- storage.objects' policies mentions it. A failure RAISES in the MESSAGES
-- pane; fix before going on.
do $$
declare b record;
begin
  select public, file_size_limit, allowed_mime_types into b
    from storage.buckets where id = 'artist-posts';
  if not found then raise exception 'FAIL: artist-posts bucket missing'; end if;
  if b.public then raise exception 'FAIL: artist-posts is public'; end if;
  if b.file_size_limit is distinct from 52428800 then
    raise exception 'FAIL: artist-posts file_size_limit is % (expected 52428800)', b.file_size_limit;
  end if;
  if b.allowed_mime_types is distinct from
     array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'] then
    raise exception 'FAIL: artist-posts allowed_mime_types are %', b.allowed_mime_types;
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'storage' and tablename = 'objects'
                and (coalesce(qual, '') like '%artist-posts%'
                     or coalesce(with_check, '') like '%artist-posts%')) then
    raise exception 'FAIL: a storage.objects policy mentions artist-posts (none should)';
  end if;
  raise notice 'PASS: artist-posts is private, 50 MB, jpeg/png/webp/mp4/quicktime, no object policies';
end $$;
