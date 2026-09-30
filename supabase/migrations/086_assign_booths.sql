-- Migration 086: assign_booths() - Assign Booth as one checked transaction.
--
-- Before this, /admin/booths/[id] assigned booths with a series of separate
-- browser-side updates: clear this application's booths, then update each
-- chosen booth. Found 2026-09-29 (design note
-- docs/superpowers/plans/2026-09-29-floor-plan-and-booth-map.md):
--   - it read EVERY event's booths and matched numbers in the browser, so a
--     second year's seed (same numbers 1-267) would assign the wrong rows;
--   - it never checked booths.is_sellable, so the Help Desk (108) could be
--     sold (042's comment warned about exactly this);
--   - nothing capped the count at what the application paid for;
--   - a failure between "clear" and "assign" left the exhibitor with no
--     booths and the old ones released.
--
-- APPLY THIS BEFORE MERGING THE PR THAT SHIPS IT: the page calls this
-- function, so merging first breaks assigning until it is applied.
--
-- Policies on booths are NOT changed. Live set, from migrations 042/043/075
-- (verify_086 A asserts it from pg_policies):
--   "booths: public read deposit-paid"  select  anon, authenticated
--   "booths: own read"                  select  authenticated
--   "booths: admin write"               all     authenticated  is_admin()

begin;

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

  -- Release what this application holds and is not keeping, then assign.
  update public.booths
     set application_id = null, status = 'available'
   where application_id = p_application_id
     and not (event_id = v_app.event_id and booth_number = any(v_nums));

  update public.booths
     set application_id = p_application_id, status = 'reserved'
   where event_id = v_app.event_id and booth_number = any(v_nums);

  return coalesce(
    (select array_agg(b.booth_number order by length(b.booth_number), b.booth_number)
       from public.booths b where b.application_id = p_application_id),
    '{}');
end $$;

comment on function public.assign_booths(uuid, text[]) is
  'Assign Booth (086): replaces an approved application''s booths with the given numbers in one transaction, in that application''s event. Refuses non-admins, unknown numbers, not-sellable booths, booths held by another application, duplicates, and more booths than the application paid for. An empty array releases every booth.';

revoke execute on function public.assign_booths(uuid, text[]) from public, anon;
grant  execute on function public.assign_booths(uuid, text[]) to authenticated;

commit;
