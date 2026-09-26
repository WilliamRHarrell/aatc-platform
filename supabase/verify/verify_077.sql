-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass.
-- ⚠  Block C writes one ZZ application owned by the RLS harness user and
-- deletes it in the same block (a DO block rolls back its own writes on raise).
-- ============================================================

-- ── A. column  (NOTICE pane)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'applications' and column_name = 'submission_receipt_sent_at' and data_type = 'timestamp with time zone') then
    raise exception 'FAIL A: applications.submission_receipt_sent_at missing or not timestamptz';
  end if;
  raise notice 'PASS A: column present';
end $$;

-- ── B. both clamps carry 077 and lost nothing from 071/072  (NOTICE pane)
do $$
declare body text;
begin
  body := pg_get_functiondef('public.applications_force_safe_insert'::regproc);
  if position('new.submission_receipt_sent_at := null' in body) = 0 then raise exception 'FAIL B: insert clamp does not null the receipt mark'; end if;
  if position('new.comped_at := null' in body) = 0 or position('new.veteran_doc_verified_at := null' in body) = 0 then raise exception 'FAIL B: insert clamp lost a 071/072 line'; end if;
  body := pg_get_functiondef('public.applications_protect_staff_columns'::regproc);
  if position('new.submission_receipt_sent_at := old.submission_receipt_sent_at' in body) = 0 then raise exception 'FAIL B: update clamp does not restore the receipt mark for owners'; end if;
  if position('new.comped_at := old.comped_at' in body) = 0 or position('new.veteran_id_url is distinct from old.veteran_id_url' in body) = 0 then raise exception 'FAIL B: update clamp lost a 071/072 line'; end if;
  raise notice 'PASS B: clamp bodies';
end $$;

-- ── C. an owner cannot set or clear the mark; the service path can  (NOTICE pane; fixture)
do $$
declare v_uid uuid; v_event uuid; v_app uuid; v_ts timestamptz;
begin
  v_uid := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_uid is null then raise exception 'ABORT: RLS harness user missing'; end if;
  v_event := (select id from public.events where is_active order by start_date limit 1);

  -- Owner insert with the mark preset: arrives NULL (insert clamp).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count, submission_receipt_sent_at)
  values (v_event, v_uid, 'vendor', 'ZZ VERIFY 077 (DELETE ME)', 'ZZ', 'zz-verify-077@example.com', 50000, 'pending', 1, 0, now()); -- 50000 = the list price (079 refuses an owner total that differs)
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_app := (select id from public.applications where business_name = 'ZZ VERIFY 077 (DELETE ME)');
  if v_app is null then raise exception 'FAIL C control: owner insert did not land'; end if;
  if (select submission_receipt_sent_at from public.applications where id = v_app) is not null then raise exception 'FAIL C: owner insert arrived marked'; end if;

  -- The route's compare-and-set (as a trusted writer): first call sets, second is a no-op.
  update public.applications set submission_receipt_sent_at = now() where id = v_app and submission_receipt_sent_at is null;
  v_ts := (select submission_receipt_sent_at from public.applications where id = v_app);
  if v_ts is null then raise exception 'FAIL C: compare-and-set did not set the mark'; end if;
  update public.applications set submission_receipt_sent_at = now() + interval '1 hour' where id = v_app and submission_receipt_sent_at is null;
  if (select submission_receipt_sent_at from public.applications where id = v_app) <> v_ts then raise exception 'FAIL C: second compare-and-set changed the mark'; end if;

  -- Owner tries to clear it (to get another receipt): clamped; notes change lands (control).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  update public.applications set submission_receipt_sent_at = null, notes = 'ZZ owner touched' where id = v_app;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select notes from public.applications where id = v_app) is distinct from 'ZZ owner touched' then raise exception 'FAIL C control: owner update did not land'; end if;
  if (select submission_receipt_sent_at from public.applications where id = v_app) is distinct from v_ts then raise exception 'FAIL C: owner cleared the receipt mark'; end if;

  delete from public.applications where id = v_app;
  if exists (select 1 from public.applications where id = v_app) then raise exception 'FAIL C: fixture not deleted'; end if;
  raise notice 'PASS C: owner cannot set or clear the mark; compare-and-set is once-only; fixture removed';
end $$;

-- ── Z. residue  (results grid; want zero rows)
select id, business_name from public.applications where business_name like 'ZZ VERIFY 077%';
