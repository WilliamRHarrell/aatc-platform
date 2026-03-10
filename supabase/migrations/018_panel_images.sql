-- Add image_url column to panels
alter table panels add column if not exists image_url text;

-- Create storage bucket for panel images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('panel-images', 'panel-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Public read access
create policy "Public can read panel images"
  on storage.objects for select
  using (bucket_id = 'panel-images');

-- Admin can insert panel images
create policy "Admin can insert panel images"
  on storage.objects for insert
  with check (
    bucket_id = 'panel-images'
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Admin can update panel images
create policy "Admin can update panel images"
  on storage.objects for update
  using (
    bucket_id = 'panel-images'
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Admin can delete panel images
create policy "Admin can delete panel images"
  on storage.objects for delete
  using (
    bucket_id = 'panel-images'
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );
