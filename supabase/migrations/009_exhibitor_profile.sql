-- ============================================================
-- AATC Platform — Migration 009: Exhibitor profile fields
-- Run this in Supabase: Dashboard → SQL Editor → New query
-- ============================================================

-- Add logo and portfolio image fields to applications
alter table applications
  add column if not exists logo_url              text,
  add column if not exists portfolio_image_urls  text[] default '{}';

-- Storage bucket for exhibitor media (logo + portfolio images, public)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('exhibitor-media', 'exhibitor-media', true, 20971520, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;

create policy "exhibitor-media: public read"
  on storage.objects for select
  using (bucket_id = 'exhibitor-media');

create policy "exhibitor-media: admin insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'exhibitor-media' and
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "exhibitor-media: admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'exhibitor-media' and
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
