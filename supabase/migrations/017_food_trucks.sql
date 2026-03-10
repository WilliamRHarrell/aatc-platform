-- Food trucks table
create table if not exists food_trucks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  website text,
  instagram text,
  facebook text,
  cuisine_type text not null default '',
  description text not null default '',
  logo_url text,
  days text[] not null default '{}',
  thursday_setup boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add food_truck_id to invoices
alter table invoices add column if not exists food_truck_id uuid references food_trucks(id) on delete set null;

-- RLS
alter table food_trucks enable row level security;

-- Admin full access
create policy "Admin full access on food_trucks"
  on food_trucks for all
  using ((select role from profiles where id = auth.uid()) = 'admin')
  with check ((select role from profiles where id = auth.uid()) = 'admin');

-- Public read published
create policy "Public read published food_trucks"
  on food_trucks for select
  using (is_published = true);

-- Authenticated update own
create policy "Vendors update own food_truck"
  on food_trucks for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Storage bucket for logos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-truck-logos', 'food-truck-logos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Storage policies
create policy "Public read food truck logos"
  on storage.objects for select
  using (bucket_id = 'food-truck-logos');

create policy "Admin insert food truck logos"
  on storage.objects for insert
  with check (bucket_id = 'food-truck-logos' and (select role from profiles where id = auth.uid()) = 'admin');

create policy "Admin delete food truck logos"
  on storage.objects for delete
  using (bucket_id = 'food-truck-logos' and (select role from profiles where id = auth.uid()) = 'admin');

create policy "Vendors insert own food truck logos"
  on storage.objects for insert
  with check (bucket_id = 'food-truck-logos' and auth.uid() is not null);

create policy "Vendors update own food truck logos"
  on storage.objects for update
  using (bucket_id = 'food-truck-logos' and auth.uid() is not null);
