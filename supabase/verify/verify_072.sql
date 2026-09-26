-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
--
-- ⚠  Block D WRITES fixtures (two ZZ applications owned by the RLS harness
-- user and their invoices) and deletes them at the end of the same block. It
-- ABORTS if the harness user or an admin profile is missing. Nothing else
-- writes.
-- ============================================================

-- ── A. policies unchanged  (results grid, then a hard check)
select tablename, policyname, cmd, roles::text
  from pg_policies
 where schemaname = 'public' and tablename in ('applications', 'invoices')
 order by tablename, policyname;

do $$
declare n int;
begin
  n := (select count(*) from pg_policies where schemaname = 'public' and tablename = 'applications'
         and policyname in ('applications: own read', 'applications: own insert', 'applications: admin all',
                            'applications: public read deposit-paid', 'applications: own update'));
  if n <> 5 then raise exception 'FAIL A: expected the 5 known applications policies, found %', n; end if;
  n := (select count(*) from pg_policies where schemaname = 'public' and tablename = 'applications');
  if n <> 5 then raise exception 'FAIL A: % applications policies in total - 072 must not add or remove any', n; end if;
  n := (select count(*) from pg_policies where schemaname = 'public' and tablename = 'invoices'
         and policyname in ('invoices: admin all', 'invoices: own read'));
  if n <> 2 then raise exception 'FAIL A: expected the 2 known invoices policies, found %', n; end if;
  n := (select count(*) from pg_policies where schemaname = 'public' and tablename = 'invoices');
  if n <> 2 then raise exception 'FAIL A: % invoices policies in total - 072 must not add or remove any', n; end if;
  raise notice 'PASS A: applications (5) and invoices (2) policies unchanged';
end $$;

-- ── B. columns, FK, functions, grants  (NOTICE pane)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'applications' and column_name = 'comped_at' and data_type = 'timestamp with time zone') then
    raise exception 'FAIL B: applications.comped_at missing or not timestamptz';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'applications' and column_name = 'comped_by' and data_type = 'uuid') then
    raise exception 'FAIL B: applications.comped_by missing or not uuid';
  end if;
  if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
                 where c.conrelid = 'public.applications'::regclass and c.contype = 'f' and a.attname = 'comped_by' and c.confrelid = 'public.profiles'::regclass) then
    raise exception 'FAIL B: comped_by has no FK to profiles';
  end if;
  if not exists (select 1 from pg_proc where proname = 'comp_application') then raise exception 'FAIL B: comp_application missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'uncomp_application') then raise exception 'FAIL B: uncomp_application missing'; end if;
  if has_function_privilege('anon', 'public.comp_application(uuid)', 'execute') then raise exception 'FAIL B: anon can execute comp_application'; end if;
  if has_function_privilege('anon', 'public.uncomp_application(uuid)', 'execute') then raise exception 'FAIL B: anon can execute uncomp_application'; end if;
  if not has_function_privilege('authenticated', 'public.comp_application(uuid)', 'execute') then raise exception 'FAIL B: authenticated cannot execute comp_application'; end if;
  raise notice 'PASS B: columns, FK, both RPCs, grants';
end $$;

-- ── C. clamp bodies carry 072  (NOTICE pane)
do $$
declare body text;
begin
  body := pg_get_functiondef('public.applications_force_safe_insert'::regproc);
  if position('new.comped_at := null' in body) = 0 then raise exception 'FAIL C: insert clamp does not null comped_at'; end if;
  if position('new.veteran_doc_verified_at := null' in body) = 0 then raise exception 'FAIL C: insert clamp lost the 071 line'; end if;
  body := pg_get_functiondef('public.applications_protect_staff_columns'::regproc);
  if position('new.comped_at := old.comped_at' in body) = 0 then raise exception 'FAIL C: update clamp does not restore comped_at for owners'; end if;
  if position('new.veteran_id_url is distinct from old.veteran_id_url' in body) = 0 then raise exception 'FAIL C: update clamp lost the 071 reset'; end if;
  -- Lifecycle rule: neither RPC writes applications.status. The invoice
  -- update writes `status = 'paid'` after `set amount`, so a literal
  -- `set status` can only be an applications write.
  body := pg_get_functiondef('public.comp_application'::regproc);
  if position('set status' in body) > 0 then raise exception 'FAIL C: comp_application sets applications.status'; end if;
  body := pg_get_functiondef('public.uncomp_application'::regproc);
  if position('set status' in body) > 0 then raise exception 'FAIL C: uncomp_application sets applications.status'; end if;
  raise notice 'PASS C: clamp bodies and RPC bodies';
end $$;

-- ── D. behaviour with fixtures  (NOTICE pane; writes and cleans up)
do $$
declare
  v_owner uuid; v_admin uuid; v_event uuid;
  v_a uuid; v_b uuid; v_inv uuid;
  v_ts timestamptz; v_by uuid; v_amt int; v_status text; v_dep timestamptz; v_fin timestamptz; v_due timestamptz;
  v_err text;
begin
  v_owner := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_owner is null then raise exception 'ABORT: RLS harness user missing - wrong database or partial cleanup'; end if;
  v_admin := (select id from public.profiles where role = 'admin' order by created_at limit 1);
  if v_admin is null then raise exception 'ABORT: no admin profile'; end if;
  v_event := (select id from public.events where is_active order by start_date limit 1);
  if v_event is null then raise exception 'ABORT: no active event'; end if;

  -- Fixture A: pending, no invoice (comp BEFORE approve).
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
  values (v_event, v_owner, 'vendor', 'ZZ VERIFY 072 A (DELETE ME)', 'ZZ', 'zz-verify-072a@example.com', 60000, 'pending', 1, 0)
  returning id into v_a;

  -- D1. An OWNER cannot comp themselves by UPDATE (clamp); the update itself lands on notes (control).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  update public.applications set comped_at = now(), comped_by = v_owner, notes = 'ZZ owner touched' where id = v_a;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select notes from public.applications where id = v_a) is distinct from 'ZZ owner touched' then
    raise exception 'FAIL D1 control: the owner update did not land';
  end if;
  if (select comped_at from public.applications where id = v_a) is not null then raise exception 'FAIL D1: owner comped themselves'; end if;
  raise notice 'PASS D1: owner update clamped off comped_at';

  -- D2. An OWNER cannot call the RPC.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    perform public.comp_application(v_a);
    reset role;
    raise exception 'FAIL D2: a non-admin called comp_application';
  exception
    when insufficient_privilege then
      reset role;
      perform set_config('request.jwt.claims', '', true);
      raise notice 'PASS D2: non-admin refused (42501)';
  end;

  -- D3. Comp BEFORE approve, as an admin: comped, invoice created 0/paid with milestones, due dates null.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.comp_application(v_a);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_ts := (select comped_at from public.applications where id = v_a);
  v_by := (select comped_by from public.applications where id = v_a);
  if v_ts is null or v_by is distinct from v_admin then raise exception 'FAIL D3: comped_at/by not set (at=%, by=%)', v_ts, v_by; end if;
  v_inv := (select id from public.invoices where application_id = v_a);
  if v_inv is null then raise exception 'FAIL D3: no invoice created'; end if;
  v_amt := (select amount from public.invoices where id = v_inv);
  v_status := (select status::text from public.invoices where id = v_inv);
  v_dep := (select deposit_paid_at from public.invoices where id = v_inv);
  v_fin := (select final_paid_at from public.invoices where id = v_inv);
  if v_amt <> 0 or v_status <> 'paid' or v_dep is null or v_fin is null then
    raise exception 'FAIL D3: invoice not settled (amount=%, status=%, dep=%, fin=%)', v_amt, v_status, v_dep, v_fin;
  end if;
  if (select status::text from public.applications where id = v_a) <> 'pending' then raise exception 'FAIL D3: comp changed status'; end if;
  raise notice 'PASS D3: comp before approve settles the invoice and leaves status alone';

  -- D3b. Approving the comped row (the drawer writes no dates when comped) keeps it comped and settled.
  update public.applications set status = 'approved', approved_at = now() where id = v_a;
  if (select comped_at from public.applications where id = v_a) is null then raise exception 'FAIL D3b: approve cleared the comp'; end if;
  if (select deposit_due_at from public.applications where id = v_a) is not null then raise exception 'FAIL D3b: deposit_due_at set on a comped application'; end if;
  raise notice 'PASS D3b: approve after comp keeps the comp';

  -- Fixture A is done. Remove it before fixture B: 079 allows one ACTIVE
  -- application per user per event, and both are owned by the harness user.
  delete from public.invoices where application_id = v_a;
  delete from public.applications where id = v_a;

  -- Fixture B: approved with dates and a pending invoice (comp AFTER approve).
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count,
                                   approved_at, deposit_due_at, final_due_at)
  values (v_event, v_owner, 'vendor', 'ZZ VERIFY 072 B (DELETE ME)', 'ZZ', 'zz-verify-072b@example.com', 60000, 'approved', 1, 0,
          now(), now() + interval '30 days', '2027-01-01T05:00:00+00:00')
  returning id into v_b;
  insert into public.invoices (application_id, amount, amount_paid, status) values (v_b, 60000, 0, 'pending');

  -- D4. Comp AFTER approve (fixture B): existing pending invoice re-priced to 0/paid, dates nulled.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.comp_application(v_b);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_inv := (select id from public.invoices where application_id = v_b);
  v_amt := (select amount from public.invoices where id = v_inv);
  v_status := (select status::text from public.invoices where id = v_inv);
  v_dep := (select deposit_paid_at from public.invoices where id = v_inv);
  v_due := (select deposit_due_at from public.applications where id = v_b);
  if v_amt <> 0 or v_status <> 'paid' or v_dep is null or v_due is not null then
    raise exception 'FAIL D4: comp after approve (amount=%, status=%, dep=%, due=%)', v_amt, v_status, v_dep, v_due;
  end if;
  if (select status::text from public.applications where id = v_b) <> 'approved' then raise exception 'FAIL D4: comp changed status'; end if;
  raise notice 'PASS D4: comp after approve re-prices the existing invoice';

  -- D5. Approve, send back, comp, approve (fixture B continues): send back clears dates; comp is idempotent; re-approve keeps it.
  update public.applications set status = 'pending', approved_at = null, deposit_due_at = null, final_due_at = null where id = v_b;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.comp_application(v_b);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  update public.applications set status = 'approved', approved_at = now() where id = v_b;
  if (select comped_by from public.applications where id = v_b) is distinct from v_admin then raise exception 'FAIL D5: comped_by changed on re-comp'; end if;
  if (select count(*) from public.invoices where application_id = v_b) <> 1 then raise exception 'FAIL D5: a second invoice appeared'; end if;
  if (select amount from public.invoices where application_id = v_b) <> 0 then raise exception 'FAIL D5: invoice re-priced away from 0'; end if;
  raise notice 'PASS D5: approve, send back, comp, approve holds';

  -- D6. Remove comp is REFUSED once a payment exists.
  update public.invoices set amount_paid = 100 where application_id = v_b;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    perform public.uncomp_application(v_b);
    reset role;
    raise exception 'FAIL D6: uncomp succeeded with a payment recorded';
  exception
    when raise_exception then
      get stacked diagnostics v_err = message_text;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      if position('payments exist' in v_err) = 0 then raise exception 'FAIL D6: wrong refusal: %', v_err; end if;
      raise notice 'PASS D6: uncomp refused with payments (%)', v_err;
  end;
  if (select comped_at from public.applications where id = v_b) is null then raise exception 'FAIL D6: refusal still cleared the comp'; end if;
  update public.invoices set amount_paid = 0 where application_id = v_b;

  -- D7. Remove comp with no payment: invoice back to list price, pending, milestones cleared; comp cleared; status untouched.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.uncomp_application(v_b);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_amt := (select amount from public.invoices where application_id = v_b);
  v_status := (select status::text from public.invoices where application_id = v_b);
  v_dep := (select deposit_paid_at from public.invoices where application_id = v_b);
  if v_amt <> 60000 or v_status <> 'pending' or v_dep is not null then
    raise exception 'FAIL D7: uncomp did not restore (amount=%, status=%, dep=%)', v_amt, v_status, v_dep;
  end if;
  if (select comped_at from public.applications where id = v_b) is not null then raise exception 'FAIL D7: comped_at still set'; end if;
  if (select status::text from public.applications where id = v_b) <> 'approved' then raise exception 'FAIL D7: uncomp changed status'; end if;
  raise notice 'PASS D7: uncomp restores the invoice and leaves status alone';

  -- D7b. Comp refused with a payment recorded (B is now uncomped, pending, 60000).
  update public.invoices set amount_paid = 100 where application_id = v_b;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    perform public.comp_application(v_b);
    reset role;
    raise exception 'FAIL D7b: comp succeeded with a payment recorded';
  exception
    when raise_exception then
      get stacked diagnostics v_err = message_text;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      if position('payments exist' in v_err) = 0 then raise exception 'FAIL D7b: wrong refusal: %', v_err; end if;
      raise notice 'PASS D7b: comp refused with payments (%)', v_err;
  end;
  if (select comped_at from public.applications where id = v_b) is not null then raise exception 'FAIL D7b: refusal still comped'; end if;
  if (select amount from public.invoices where application_id = v_b) <> 60000 then raise exception 'FAIL D7b: refusal changed the invoice'; end if;
  update public.invoices set amount_paid = 0 where application_id = v_b;

  -- D8. Two invoices: both RPCs refuse rather than guess.
  insert into public.invoices (application_id, amount, amount_paid, status) values (v_b, 100, 0, 'pending');
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    perform public.comp_application(v_b);
    reset role;
    raise exception 'FAIL D8: comp_application accepted two invoices';
  exception
    when raise_exception then
      get stacked diagnostics v_err = message_text;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      if position('multiple invoices' in v_err) = 0 then raise exception 'FAIL D8: wrong refusal: %', v_err; end if;
      raise notice 'PASS D8: two invoices refused';
  end;

  -- D9. An OWNER inserting a row cannot arrive comped (insert clamp). B is
  -- removed first (079: one active application per user per event).
  delete from public.invoices where application_id = v_b;
  delete from public.applications where id = v_b;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count, comped_at, comped_by)
  values (v_event, v_owner, 'vendor', 'ZZ VERIFY 072 C (DELETE ME)', 'ZZ', 'zz-verify-072c@example.com', 50000, 'pending', 1, 0, now(), v_owner); -- 50000 = list price (079)
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select comped_at from public.applications where business_name = 'ZZ VERIFY 072 C (DELETE ME)') is not null then
    raise exception 'FAIL D9: owner insert arrived comped';
  end if;
  raise notice 'PASS D9: owner insert arrives uncomped';

  -- Cleanup belongs with the last block that needs the fixtures (A and B are already gone).
  delete from public.invoices where application_id in (v_a, v_b);
  delete from public.applications where id in (v_a, v_b) or business_name = 'ZZ VERIFY 072 C (DELETE ME)';
  if exists (select 1 from public.applications where business_name like 'ZZ VERIFY 072%') then raise exception 'FAIL: fixtures not deleted'; end if;
  raise notice 'PASS D: fixtures removed';
end $$;

-- ── Z. residue  (results grid; want zero rows)
select id, business_name from public.applications where business_name like 'ZZ VERIFY 072%';
