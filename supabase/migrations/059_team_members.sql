-- ============================================================
-- Migration 059: team_members
--
-- Public-facing team section on /info/about. Replaces a hardcoded array.
--
-- NO PLACEHOLDER HUMANS. That rule is the reason for this table's shape, not a
-- note attached to it. Three of the four people previously on that page did not
-- exist - Sarah Mitchell, Marcus Thompson and Jessica Rivera, shipped live as
-- named staff with invented biographies including "Veteran advocate" and
-- "Tattoo industry veteran". A fabricated head of Veterans Outreach on a page
-- aimed at Gold Star families is the version of that mistake with the most at
-- stake. Ryan's own bio also claimed he is an Army veteran. HE IS NOT. It was
-- corrected, and the corrected wording is seeded below verbatim - do not reword
-- it, because rewording is how the original claim would come back.
--
-- So: name, role and bio are NULLABLE, and a CHECK forbids publishing a row
-- that lacks them. An empty unpublished row is legal and is how a seat is held
-- open. A half-filled published row is impossible. That is the difference
-- between a placeholder and a fabrication - the seat can exist without a person
-- being invented to fill it.
--
-- Requires 050 (page-images bucket) and 054 (has_role editorial policies).
-- ============================================================

create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  role        text,
  bio         text,
  photo_path  text,                       -- object path in the page-images bucket
  sort_order  int         not null default 0,
  published   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A published member must be a whole person. Unpublished rows may be empty.
  constraint team_members_published_is_complete check (
    published = false
    or (name is not null and length(trim(name)) > 0
        and role is not null and length(trim(role)) > 0
        and bio  is not null and length(trim(bio))  > 0)
  ),

  -- Same reasoning as page_images: a photo with no alt text is invisible to
  -- exactly the people who most need it. There is no alt column because the
  -- name IS the alt text for a portrait - see the consumer.
  constraint team_members_photo_needs_name check (
    photo_path is null or (name is not null and length(trim(name)) > 0)
  )
);

create index if not exists idx_team_members_published_order
  on public.team_members (published, sort_order, created_at);

drop trigger if exists team_members_updated_at on public.team_members;
create trigger team_members_updated_at
  before update on public.team_members
  for each row execute function public.handle_updated_at();

alter table public.team_members enable row level security;

drop policy if exists "anyone reads published team members" on public.team_members;
create policy "anyone reads published team members" on public.team_members
  for select to anon, authenticated
  using (published = true);

drop policy if exists "team_members: editorial write" on public.team_members;
create policy "team_members: editorial write" on public.team_members
  for all to authenticated
  using (public.has_role(array['admin','content_editor']))
  with check (public.has_role(array['admin','content_editor']));

-- ── seed ────────────────────────────────────────────────────
-- Two real people, published, wording carried across UNCHANGED from
-- src/app/info/about/page.tsx. Two empty seats, unpublished: no name, no role,
-- no bio. Not "Coming soon" and not a job title nobody holds - an empty row is
-- honest about being empty, and the check constraint above means it cannot be
-- published until somebody real fills it in.
insert into public.team_members (name, role, bio, sort_order, published)
select * from (values
  ('Ryan Harrell', 'Founder & Director',
   'Born and raised in Fayetteville, with a large part of his family serving. Built AATC to put the tattoo community and the military community in the same room.',
   0, true),
  ('Nicole Harrell', 'Co-Founder',
   'Military brat. Her dad would still be jumping out of planes if Uncle Sam would let him.',
   1, true),
  (null, null, null, 2, false),
  (null, null, null, 3, false)
) as v(name, role, bio, sort_order, published)
where not exists (select 1 from public.team_members);

comment on table public.team_members is
  'Public team section on /info/about. name/role/bio are nullable so an unpublished seat can be held open EMPTY - no invented names, roles or bios. The check constraint makes a half-filled published row impossible. Ryan Harrell is NOT a veteran; his bio was corrected once and must not be reworded.';
