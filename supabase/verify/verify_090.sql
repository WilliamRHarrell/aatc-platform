-- ============================================================
-- HOW TO RUN: after 090 is applied, paste the whole file. Read the MESSAGES
-- pane. A failure RAISES and aborts (the failing block rolls back). Then run
-- `node scripts/verify-food-truck-owner.mjs`: uploads are exercised through
-- the Storage API there, never by writing storage tables here (rules.md).
--
-- Block B uses its own INACTIVE event "ZZ VERIFY 090 (DELETE ME)" with two
-- food trucks (one owned by the RLS harness user) and deletes it.
-- ============================================================

-- ── A. policies and trigger  (NOTICE pane)
do $$
declare v_q text;
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'invoices: own food truck read' and cmd = 'SELECT') then
    raise exception 'FAIL A: invoices: own food truck read missing';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.food_trucks'::regclass and tgname = 'food_trucks_protect_staff_columns_trg') then
    raise exception 'FAIL A: food_trucks_protect_staff_columns_trg missing';
  end if;
  -- Both vendor logo policies must scope to the owner's truck folder.
  for v_q in select coalesce(qual, '') || ' ' || coalesce(with_check, '') from pg_policies
              where schemaname = 'storage' and tablename = 'objects'
                and policyname in ('Vendors insert own food truck logos', 'Vendors update own food truck logos') loop
    if position('food_trucks' in v_q) = 0 or position('foldername' in v_q) = 0 then
      raise exception 'FAIL A: a vendor logo policy is not scoped to the owner''s truck folder: %', v_q;
    end if;
  end loop;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and policyname in ('Vendors insert own food truck logos', 'Vendors update own food truck logos')) <> 2 then
    raise exception 'FAIL A: expected exactly the two vendor logo policies';
  end if;
  raise notice 'PASS A: owner invoice policy, staff-column trigger, logo policies scoped to the owner''s truck';
end $$;

-- ── B. behaviour as the owner  (NOTICE pane; fixtures in an inactive ZZ event)
do $$
declare v_harness uuid; v_event uuid; v_own uuid; v_other uuid; n int; r record;
begin
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_harness is null then raise exception 'ABORT: RLS harness user missing'; end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 090 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false) returning id into v_event;
  insert into public.food_trucks (event_id, user_id, business_name, contact_name, email, days, is_published)
  values (v_event, v_harness, 'ZZ VERIFY 090 OWN (DELETE ME)', 'ZZ', 'zz-090-own@example.com', array['friday','saturday','sunday'], false) returning id into v_own;
  insert into public.food_trucks (event_id, user_id, business_name, contact_name, email, days, is_published)
  values (v_event, null, 'ZZ VERIFY 090 OTHER (DELETE ME)', 'ZZ', 'zz-090-other@example.com', array['friday'], false) returning id into v_other;
  insert into public.invoices (food_truck_id, amount, amount_paid, status) values (v_own, 25000, 0, 'pending'), (v_other, 10000, 0, 'pending');

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);

  -- B1. the owner sees their own truck's invoice, and not another truck's
  n := (select count(*) from public.invoices where food_truck_id = v_own);
  if n <> 1 then raise exception 'FAIL B1: owner sees % of their own truck invoices, expected 1', n; end if;
  n := (select count(*) from public.invoices where food_truck_id = v_other);
  if n <> 0 then raise exception 'FAIL B1: owner sees another truck''s invoice'; end if;
  raise notice 'PASS B1: owner reads their own truck invoice only';

  -- B2. the owner edits the profile; days, publishing, email, event stay
  update public.food_trucks
     set description = 'ZZ tacos', cuisine_type = 'ZZ', days = array['friday'], is_published = true,
         email = 'zz-090-hijack@example.com', thursday_setup = true
   where id = v_own;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select description, cuisine_type, days, is_published, email, thursday_setup into r from public.food_trucks where id = v_own;
  if r.description <> 'ZZ tacos' or r.cuisine_type <> 'ZZ' then raise exception 'FAIL B2: the owner could not edit the profile'; end if;
  if r.days <> array['friday','saturday','sunday'] or r.is_published or r.email <> 'zz-090-own@example.com' or r.thursday_setup then
    raise exception 'FAIL B2: the owner changed a staff column: %', r;
  end if;
  raise notice 'PASS B2: owner edits description/cuisine; days, publishing, email, Thursday setup unchanged';

  delete from public.invoices where food_truck_id in (v_own, v_other);
  delete from public.food_trucks where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 090 (DELETE ME)') then raise exception 'FAIL: fixtures not removed'; end if;
  raise notice 'PASS B: fixtures removed';
end $$;
