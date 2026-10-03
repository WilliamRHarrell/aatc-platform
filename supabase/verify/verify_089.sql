-- ============================================================
-- HOW TO RUN: after 089 is applied, paste the whole file. Read the MESSAGES
-- pane. A failure RAISES and aborts (the failing block rolls back).
--
-- Block A also lists the real comped applications (read only) so the mapping
-- can be checked by eye: Jane Ink booth+permits $0, Skin Reserve and Pinback
-- booth $0, Chop Shop booth with permits charged $200.
-- Block B uses its own INACTIVE event "ZZ VERIFY 089 (DELETE ME)" and deletes
-- it. Needs an admin profile and the RLS harness user.
-- ============================================================

-- ── A. shape, grants, event date, the real mapping  (NOTICE pane)
do $$
declare r record;
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'applications'
       and column_name in ('permits_comped_at', 'permits_comped_by')) <> 2 then
    raise exception 'FAIL A: permits_comped_at / permits_comped_by missing';
  end if;
  if (select permit_submission_date from public.events where name = 'All American Tattoo Convention 2027') is distinct from date '2027-03-01' then
    raise exception 'FAIL A: events.permit_submission_date is not 2027-03-01 for the 2027 event';
  end if;
  if has_function_privilege('anon', 'public.set_comp(uuid,boolean,boolean)', 'execute') then raise exception 'FAIL A: anon can execute set_comp'; end if;
  if not has_function_privilege('authenticated', 'public.set_comp(uuid,boolean,boolean)', 'execute') then raise exception 'FAIL A: authenticated cannot execute set_comp (the drawer would break)'; end if;
  if not has_function_privilege('anon', 'public.booth_publicly_visible(uuid)', 'execute') then raise exception 'FAIL A: anon lost booth_publicly_visible (the public booth policy needs it)'; end if;
  if has_function_privilege('anon', 'public.application_permit_fees(uuid)', 'execute') then raise exception 'FAIL A: anon can execute application_permit_fees'; end if;
  for r in select a.business_name, a.status, a.comped_at is not null as booth, a.permits_comped_at is not null as permits, i.amount, coalesce(i.amount_paid, 0) as paid, i.status as inv
             from public.applications a left join public.invoices i on i.application_id = a.id
            where a.comped_at is not null or a.permits_comped_at is not null order by a.business_name loop
    raise notice 'comp: % (%) booth=% permits=% invoice=% paid=% %', r.business_name, r.status, r.booth, r.permits, r.amount, r.paid, r.inv;
  end loop;
  raise notice 'PASS A: columns, event date 2027-03-01, grants (check the comp lines above against the mapping)';
end $$;

-- ── B. behaviour  (NOTICE pane; fixtures in an inactive ZZ event)
do $$
declare
  v_admin uuid; v_harness uuid; v_event uuid; v_app uuid; v_vendor uuid; v_amount int; v_inv uuid;
begin
  v_admin   := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_admin is null or v_harness is null then raise exception 'ABORT: admin profile or RLS harness user missing'; end if;

  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 089 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false) returning id into v_event;
  -- Artist double, 4 artists, 1 corner: list 120000 + 4 x 5000 + 10000 = 150000; permits 20000.
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, artist_double_qty, corner_count, artist_count, approved_at, deposit_due_at, final_due_at)
  values (v_event, v_harness, 'artist', 'ZZ VERIFY 089 ARTIST (DELETE ME)', 'ZZ', 'zz-089@example.com', 150000, 'approved', 1, 1, 4, now(), now() + interval '30 days', now() + interval '90 days')
  returning id into v_app;
  insert into public.invoices (application_id, amount, amount_paid, status) values (v_app, 150000, 0, 'pending') returning id into v_inv;
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
  values (v_event, null, 'vendor', 'ZZ VERIFY 089 VENDOR (DELETE ME)', 'ZZ', 'zz-089-v@example.com', 50000, 'approved', 1, 0)
  returning id into v_vendor;

  if public.application_permit_fees(v_app) <> 20000 then raise exception 'FAIL B0: permit fees %, expected 20000', public.application_permit_fees(v_app); end if;

  -- B1. non-admin refused
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  begin perform public.set_comp(v_app, true, true); raise exception 'FAIL B1: a non-admin comped';
  exception when insufficient_privilege then raise notice 'PASS B1: non-admin refused'; end;
  -- B2. the owner cannot set permits_comped_at directly
  update public.applications set permits_comped_at = now() where id = v_app;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select permits_comped_at from public.applications where id = v_app) is not null then raise exception 'FAIL B2: owner set permits_comped_at'; end if;
  raise notice 'PASS B2: owner cannot set the permit comp';

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- B3. booth only: invoice = permit fees, pending, due dates kept
  v_amount := public.set_comp(v_app, true, false);
  if v_amount <> 20000 or (select amount from public.invoices where id = v_inv) <> 20000
     or (select status from public.invoices where id = v_inv) <> 'pending'
     or (select deposit_due_at from public.applications where id = v_app) is null then
    raise exception 'FAIL B3: booth-only comp did not leave the permit fees pending with due dates';
  end if;
  raise notice 'PASS B3: comp booth -> invoice $200.00 (permits), pending, due dates kept';

  -- B4. both: $0, settled, due dates cleared
  v_amount := public.set_comp(v_app, true, true);
  if v_amount <> 0 or (select status from public.invoices where id = v_inv) <> 'paid'
     or (select deposit_paid_at from public.invoices where id = v_inv) is null
     or (select deposit_due_at from public.applications where id = v_app) is not null then
    raise exception 'FAIL B4: full comp did not settle the invoice and clear the due dates';
  end if;
  raise notice 'PASS B4: comp booth + permits -> $0, settled, due dates cleared';

  -- B5. permits only: total minus permits; B6. none: back to the total
  v_amount := public.set_comp(v_app, false, true);
  if v_amount <> 130000 then raise exception 'FAIL B5: permits-only comp gave %, expected 130000', v_amount; end if;
  v_amount := public.set_comp(v_app, false, false);
  if v_amount <> 150000 or (select status from public.invoices where id = v_inv) <> 'pending' or (select deposit_paid_at from public.invoices where id = v_inv) is not null then
    raise exception 'FAIL B6: removing both comps did not restore the full pending invoice';
  end if;
  raise notice 'PASS B5-B6: permits only -> total minus permits; none -> full total, pending, milestones cleared';

  -- B7. the 072 wrappers still mean everything / nothing
  perform public.comp_application(v_app);
  if (select comped_at is null or permits_comped_at is null from public.applications where id = v_app) then raise exception 'FAIL B7: comp_application did not comp both'; end if;
  perform public.uncomp_application(v_app);
  if (select comped_at is not null or permits_comped_at is not null from public.applications where id = v_app) then raise exception 'FAIL B7: uncomp_application did not clear both'; end if;
  raise notice 'PASS B7: comp_application / uncomp_application wrap set_comp';

  -- B8. refused once a payment exists, and with two invoices
  update public.invoices set amount_paid = 100 where id = v_inv;
  begin perform public.set_comp(v_app, true, false); raise exception 'FAIL B8: comp changed a paid invoice';
  exception when raise_exception then raise notice 'PASS B8a: refused with a payment (%)', sqlerrm; end;
  update public.invoices set amount_paid = 0 where id = v_inv;
  insert into public.invoices (application_id, amount, amount_paid, status) values (v_app, 100, 0, 'pending');
  begin perform public.set_comp(v_app, true, false); raise exception 'FAIL B8: comp ran with two invoices';
  exception when raise_exception then raise notice 'PASS B8b: refused with two invoices'; end;
  delete from public.invoices where application_id = v_app and amount = 100;

  -- B9. vendor booth comp with no invoice yet: $0 settled invoice created
  v_amount := public.set_comp(v_vendor, true, false);
  if v_amount <> 0 or not exists (select 1 from public.invoices where application_id = v_vendor and amount = 0 and status = 'paid') then
    raise exception 'FAIL B9: vendor booth comp did not create a settled $0 invoice';
  end if;
  raise notice 'PASS B9: vendor booth comp -> settled $0 invoice';

  -- B10. a booth-comped, roster-complete, approved exhibitor is public with no deposit
  perform public.set_comp(v_app, true, false);  -- $200 pending, no deposit
  update public.applications set needs_roster = false,
         artists = '[{"name":"ZZ A","id_url":"zz/a.jpg"},{"name":"ZZ B","id_url":"zz/b.jpg"}]'::jsonb where id = v_app;
  perform public.set_artist_id_verified(v_app, 0, true);
  if not exists (select 1 from public.applications_public where id = v_app) then raise exception 'FAIL B10: comped booth not in applications_public'; end if;
  if not public.booth_publicly_visible(v_app) then raise exception 'FAIL B10: comped booth not publicly visible'; end if;
  raise notice 'PASS B10: comp booth counts as secured for the public directory';

  -- B11. the public view hides id_url and the verification keys
  if exists (select 1 from public.applications_public p, jsonb_array_elements(p.artists) el
              where p.id = v_app and (el ? 'id_url' or el ? 'id_verified_at' or el ? 'id_verified_by')) then
    raise exception 'FAIL B11: applications_public exposes id_url or verification keys';
  end if;
  raise notice 'PASS B11: public artists carry no id_url, id_verified_at or id_verified_by';

  perform set_config('request.jwt.claims', '', true);
  delete from public.invoices where application_id in (v_app, v_vendor);
  delete from public.applications where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 089 (DELETE ME)') then raise exception 'FAIL: fixtures not removed'; end if;
  raise notice 'PASS B: fixtures removed';
end $$;
