-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass. Block Z is the only select.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
--
-- WRITES fixtures and removes them, inside the block that needs them.
-- ============================================================

-- ── A. anon cannot read findings ────────────────────────────
-- Findings name which sponsor is not getting what they paid for. Asserted as an
-- OUTCOME, because "anon cannot see it" has two failure modes - zero rows, or
-- 42501 if the grant is revoked - and only the outcome is the requirement.
do $$
declare
  v_granted boolean;
begin
  v_granted := exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'placement_check_runs'
       and grantee = 'anon' and privilege_type = 'SELECT');
  if v_granted then
    raise exception 'A FAIL: anon holds SELECT on placement_check_runs.';
  end if;
  raise notice 'A PASS: no anon select grant.';
end $$;


-- ── B. an errored run cannot claim an empty finding set ─────
-- THE BOUNDARY, and it is not decorative. A failed run has measured nothing. If
-- it could store status 'error' with no reason, the dashboard would show
-- "errored" with nowhere to look, and a run recording zero findings after a
-- failure would read as all-clear to the email diff - suppressing an alert about
-- findings that are still live.
do $$
declare
  v_id uuid;
begin
  -- Leg 1, positive control: a normal ok run inserts fine. Without this, a
  -- constraint that rejected everything would pass leg 2 and look correct.
  insert into public.placement_check_runs (status) values ('ok') returning id into v_id;

  -- Leg 2: error with no message is refused.
  begin
    insert into public.placement_check_runs (status) values ('error');
    raise exception 'B FAIL leg 2: stored an errored run with no reason.';
  exception
    when check_violation then null;
  end;

  -- Leg 3: error WITH a message is accepted.
  insert into public.placement_check_runs (status, error_message)
       values ('error', 'verify_067 fixture');

  -- Leg 4: whitespace is not a reason.
  begin
    insert into public.placement_check_runs (status, error_message) values ('error', '   ');
    raise exception 'B FAIL leg 4: accepted whitespace as an error reason.';
  exception
    when check_violation then null;
  end;

  -- Teardown, with the last leg that needs the fixtures, and it ASSERTS.
  delete from public.placement_check_runs where id = v_id;
  delete from public.placement_check_runs where error_message = 'verify_067 fixture';

  if exists (select 1 from public.placement_check_runs where error_message = 'verify_067 fixture') then
    raise exception 'B FAIL: fixtures survived cleanup.';
  end if;

  raise notice 'B PASS: four legs, fixtures removed.';
end $$;


-- ── Z. what the editor displays ─────────────────────────────
-- want: real runs only, newest first. Empty until the next 09:00 sweep.
select ran_at, status, error_message, array_length(finding_keys, 1) as findings
  from public.placement_check_runs
 order by ran_at desc
 limit 5;
