-- ============================================================
-- Migration 051: pinup_entries
--
-- Primary intake for the Miss AATC Pinup Contest, which is capped at 25 places.
-- Replaces a form that recorded nothing (see commit 9e85950).
--
-- Follows the /apply/artist + panel-register intake pattern. Two things differ
-- from every existing intake in this repo and drive the design:
--
--   1. It is ANONYMOUS. /apply/artist calls supabase.auth.getUser() and refuses
--      without a session, so its protection is that you need an account. This
--      path has no such gate.
--   2. It is CAPPED, so two submissions arriving together must not both be
--      told they took the last place.
-- ============================================================

create table if not exists public.pinup_entries (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id),
  full_name      text not null,
  stage_name     text,
  email          text not null,
  phone          text not null,
  address        text,
  age_confirmed  boolean not null default false,
  notes          text,
  status         text not null default 'pending'
                 check (status in ('pending','confirmed','waitlist','withdrawn')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_pinup_entries_event_status_created
  on public.pinup_entries (event_id, status, created_at);

-- One entry per email per event. Enforced here rather than in the route: a
-- check-then-insert in application code loses the same race the capacity count
-- does. Partial, so a withdrawn entrant can re-enter.
create unique index if not exists uq_pinup_entries_event_email
  on public.pinup_entries (event_id, lower(email))
  where status <> 'withdrawn';

drop trigger if exists pinup_entries_updated_at on public.pinup_entries;
create trigger pinup_entries_updated_at
  before update on public.pinup_entries
  for each row execute function public.handle_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
alter table public.pinup_entries enable row level security;

-- SELECT is admin only. These rows are full name, email, phone and home
-- address. There is deliberately no public read, no _public view and no
-- anon-visible count - spots remaining is served by the aggregate function
-- below, which returns an integer and nothing else.
drop policy if exists "admins read pinup entries" on public.pinup_entries;
create policy "admins read pinup entries" on public.pinup_entries
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write pinup entries" on public.pinup_entries;
create policy "admins write pinup entries" on public.pinup_entries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete pinup entries" on public.pinup_entries;
create policy "admins delete pinup entries" on public.pinup_entries
  for delete to authenticated using (public.is_admin());

-- Anon may insert, as a public intake path must allow. Constrained so that a
-- direct POST to PostgREST cannot do what the API route can: status is forced
-- to 'pending' and age_confirmed must be true. Without the WITH CHECK, anyone
-- could insert themselves as 'confirmed' and skip the waitlist entirely, since
-- the route's capacity logic only runs when the route is the one writing.
drop policy if exists "anon may submit a pinup entry" on public.pinup_entries;
create policy "anon may submit a pinup entry" on public.pinup_entries
  for insert to anon, authenticated
  with check (status = 'pending' and age_confirmed = true);

-- ── capacity, atomically ────────────────────────────────────
-- Capacity is an OPERATIONAL THRESHOLD, not a data rule: entry 26 becomes
-- 'waitlist', never a rejection, because Ryan may take more at the show. That
-- is why there is no check constraint on the count.
--
-- The race: two submissions arriving together must not both read 24 and both be
-- told they are confirmed. Counting in the route cannot fix this - the count and
-- the insert would be two round trips with no lock between them.
--
-- Solution used: a transaction-scoped ADVISORY LOCK keyed on the event id,
-- taken inside a SECURITY DEFINER function, so the count and the insert are one
-- atomic unit. Chosen over a sequence because withdrawn entries must free their
-- place, which a monotonic sequence cannot express. Chosen over SERIALIZABLE
-- because it needs no retry loop in the caller. The lock is released when the
-- transaction ends, including on error.
create or replace function public.register_pinup_entry(
  p_event_id      uuid,
  p_full_name     text,
  p_email         text,
  p_phone         text,
  p_stage_name    text default null,
  p_address       text default null,
  p_notes         text default null,
  p_capacity      int  default 25
)
returns table (id uuid, status text, position int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_taken int;
  v_status text;
  v_id uuid;
begin
  if p_full_name is null or length(trim(p_full_name)) = 0
     or p_email is null or length(trim(p_email)) = 0
     or p_phone is null or length(trim(p_phone)) = 0 then
    raise exception 'full_name, email and phone are required'
      using errcode = 'check_violation';
  end if;

  -- Serialise every registration for this event. Anything else in this
  -- transaction still proceeds normally; only concurrent registrations wait.
  perform pg_advisory_xact_lock(hashtext('pinup_entry:' || p_event_id::text));

  select count(*) into v_taken
    from public.pinup_entries
   where event_id = p_event_id
     and status in ('pending','confirmed');

  v_status := case when v_taken < p_capacity then 'confirmed' else 'waitlist' end;

  insert into public.pinup_entries
    (event_id, full_name, stage_name, email, phone, address, notes, age_confirmed, status)
  values
    (p_event_id, trim(p_full_name), nullif(trim(coalesce(p_stage_name,'')),''),
     lower(trim(p_email)), trim(p_phone), nullif(trim(coalesce(p_address,'')),''),
     nullif(trim(coalesce(p_notes,'')),''), true, v_status)
  returning pinup_entries.id into v_id;

  return query select v_id, v_status, v_taken + 1;
end;
$$;

revoke all on function public.register_pinup_entry(uuid,text,text,text,text,text,text,int) from public;
grant execute on function public.register_pinup_entry(uuid,text,text,text,text,text,text,int)
  to service_role;

-- Spots remaining, as a bare integer. This is the ONLY thing about the entry
-- list that anon may learn - no names, no count of who, just how many are left.
create or replace function public.pinup_spots_remaining(p_event_id uuid, p_capacity int default 25)
returns int
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select greatest(0, p_capacity - (
    select count(*)::int from public.pinup_entries
     where event_id = p_event_id and status in ('pending','confirmed')
  ));
$$;

revoke all on function public.pinup_spots_remaining(uuid,int) from public;
grant execute on function public.pinup_spots_remaining(uuid,int) to anon, authenticated, service_role;

comment on table public.pinup_entries is
  'Miss AATC Pinup Contest intake. 25 places; entries past that are waitlisted, never rejected. Insert through register_pinup_entry(), which takes an advisory lock so concurrent submissions cannot both claim the last place.';
