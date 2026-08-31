-- ============================================================
-- Migration 062: exclusivity_grants
--
-- Records negotiated exclusives so the same one cannot be sold twice. The
-- failure this exists for is a 2028 conversation in which nobody remembers that
-- the Tattoo Battle is already taken.
--
-- A NOTE RECORDS; AN INDEX PREVENTS. The unique index on (event_id, category)
-- is the whole mechanism. Without it this is a notes field with extra steps.
--
-- ⚠  INTERNAL ONLY. Exclusivity is NOT a public concept and the word
-- 'exclusive' appears nowhere on the site in connection with any sponsor.
-- Publicly the three 2027 sponsors are sponsors, one of whom additionally
-- presents the Tattoo Battle. Nothing here is rendered, ever.
--
-- WHY ITS OWN TABLE RATHER THAN A COLUMN ON sponsorships. sponsors_public is
--   select ... from sponsorships where status = 'confirmed'
-- with no column filter, so ANY column added to sponsorships is published to
-- anon the moment the row is confirmed. An is_exclusive column would have put a
-- negotiated contractual term on a public page by default. A separate table
-- cannot be reached by that view at all - the isolation is structural rather
-- than a matter of remembering to exclude it.
--
-- Requires 060 (presentation_credits).
-- ============================================================

create table if not exists public.exclusivity_grants (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,

  -- CONTROLLED LIST. Adding a category is a code change, deliberately: an
  -- exclusive nobody can name is one nobody can check against. See
  -- docs/HANDOFF.md for where to add one.
  category       text not null check (category in (
                   'on_site_supplier',
                   'accounting_presentation',
                   'tattoo_battle'
                 )),

  buyer_name     text not null check (length(trim(buyer_name)) > 0),
  credit_id      uuid references public.presentation_credits(id) on delete set null,
  sponsorship_id uuid references public.sponsorships(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- THE POINT OF THE TABLE. One buyer per category per event. A second sale of
-- the same exclusive fails at the database rather than at the show.
create unique index if not exists uq_exclusivity_category_per_event
  on public.exclusivity_grants (event_id, category);

create index if not exists idx_exclusivity_event
  on public.exclusivity_grants (event_id);

drop trigger if exists exclusivity_grants_updated_at on public.exclusivity_grants;
create trigger exclusivity_grants_updated_at
  before update on public.exclusivity_grants
  for each row execute function public.handle_updated_at();

-- ── RLS: admin only, no public path of any kind ─────────────
alter table public.exclusivity_grants enable row level security;

drop policy if exists "admins manage exclusivity" on public.exclusivity_grants;
create policy "admins manage exclusivity" on public.exclusivity_grants
  for all to authenticated
  using (public.has_role(array['admin','sponsorship_manager']))
  with check (public.has_role(array['admin','sponsorship_manager']));

-- Belt and braces. There is no policy for anon, so RLS already refuses it; this
-- removes the table-level grant as well, so a future policy added carelessly
-- still cannot expose it.
revoke all on public.exclusivity_grants from anon;

comment on table public.exclusivity_grants is
  'INTERNAL ONLY. Negotiated exclusives, so one cannot be sold twice. Never rendered, never in a public view, no anon grant. Deliberately a separate table rather than a column on sponsorships, because sponsors_public publishes every column of every confirmed sponsorship.';
