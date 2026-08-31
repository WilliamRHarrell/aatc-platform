-- ============================================================
-- DATA: the 2027 Collector's Choice voting window
--
-- Paste into the Supabase SQL editor. Requires migration 061.
-- Values confirmed by Ryan, 2026-08-31.
--
--   opens   Wednesday 21 April 2027, 12:00 noon  America/New_York
--   closes  end of Friday 21 May 2027, stored EXCLUSIVELY as
--           2027-05-22T00:00:00-04:00 America/New_York
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
-- THE CLOSING VALUE IS MIDNIGHT ON THE 22nd, AND THAT IS NOT AN OFF-BY-ONE.
-- The intent is end of day on Friday 21 May. It is stored as the first instant
-- a vote is REFUSED - 2027-05-22T00:00:00-04:00 - and compared with <, so the
-- last accepted vote is at 23:59:59.999 on the 21st.
--
-- An inclusive 23:59:59 was considered and rejected. It reads more literally,
-- but it depends on the comparison staying <=, and one edit to < would silently
-- drop the final second of a thirty-day window with nothing to catch it.
-- Robustness over literalness; the comment carries the literal intent instead.
-- ============================================================

do $$
declare
  v_event uuid;
  v_name  text;
  v_open  constant timestamptz := '2027-04-21T12:00:00-04:00';
  v_close constant timestamptz := '2027-05-22T00:00:00-04:00';  -- exclusive: end of 21 May
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
       -- 31 by subtraction because the bound is exclusive midnight; the window
       -- is 30 days of voting, 21 April through 21 May inclusive.
       (voting_closes_at::date - voting_opens_at::date)  as days_to_exclusive_bound,
       public.voting_state(id)                           as state_now
  from public.events
 where id = '28a3ad3d-d843-4c7e-a80a-bf0a76b9ad0c';
