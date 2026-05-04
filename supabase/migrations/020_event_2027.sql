-- ============================================================
-- Migration 020: AATC 2027 event + booth seed
-- Run this in Supabase: Dashboard → SQL Editor → New query
-- ============================================================

-- Deactivate 2026 event
update events set is_active = false where is_active = true;

-- Insert 2027 event (idempotent via unique-ish name guard)
insert into events (name, venue, city, state, start_date, end_date, registration_open_date, is_active)
select 'All American Tattoo Convention 2027',
       'Crown Complex Event Center',
       'Fayetteville',
       'NC',
       date '2027-04-16',
       date '2027-04-28',
       date '2026-06-01',
       true
where not exists (
  select 1 from events where name = 'All American Tattoo Convention 2027'
);

-- Make sure the 2027 row is the only active one
update events set is_active = true where name = 'All American Tattoo Convention 2027';
update events set is_active = false where name <> 'All American Tattoo Convention 2027';

-- Seed 267 booths against the new event_id
do $$
declare
  v_event_id uuid;
  v_corners int[] := array[
    24,29,30,35,36,41,42,47,48,53,54,59,60,65,66,71,72,77,78,83,84,89,90,95,96,
    101,102,107,108,113,114,119,120,125,126,131,132,137,138,143,144,149,150,155,156,
    161,162,167,168,173,174,179,180,185,186,191,192,197,198,203,204,209,210,215,216,
    221,222,227,228,234,235,240
  ];
  i int;
begin
  select id into v_event_id from events where name = 'All American Tattoo Convention 2027';

  -- Skip if already seeded
  if not exists (select 1 from booths where event_id = v_event_id) then
    for i in 1..267 loop
      insert into booths (event_id, booth_number, booth_size, is_corner, is_assigned)
      values (v_event_id, i, 'single', i = any(v_corners), false);
    end loop;
  end if;
end $$;
