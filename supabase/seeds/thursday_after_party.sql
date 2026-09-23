-- ============================================================
-- DATA CHANGE: Thursday, April 15, 2027 after party on the programme.
--
-- Ryan asked 2026-09-23 for the Thursday kickoff (Uptown's Chicken & Waffles)
-- to exist as a schedule_items row, so /events/schedule and the tickets
-- overview show the night before doors. Today it lives only in AFTER_PARTIES
-- (src/lib/homepage-content.ts) with venue null, and the after-parties page
-- renders "Venue and details to be announced" for every night.
--
-- schedule_items.start_time is NOT NULL (migration 044), so this row cannot
-- carry a null time and no time is on record (AFTER_PARTIES has no time field
-- by design). Rather than invent one, the seed refuses to run until v_start
-- is set. Fill it in, or tell the author to make start_time nullable in a
-- later migration (070 is reserved for the after-parties change).
--
-- kind is 'programme': the 044 check constraint allows only
-- programme/contest/ceremony/tribute/seminar.
--
-- Paste into the Supabase SQL editor. Not applied by anyone but Ryan.
-- ============================================================

do $$
declare
  v_start constant time := null;   -- CONFIRM: set e.g. time '20:00' before running
  v_event uuid;
  v_title constant text := 'After Party - Uptown''s Chicken & Waffles';
  n int;
begin
  if v_start is null then
    raise exception 'CONFIRM: set v_start to the Thursday after party start time before running this seed. Nothing has been written.';
  end if;

  v_event := (select id from public.events where is_active limit 1);
  if v_event is null then raise exception 'ABORT: no active event'; end if;

  n := (select count(*) from public.schedule_items where event_id = v_event and day_date = date '2027-04-15');
  if n <> 0 then
    raise exception 'ABORT: expected no Thursday rows yet, found %. Check before running.', n;
  end if;

  insert into public.schedule_items (event_id, day_date, start_time, sort_order, title, location, kind, note, presented_by_fallback)
  values (v_event, date '2027-04-15', v_start, 0, v_title, 'Uptown''s Chicken & Waffles', 'programme',
          'Pre-convention kickoff, the night before doors open. 21+ with valid ID.', null);

  raise notice 'PASS: Thursday after party row created at % (title "%")', v_start, v_title;
end $$;

-- want: 1 row on 2027-04-15
select day_date, start_time, title, location, kind from public.schedule_items
 where day_date = date '2027-04-15' order by start_time;
