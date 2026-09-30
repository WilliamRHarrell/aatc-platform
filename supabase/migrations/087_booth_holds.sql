-- Migration 087: booth holds.
--
-- Ryan, 2026-09-29 (design note docs/superpowers/plans/2026-09-29-floor-plan-and-booth-map.md, PR 2):
--   - a hold names who it is for (free text), optionally linked to one
--     application or one sponsorship;
--   - every hold has an end (held_until is required);
--   - an expired hold is released automatically;
--   - assign_booths() refuses a booth under an active hold, unless the hold
--     is linked to the very application being assigned (then the assignment
--     consumes the hold).
--
-- ACTIVE HOLD = held_for is not null and held_until > now(). Every reader
-- applies that rule, so a hold stops counting the moment it expires; no job
-- has to run first. release_expired_booth_holds() only tidies the columns
-- afterwards (called daily by the lifecycle-sweep cron).
--
-- 086 is applied and is not edited: assign_booths() is replaced here.
-- Policies on booths are NOT changed (verify_087 A re-asserts the three).
-- APPLY BEFORE MERGING the PR that ships the hold controls.

begin;

alter table public.booths
  add column if not exists held_for                text,
  add column if not exists held_for_application_id uuid references public.applications on delete set null,
  add column if not exists held_for_sponsorship_id uuid references public.sponsorships  on delete set null,
  add column if not exists held_until              timestamptz,
  add column if not exists held_by                 uuid,
  add column if not exists held_at                 timestamptz;

comment on column public.booths.held_for is 'Who the booth is held for (shown on the map and in Assign Booth). NULL = not held. See 087.';
comment on column public.booths.held_until is 'When the hold ends. Required with held_for. A hold with held_until <= now() no longer counts.';

-- A hold is all or nothing, and names someone.
alter table public.booths drop constraint if exists booths_hold_complete;
alter table public.booths add constraint booths_hold_complete check (
  (held_for is null and held_until is null and held_for_application_id is null
     and held_for_sponsorship_id is null and held_by is null and held_at is null)
  or (held_for is not null and btrim(held_for) <> '' and held_until is not null)
);
-- At most one link.
alter table public.booths drop constraint if exists booths_hold_one_link;
alter table public.booths add constraint booths_hold_one_link check (
  num_nonnulls(held_for_application_id, held_for_sponsorship_id) <= 1
);
-- An assigned booth is not held (assigning clears the hold in the same statement).
alter table public.booths drop constraint if exists booths_hold_not_assigned;
alter table public.booths add constraint booths_hold_not_assigned check (
  application_id is null or held_for is null
);

create index if not exists booths_held_idx on public.booths (event_id, held_until) where held_for is not null;

-- ── hold_booth: set or replace a hold ────────────────────────
create or replace function public.hold_booth(
  p_booth_id uuid, p_held_for text, p_held_until timestamptz,
  p_application_id uuid default null, p_sponsorship_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare v_booth record;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if btrim(coalesce(p_held_for, '')) = '' then
    raise exception 'a hold needs a name (who it is for)' using errcode = 'check_violation';
  end if;
  if p_held_until is null or p_held_until <= now() then
    raise exception 'a hold needs an end date in the future' using errcode = 'check_violation';
  end if;
  if p_application_id is not null and p_sponsorship_id is not null then
    raise exception 'link a hold to an application or a sponsorship, not both' using errcode = 'check_violation';
  end if;

  select id, event_id, booth_number, is_sellable, house_use, application_id
    into v_booth from public.booths where id = p_booth_id for update;
  if not found then
    raise exception 'booth not found' using errcode = 'P0002';
  end if;
  if not v_booth.is_sellable then
    raise exception 'booth #% is not sellable%', v_booth.booth_number, coalesce(' (' || v_booth.house_use || ')', '')
      using errcode = 'check_violation';
  end if;
  if v_booth.application_id is not null then
    raise exception 'booth #% is already assigned; release it in Assign Booth first', v_booth.booth_number
      using errcode = 'check_violation';
  end if;
  if p_application_id is not null
     and not exists (select 1 from public.applications where id = p_application_id and event_id = v_booth.event_id) then
    raise exception 'that application is not in this booth''s event' using errcode = 'check_violation';
  end if;
  if p_sponsorship_id is not null
     and not exists (select 1 from public.sponsorships where id = p_sponsorship_id and event_id = v_booth.event_id) then
    raise exception 'that sponsorship is not in this booth''s event' using errcode = 'check_violation';
  end if;

  update public.booths
     set held_for = btrim(p_held_for), held_until = p_held_until,
         held_for_application_id = p_application_id, held_for_sponsorship_id = p_sponsorship_id,
         held_by = auth.uid(), held_at = now()
   where id = p_booth_id;
end $$;

-- ── release_booth_hold ───────────────────────────────────────
create or replace function public.release_booth_hold(p_booth_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.booths
     set held_for = null, held_until = null, held_for_application_id = null,
         held_for_sponsorship_id = null, held_by = null, held_at = null
   where id = p_booth_id;
  if not found then
    raise exception 'booth not found' using errcode = 'P0002';
  end if;
end $$;

-- ── release_expired_booth_holds: tidy-up for the daily cron ──
-- Expired holds already count as released; this only clears the columns.
create or replace function public.release_expired_booth_holds()
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare n int;
begin
  update public.booths
     set held_for = null, held_until = null, held_for_application_id = null,
         held_for_sponsorship_id = null, held_by = null, held_at = null
   where held_for is not null and held_until <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ── assign_booths: 086 plus holds ────────────────────────────
create or replace function public.assign_booths(p_application_id uuid, p_booth_numbers text[])
returns text[]
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_app   record;
  v_slots int;
  v_nums  text[];
  v_bad   text;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select id, event_id, status, booth_size,
         artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty
    into v_app
    from public.applications
   where id = p_application_id
     for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if v_app.status <> 'approved' then
    raise exception 'only an approved application can be assigned booths' using errcode = 'check_violation';
  end if;
  if v_app.event_id is null then
    raise exception 'application has no event' using errcode = 'check_violation';
  end if;

  -- Trimmed, blanks dropped, input order kept.
  v_nums := coalesce(
    (select array_agg(btrim(n) order by ord)
       from unnest(p_booth_numbers) with ordinality as u(n, ord)
      where btrim(coalesce(n, '')) <> ''),
    '{}');

  if cardinality(v_nums) <> (select count(distinct x) from unnest(v_nums) as x) then
    raise exception 'the same booth number is listed more than once' using errcode = 'check_violation';
  end if;

  -- Slots paid for. Mirrors boothSlotCount() in src/lib/booth-display.ts
  -- (2026 rows: booth_size; 2027 rows: qty columns, a double = 2 slots);
  -- booth-slots.test.ts keeps the two in step. FEWER booths than slots is
  -- allowed on purpose: half of a double can be placed now, the rest later.
  v_slots := case v_app.booth_size
               when 'single' then 1 when 'double' then 2 when 'triple' then 3 when 'quad' then 4
               else coalesce(v_app.artist_single_qty, 0) + coalesce(v_app.artist_double_qty, 0) * 2
                  + coalesce(v_app.vendor_single_qty, 0) + coalesce(v_app.vendor_double_qty, 0) * 2
             end;
  if cardinality(v_nums) > v_slots then
    raise exception 'this application has % booth slot(s); % booths were given', v_slots, cardinality(v_nums)
      using errcode = 'check_violation';
  end if;

  -- Lock this application's booths and the targets, in this event only.
  perform 1 from public.booths b
   where b.event_id = v_app.event_id
     and (b.application_id = p_application_id or b.booth_number = any(v_nums))
     for update;

  v_bad := (select string_agg('#' || n, ', ' order by n)
              from unnest(v_nums) as n
             where not exists (select 1 from public.booths b
                                where b.event_id = v_app.event_id and b.booth_number = n));
  if v_bad is not null then
    raise exception 'booth % does not exist for this event', v_bad using errcode = 'P0002';
  end if;

  -- Not sellable (042): house booths and numbers that are not on the floor.
  -- To sell one, confirm it and set its is_sellable = true; do not weaken this.
  v_bad := (select string_agg('#' || b.booth_number || coalesce(' (' || b.house_use || ')', ''), ', ' order by b.booth_number)
              from public.booths b
             where b.event_id = v_app.event_id and b.booth_number = any(v_nums) and not b.is_sellable);
  if v_bad is not null then
    raise exception 'booth % is not sellable', v_bad using errcode = 'check_violation';
  end if;

  v_bad := (select string_agg('#' || b.booth_number || ' (' || coalesce(a.business_name, 'another exhibitor') || ')', ', ' order by b.booth_number)
              from public.booths b
              left join public.applications a on a.id = b.application_id
             where b.event_id = v_app.event_id and b.booth_number = any(v_nums)
               and b.application_id is not null and b.application_id <> p_application_id);
  if v_bad is not null then
    raise exception 'booth % is already assigned', v_bad using errcode = 'check_violation';
  end if;

  -- 087: an ACTIVE hold blocks everyone except the application it is linked to.
  v_bad := (select string_agg('#' || b.booth_number || ' (held for ' || b.held_for || ' until '
                              || to_char(b.held_until at time zone 'America/New_York', 'Mon FMDD, YYYY') || ')',
                              ', ' order by b.booth_number)
              from public.booths b
             where b.event_id = v_app.event_id and b.booth_number = any(v_nums)
               and b.held_for is not null and b.held_until > now()
               and b.held_for_application_id is distinct from p_application_id);
  if v_bad is not null then
    raise exception 'booth % is on hold; release the hold first', v_bad using errcode = 'check_violation';
  end if;

  -- Release what this application holds and is not keeping, then assign.
  update public.booths
     set application_id = null, status = 'available'
   where application_id = p_application_id
     and not (event_id = v_app.event_id and booth_number = any(v_nums));

  -- Assigning consumes the booth's hold (this application's, or an expired one).
  update public.booths
     set application_id = p_application_id, status = 'reserved',
         held_for = null, held_until = null, held_for_application_id = null,
         held_for_sponsorship_id = null, held_by = null, held_at = null
   where event_id = v_app.event_id and booth_number = any(v_nums);

  return coalesce(
    (select array_agg(b.booth_number order by length(b.booth_number), b.booth_number)
       from public.booths b where b.application_id = p_application_id),
    '{}');
end $$;

comment on function public.assign_booths(uuid, text[]) is
  'Assign Booth (086, holds 087): replaces an approved application''s booths with the given numbers in one transaction, in that application''s event. Refuses non-admins, unknown numbers, not-sellable booths, booths assigned to another application, booths under an active hold for anyone else, duplicates, and more booths than the application paid for. An empty array releases every booth.';

revoke execute on function public.hold_booth(uuid, text, timestamptz, uuid, uuid) from public, anon;
grant  execute on function public.hold_booth(uuid, text, timestamptz, uuid, uuid) to authenticated;
revoke execute on function public.release_booth_hold(uuid) from public, anon;
grant  execute on function public.release_booth_hold(uuid) to authenticated;
revoke execute on function public.release_expired_booth_holds() from public, anon, authenticated;
grant  execute on function public.release_expired_booth_holds() to service_role;
-- assign_booths keeps 086's grants (create or replace preserves them); restated for the grant audit.
revoke execute on function public.assign_booths(uuid, text[]) from public, anon;
grant  execute on function public.assign_booths(uuid, text[]) to authenticated;

commit;
