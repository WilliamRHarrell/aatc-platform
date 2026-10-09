-- ============================================================
-- HOW TO RUN: after 095 is applied, paste the whole file. Read the MESSAGES
-- pane; a failure RAISES. Block B writes one fixture in an INACTIVE event
-- "ZZ VERIFY 095 (DELETE ME)" and deletes it.
-- ============================================================

-- ── A. the column  (NOTICE pane)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sponsorships'
                  and column_name = 'applicant_notes' and data_type = 'text' and is_nullable = 'YES') then
    raise exception 'FAIL A: sponsorships.applicant_notes (nullable text) missing';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sponsors_public' and column_name = 'applicant_notes') then
    raise exception 'FAIL A: applicant_notes leaked into sponsors_public';
  end if;
  if has_column_privilege('anon', 'public.sponsorships', 'applicant_notes', 'select') then
    raise exception 'FAIL A: anon can read applicant_notes';
  end if;
  raise notice 'PASS A: nullable text, not in sponsors_public, not readable by anon';
end $$;

-- ── B. a linked sponsor cannot rewrite it  (NOTICE pane)
do $$
declare v_harness uuid; v_event uuid; v_sp uuid; v_after text;
begin
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_harness is null then raise exception 'ABORT: RLS harness user missing'; end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 095 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false) returning id into v_event;
  insert into public.sponsorships (event_id, sponsor_name, tier, amount, status, user_id, applicant_notes, notes)
  values (v_event, 'ZZ VERIFY 095 SPONSOR (DELETE ME)', 'brass', 0, 'pending', v_harness, 'from the form', 'staff only') returning id into v_sp;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  update public.sponsorships set applicant_notes = 'rewritten', phone = '555' where id = v_sp;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- The allowed field DID change: the update ran, and only the clamp held applicant_notes.
  if (select phone from public.sponsorships where id = v_sp) is distinct from '555' then
    raise exception 'FAIL B: the owner update did not run at all (phone unchanged), so this proves nothing';
  end if;
  v_after := (select applicant_notes from public.sponsorships where id = v_sp);
  if v_after is distinct from 'from the form' then raise exception 'FAIL B: the sponsor rewrote applicant_notes (now %)', v_after; end if;
  raise notice 'PASS B: a linked sponsor cannot change applicant_notes (049 allow-list)';

  delete from public.sponsorships where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 095 (DELETE ME)') then raise exception 'FAIL: fixtures not removed'; end if;
  raise notice 'PASS B: fixtures removed';
end $$;

-- ── C. where notes live now  (RESULTS pane; want applicant_notes 0 right after applying)
select count(*) filter (where coalesce(btrim(notes), '') <> '')           as with_internal_notes,
       count(*) filter (where coalesce(btrim(applicant_notes), '') <> '') as with_applicant_notes,
       count(*)                                                           as sponsorships
  from public.sponsorships;
