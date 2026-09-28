-- ============================================================
-- DATA CHANGE: Sunday "Tattoo of the Day & Best of Show" ->
--              "Tattoo of the Day & Best in Show"
--
-- Ryan, 2026-09-28: the award is "Best in Show" everywhere (Tattoo of the Day
-- is every day; Best in Show is Sunday only). Sunday's 7:00 PM time is right
-- and is not touched. The site matches this row by title
-- (src/lib/contest-schedule.ts accepts both spellings, so the order of deploy
-- and this update does not matter).
--
-- Alternative: rename the row in /admin/schedule. Either one, not both.
-- Guarded: expects exactly one row; aborts otherwise. Re-running after it has
-- applied changes nothing and says so.
-- ============================================================
do $$
declare n int;
begin
  if exists (select 1 from public.schedule_items where day_date = date '2027-04-18' and title = 'Tattoo of the Day & Best in Show') then
    raise notice 'Already renamed; nothing to do.';
    return;
  end if;
  update public.schedule_items
     set title = 'Tattoo of the Day & Best in Show'
   where day_date = date '2027-04-18' and title = 'Tattoo of the Day & Best of Show';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Expected to rename exactly 1 row, renamed % - nothing changed', n; end if;
  raise notice 'Renamed 1 row.';
end $$;

-- Check (want one row, the new title, 19:00):
select day_date, start_time, title, location from public.schedule_items
 where day_date = date '2027-04-18' and title ilike '%show%';
