-- ============================================================
-- AATC Platform — Migration 005: Seed booths (1–267)
-- Run this in Supabase: Dashboard → SQL Editor → New query
-- ============================================================

do $$
declare
  v_event_id uuid;
begin
  -- Get the active event; create it if none exists
  select id into v_event_id
  from events
  where is_active = true
  limit 1;

  if v_event_id is null then
    insert into events (name, venue, city, state, start_date, end_date, is_active)
    values (
      'All American Tattoo Convention 2027',
      'Crown Complex Event Center',
      'Fayetteville',
      'NC',
      '2027-04-16',
      '2027-04-18',
      true
    )
    returning id into v_event_id;
  end if;

  -- Delete existing booth rows for this event so migration is idempotent
  delete from booths where event_id = v_event_id;

  -- ── Insert all 267 booths ──────────────────────────────────
  -- Corner booths (72 total):
  -- 24,29,30,35,36,41,42,47,48,53,54,59,60,65,66,71,
  -- 72,77,78,83,84,89,90,95,96,101,102,107,108,113,114,119,
  -- 120,125,126,131,132,137,138,143,144,149,150,155,156,161,
  -- 162,167,168,173,174,179,180,185,186,191,192,197,198,203,
  -- 204,209,210,215,216,221,222,227,228,234,235,240

  insert into booths (event_id, booth_number, size, is_corner)
  select
    v_event_id,
    n::text,
    'single'::booth_size,
    n = any(array[
      24,29,30,35,36,41,42,47,48,53,54,59,60,65,66,71,
      72,77,78,83,84,89,90,95,96,101,102,107,108,113,114,119,
      120,125,126,131,132,137,138,143,144,149,150,155,156,161,
      162,167,168,173,174,179,180,185,186,191,192,197,198,203,
      204,209,210,215,216,221,222,227,228,234,235,240
    ])
  from generate_series(1, 267) as n;

end;
$$;
