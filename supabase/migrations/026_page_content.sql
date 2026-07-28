-- Editable page content (Phase 1: prose CMS)
create table public.page_content (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  section_key text not null,
  content text,
  content_type text default 'text',     -- 'text' | 'markdown'
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id),
  unique (page_key, section_key)
);

alter table public.page_content enable row level security;

create policy "anyone reads content" on public.page_content
  for select using (true);

create policy "admins write content" on public.page_content
  for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
