-- ============================================================
-- DATA: the 2027 Collector's Choice voting window
--
-- Paste into the Supabase SQL editor. Requires migration 061.
-- Values confirmed by Ryan, 2026-08-31.
--
--   opens   Wednesday 21 April 2027, 12:00 noon  America/New_York
--   closes  Friday    21 May   2027, 23:59:59    America/New_York
--
-- Checked rather than taken on trust:
--   21 April 2027 IS a Wednesday.
--   It is 3 days after the show closes on Sunday 18 April, which is what gives
--   Ryan Sunday evening through Tuesday to photograph and upload winners with
--   voting shut.
--   The window is exactly 30 days, matching the term sold in the Collector's
--   Choice package.
--   US DST 2027 runs 14 March to 7 November, so BOTH dates are EDT and -04:00
--   is correct for each. This is the detail that would have been wrong if the
--   window had straddled a changeover.
--
-- ONE NOTE ON THE CLOSING BOUNDARY, since it was asked. 23:59:59 leaves a
-- one-second gap before midnight, so it only behaves as intended with an
-- INCLUSIVE comparison - which is what 061 uses (now() <= voting_closes_at).
-- An exclusive bound at 2027-05-22T00:00:00-04:00 would be marginally more
-- robust, in that it cannot be broken by someone later changing <= to <. The
-- difference is one second at the end of a 30-day window and the stated value
-- is kept, because 'closes at the end of the day' is the intent and this
-- expresses it literally.
-- ============================================================

do $$
declare
  v_event uuid;
  v_name  text;
  v_open  constant timestamptz := '2027-04-21T12:00:00-04:00';
  v_close constant timestamptz := '2027-05-21T23:59:59-04:00';
begin
  select id, name into v_event, v_name
    from public.events where is_active order by start_date limit 1;

  if v_event is null then
    raise exception 'ABORT: no active event.';
  end if;

  -- Assert the show it is being attached to, so this cannot be applied to a
  -- decoy or to next year's row by accident.
  if v_event <> '28a3ad3d-d843-4c7e-a80a-bf0a76b9ad0c' then
    raise exception 'ABORT: active event is % (%), not the 2027 show these dates were calculated against.', v_name, v_event;
  end if;

  update public.events
     set voting_opens_at = v_open, voting_closes_at = v_close
   where id = v_event;

  raise notice 'PASS: voting window set for % - opens %, closes %', v_name, v_open, v_close;
end $$;

-- want: 1 row, the two timestamps, and 30 days between them.
select name,
       voting_opens_at  at time zone 'America/New_York' as opens_et,
       voting_closes_at at time zone 'America/New_York' as closes_et,
       (voting_closes_at::date - voting_opens_at::date)  as window_days,
       public.voting_state(id)                           as state_now
  from public.events
 where id = '28a3ad3d-d843-4c7e-a80a-bf0a76b9ad0c';
