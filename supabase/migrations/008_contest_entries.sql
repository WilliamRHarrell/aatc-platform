-- ============================================================
-- AATC Platform — Migration 008: Contest entries + voting
-- Run this in Supabase: Dashboard → SQL Editor → New query
-- ============================================================

-- Nominees/finalists for each contest category
create table contest_entries (
  id              uuid primary key default gen_random_uuid(),
  contest_id      uuid not null references contests on delete cascade,
  collector_name  text not null,
  artist_name     text,
  photo_url       text,
  created_at      timestamptz not null default now()
);

create index contest_entries_contest_id_idx on contest_entries (contest_id);

-- One vote per contest per visitor (voter_token = UUID from localStorage)
create table contest_votes (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references contest_entries on delete cascade,
  contest_id    uuid not null,
  voter_token   text not null,
  created_at    timestamptz not null default now(),
  unique (contest_id, voter_token)
);

create index contest_votes_entry_id_idx   on contest_votes (entry_id);
create index contest_votes_contest_id_idx on contest_votes (contest_id);

-- RLS
alter table contest_entries enable row level security;
alter table contest_votes    enable row level security;

create policy "contest_entries: public read"
  on contest_entries for select using (true);

create policy "contest_entries: admin write"
  on contest_entries for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "contest_votes: public insert"
  on contest_votes for insert to anon, authenticated
  with check (true);

create policy "contest_votes: admin read"
  on contest_votes for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Storage bucket for contest entry photos (public)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('contest-photos', 'contest-photos', true, 10485760, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;

create policy "contest-photos: public read"
  on storage.objects for select
  using (bucket_id = 'contest-photos');

create policy "contest-photos: admin insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'contest-photos' and
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "contest-photos: admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'contest-photos' and
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
