-- ============================================================
-- HOW TO RUN: after 082 is applied (and protect_2026_09_26.sql, for grid C),
-- paste the whole file. Read the MESSAGES pane. A failure RAISES and aborts.
--
-- ⚠  Block B builds a throwaway ZZ event with protected and unprotected
-- fixtures and removes them in the same block. It NEVER touches a real row or
-- auth.users: the owner-account cascade is exercised through the EVENT
-- cascade instead - the same path (an ON DELETE CASCADE parent deleting a
-- protected application fires the same BEFORE DELETE trigger).
-- ============================================================

-- ── A. shape  (NOTICE pane)
do $$
declare n int;
begin
  n := (select count(*) from information_schema.columns
         where table_schema = 'public' and column_name = 'is_protected' and is_nullable = 'NO'
           and table_name in ('applications', 'sponsorships'));
  if n <> 2 then raise exception 'FAIL A: is_protected missing on applications or sponsorships (found %)', n; end if;
  n := (select count(*) from pg_trigger
         where not tgisinternal and tgenabled <> 'D' and tgname in (
           'applications_refuse_protected_delete', 'sponsorships_refuse_protected_delete',
           'invoices_refuse_protected_delete', 'exhibitors_refuse_protected_delete',
           'applications_refuse_protection_change', 'sponsorships_refuse_protection_change',
           'applications_refuse_protected_insert', 'sponsorships_refuse_protected_insert'));
  if n <> 8 then raise exception 'FAIL A: expected 8 enabled protection triggers, found %', n; end if;
  raise notice 'PASS A: columns and 8 triggers present';
end $$;

-- ── B. the guard, with controls  (NOTICE pane; fixtures)
do $$
declare
  v_uid uuid; v_ev uuid; v_app_p uuid; v_app_u uuid; v_inv_p uuid; v_exh_p uuid; v_sp uuid; v_inv_s uuid; n int;
begin
  v_uid := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_uid is null then raise exception 'ABORT: RLS harness user missing'; end if;

  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 082 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', current_date, current_date, false) returning id into v_ev;

  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count, is_protected)
  values (v_ev, v_uid, 'vendor', 'ZZ VERIFY 082 PROTECTED (DELETE ME)', 'ZZ', 'zz-082-p@example.com', 50000, 'approved', 1, 0, true) returning id into v_app_p;
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
  values (v_ev, null, 'vendor', 'ZZ VERIFY 082 PLAIN (DELETE ME)', 'ZZ', 'zz-082-u@example.com', 50000, 'approved', 1, 0) returning id into v_app_u;
  insert into public.invoices (application_id, amount, amount_paid, status) values (v_app_p, 50000, 0, 'pending') returning id into v_inv_p;
  insert into public.invoices (application_id, amount, amount_paid, status) values (v_app_u, 50000, 0, 'pending');
  insert into public.exhibitors (application_id, event_id, business_name, contact_name, email, exhibitor_type)
  values (v_app_p, v_ev, 'ZZ VERIFY 082', 'ZZ', 'zz-082-p@example.com', 'vendor') returning id into v_exh_p;
  insert into public.sponsorships (event_id, sponsor_name, tier, amount, status, is_protected)
  values (v_ev, 'ZZ VERIFY 082 SPONSOR (DELETE ME)', 'brass', 0, 'pending', true) returning id into v_sp;
  insert into public.invoices (sponsorship_id, amount, amount_paid, status) values (v_sp, 10000, 0, 'pending') returning id into v_inv_s;
  if not (select is_protected from public.applications where id = v_app_p) then raise exception 'ABORT: fixture was not stored protected'; end if;

  -- B1. children of a protected record: refused
  begin delete from public.invoices where id = v_inv_p; raise exception 'FAIL B1: deleted an invoice of a protected application';
  exception when restrict_violation then raise notice 'PASS B1a: invoice of a protected application refused'; end;
  begin delete from public.exhibitors where id = v_exh_p; raise exception 'FAIL B1: deleted an exhibitor row of a protected application';
  exception when restrict_violation then raise notice 'PASS B1b: exhibitor row of a protected application refused'; end;
  begin delete from public.invoices where id = v_inv_s; raise exception 'FAIL B1: deleted an invoice of a protected sponsorship';
  exception when restrict_violation then raise notice 'PASS B1c: invoice of a protected sponsorship refused'; end;

  -- B2. the records themselves: refused
  begin delete from public.applications where id = v_app_p; raise exception 'FAIL B2: deleted a protected application';
  exception when restrict_violation then raise notice 'PASS B2a: protected application refused'; end;
  begin delete from public.sponsorships where id = v_sp; raise exception 'FAIL B2: deleted a protected sponsorship';
  exception when restrict_violation then raise notice 'PASS B2b: protected sponsorship refused'; end;

  -- B3. by cascade from a parent (the owner-account path): the whole delete is refused
  begin delete from public.events where id = v_ev; raise exception 'FAIL B3: a cascade from the parent deleted protected rows';
  exception when restrict_violation then raise notice 'PASS B3: deleting the parent (cascade) is refused as a whole'; end;
  if not exists (select 1 from public.applications where id = v_app_u) then raise exception 'FAIL B3: the refused cascade still removed a row'; end if;

  -- B4. control: an unprotected application and its invoice delete normally
  delete from public.applications where id = v_app_u;
  get diagnostics n = row_count;
  if n <> 1 or exists (select 1 from public.invoices where application_id = v_app_u) then raise exception 'FAIL B4 control: unprotected application did not delete with its invoice'; end if;
  raise notice 'PASS B4: unprotected application deletes (control)';

  -- B5. the flag from the app: the owner can edit the row (control) but not unprotect it
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  update public.applications set notes = 'ZZ owner edit' where id = v_app_p;
  begin
    update public.applications set is_protected = false where id = v_app_p;
    reset role; raise exception 'FAIL B5: an app session changed is_protected';
  exception when insufficient_privilege then null;
  end;
  reset role; perform set_config('request.jwt.claims', '', true);
  if (select notes from public.applications where id = v_app_p) is distinct from 'ZZ owner edit' then raise exception 'FAIL B5 control: the owner edit did not land'; end if;
  if not (select is_protected from public.applications where id = v_app_p) then raise exception 'FAIL B5: protection was lifted'; end if;
  raise notice 'PASS B5: owner edit lands; is_protected cannot be changed from the app';

  -- Cleanup: lift protection in SQL (auth.uid() is NULL here), then delete.
  update public.applications set is_protected = false where id = v_app_p;
  update public.sponsorships set is_protected = false where id = v_sp;
  delete from public.events where id = v_ev;
  if exists (select 1 from public.events where id = v_ev)
     or exists (select 1 from public.applications where business_name like 'ZZ VERIFY 082%')
     or exists (select 1 from public.sponsorships where sponsor_name like 'ZZ VERIFY 082%') then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS B: fixtures removed';
end $$;

-- ── C. what is protected live  (results grid; after protect_2026_09_26.sql: 2 applications, 1 sponsorship)
select 'application' as kind, id, trim(business_name) as name from public.applications where is_protected
union all
select 'sponsorship', id, sponsor_name from public.sponsorships where is_protected
order by kind, name;

-- ── Z. residue  (want zero rows)
select id, name from public.events where name like 'ZZ VERIFY 082%';
