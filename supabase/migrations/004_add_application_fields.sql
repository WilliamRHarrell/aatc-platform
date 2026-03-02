-- ============================================================
-- Add additional fields to applications table
-- + create storage bucket for uploaded documents
-- ============================================================

-- ── New columns ───────────────────────────────────────────────
alter table applications
  add column if not exists facebook      text,
  add column if not exists other_links   text,
  add column if not exists tv_show       text,
  add column if not exists id_doc_url    text,
  add column if not exists veteran_id_url text;

-- ── Storage bucket ────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-docs',
  'application-docs',
  false,
  52428800,  -- 50 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- ── Storage RLS policies ──────────────────────────────────────
-- Authenticated users can upload into their own folder
create policy "application-docs: authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'application-docs');

-- Users can read files in their own user-id folder
create policy "application-docs: own read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'application-docs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admins can read all files
create policy "application-docs: admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'application-docs' and is_admin());
