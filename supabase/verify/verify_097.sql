-- ============================================================
-- HOW TO RUN: after 097 is applied, paste the whole file. Read the MESSAGES
-- pane; a failure RAISES. Block B uses its own INACTIVE event
-- "ZZ VERIFY 097 (DELETE ME)" and deletes it (profile_edits cascade).
-- ============================================================

-- ── A. the function no longer has the NULL-unsafe owner test  (NOTICE pane)
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.log_profile_edit()'::regprocedure;
  if v_src not like '%coalesce(auth.uid() = new.user_id, false)%' then
    raise exception 'FAIL A: log_profile_edit() does not coalesce by_owner (097 not applied?)';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.applications'::regclass and tgname = 'applications_log_profile_edit_trg' and not tgisinternal) then
    raise exception 'FAIL A: applications_log_profile_edit_trg missing';
  end if;
  raise notice 'PASS A: by_owner coalesced, trigger present';
end $$;

-- ── B. admin on an UNLINKED row (the bug), owner, and service role  (NOTICE pane)
do $$
declare v_admin uuid; v_harness uuid; v_event uuid; v_app uuid; v_own uuid; n int;
begin
  v_admin   := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_admin is null or v_harness is null then raise exception 'ABORT: admin profile or RLS harness user missing'; end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 097 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false) returning id into v_event;
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, vendor_single_qty, artist_count, total_amount, status)
  values (v_event, null, 'vendor', 'ZZ VERIFY 097 UNLINKED (DELETE ME)', 'ZZ', 'zz-097@example.com', 1, 0,
          public.application_list_price('vendor', 0, 0, 1, 0, 0, 0, '[]'::jsonb, false), 'pending') returning id into v_app;
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, vendor_single_qty, artist_count, total_amount, status)
  values (v_event, v_harness, 'vendor', 'ZZ VERIFY 097 OWNED (DELETE ME)', 'ZZ', 'zz-097-own@example.com', 1, 0,
          public.application_list_price('vendor', 0, 0, 1, 0, 0, 0, '[]'::jsonb, false), 'pending') returning id into v_own;

  -- B1. a signed-in admin saves logo + name on an application with no account
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  update public.applications set logo_url = 'https://example.com/zz-097-logo.png', business_name = 'ZZ VERIFY 097 UNLINKED 2 (DELETE ME)' where id = v_app;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select logo_url from public.applications where id = v_app) is distinct from 'https://example.com/zz-097-logo.png' then
    raise exception 'FAIL B1: the admin update did not land';
  end if;
  n := (select count(*) from public.profile_edits where application_id = v_app and by_owner = false and edited_by = v_admin and field in ('logo_url', 'business_name'));
  if n <> 2 then raise exception 'FAIL B1: expected 2 staff profile_edits rows (by_owner false, edited_by admin), got %', n; end if;
  raise notice 'PASS B1: an admin edits an unlinked application; logged as a staff edit';

  -- B2. the owner edits their own row: by_owner true
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  update public.applications set instagram = 'zz097own' where id = v_own;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if not exists (select 1 from public.profile_edits where application_id = v_own and field = 'instagram' and by_owner = true and edited_by = v_harness) then
    raise exception 'FAIL B2: the owner edit was not logged with by_owner true';
  end if;
  raise notice 'PASS B2: an owner edit is logged by_owner true';

  -- B3. service role / SQL editor (no JWT) on the unlinked row: by_owner false, edited_by null
  update public.applications set phone = '000-097' where id = v_app;
  if not exists (select 1 from public.profile_edits where application_id = v_app and field = 'phone' and by_owner = false and edited_by is null) then
    raise exception 'FAIL B3: a service-role edit was not logged as staff';
  end if;
  raise notice 'PASS B3: a service-role edit is logged by_owner false';

  if exists (select 1 from public.profile_edits where by_owner is null) then raise exception 'FAIL B: a profile_edits row has by_owner NULL'; end if;

  delete from public.applications where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 097 (DELETE ME)')
     or exists (select 1 from public.profile_edits where application_id in (v_app, v_own)) then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS B: fixtures removed';
end $$;
