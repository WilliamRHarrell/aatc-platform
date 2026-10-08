-- ============================================================
-- HOW TO RUN: after 092 is applied, paste the whole file. Read the MESSAGES
-- pane. A failure RAISES and aborts (the failing block rolls back). The last
-- query (block C) lists the live food-truck invoices with their deposit rule,
-- for you to eyeball.
--
-- Block B uses its own INACTIVE event "ZZ VERIFY 092 (DELETE ME)" and deletes
-- it. Nothing on the live event is written.
-- ============================================================

-- ── A. columns and constraint  (NOTICE pane)
do $$
declare v_missing text;
begin
  select string_agg(c, ', ') into v_missing
    from unnest(array['deposit_rule','due_reminder_14_sent_at','due_reminder_1_sent_at','due_reminder_30_sent_at','due_reminder_7_sent_at']) c
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'invoices' and column_name = c);
  if v_missing is not null then raise exception 'FAIL A: invoices columns missing: %', v_missing; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'events' and column_name = 'food_truck_unpaid_report_sent_at') then
    raise exception 'FAIL A: events.food_truck_unpaid_report_sent_at missing';
  end if;
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'invoices' and column_name = 'deposit_rule') not like '''percent_25''%' then
    raise exception 'FAIL A: invoices.deposit_rule does not default to percent_25';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.invoices'::regclass and conname = 'invoices_deposit_rule_check') then
    raise exception 'FAIL A: invoices_deposit_rule_check missing';
  end if;
  -- 092 changes no policy: invoices keeps exactly its three.
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'invoices') <> 3 then
    raise exception 'FAIL A: invoices has % policies, expected 3', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'invoices');
  end if;
  raise notice 'PASS A: deposit_rule (default percent_25, checked), 14/1-day reminder columns, unpaid-report column, 3 invoice policies';
end $$;

-- ── B. behaviour  (NOTICE pane; fixtures in an inactive ZZ event)
do $$
declare v_event uuid; v_truck uuid; v_sp uuid; v_inv uuid; v_ok boolean;
begin
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 092 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false) returning id into v_event;
  insert into public.food_trucks (event_id, business_name, contact_name, email, days, status)
  values (v_event, 'ZZ VERIFY 092 TRUCK (DELETE ME)', 'ZZ', 'zz-092@example.com', array['friday'], 'approved') returning id into v_truck;
  insert into public.sponsorships (event_id, sponsor_name, tier, amount, status)
  values (v_event, 'ZZ VERIFY 092 SPONSOR (DELETE ME)', 'brass', 0, 'pending') returning id into v_sp;

  -- B1. a new invoice defaults to the 25% rule; a truck invoice takes the flat rule
  insert into public.invoices (food_truck_id, amount, amount_paid, status) values (v_truck, 25000, 0, 'pending') returning id into v_inv;
  if (select deposit_rule from public.invoices where id = v_inv) <> 'percent_25' then raise exception 'FAIL B1: default is not percent_25'; end if;
  update public.invoices set deposit_rule = 'food_truck_flat' where id = v_inv;
  raise notice 'PASS B1: default percent_25; a food-truck invoice takes food_truck_flat';

  -- B2. the flat rule is refused on a non-truck invoice, and an unknown rule is refused
  v_ok := false;
  begin
    insert into public.invoices (sponsorship_id, amount, amount_paid, status, deposit_rule) values (v_sp, 1000, 0, 'pending', 'food_truck_flat');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B2: a sponsorship invoice took food_truck_flat'; end if;
  v_ok := false;
  begin
    update public.invoices set deposit_rule = 'percent_50' where id = v_inv;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B2: an unknown deposit rule was accepted'; end if;
  raise notice 'PASS B2: food_truck_flat only on food-truck invoices; unknown rules refused';

  -- B3. the January 2 claim is a compare-and-set: the second claim updates nothing
  update public.events set food_truck_unpaid_report_sent_at = now() where id = v_event and food_truck_unpaid_report_sent_at is null;
  update public.events set food_truck_unpaid_report_sent_at = now() - interval '1 day' where id = v_event and food_truck_unpaid_report_sent_at is null;
  if (select food_truck_unpaid_report_sent_at from public.events where id = v_event) < now() - interval '1 hour' then
    raise exception 'FAIL B3: the second claim overwrote the first';
  end if;
  raise notice 'PASS B3: the unpaid-report claim is taken once';

  delete from public.invoices where food_truck_id = v_truck or sponsorship_id = v_sp;
  delete from public.food_trucks where event_id = v_event;
  delete from public.sponsorships where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 092 (DELETE ME)') then raise exception 'FAIL: fixtures not removed'; end if;
  raise notice 'PASS B: fixtures removed';
end $$;

-- ── C. the live food-truck invoices  (RESULTS pane)
--    want: right after applying, every row percent_25 (the 3 imports and any
--    truck added before 092). Approvals and admin Add after this deploy
--    create food_truck_flat invoices.
select t.business_name, t.status as truck_status, i.deposit_rule, i.amount, i.amount_paid,
       i.status as invoice_status, i.deposit_paid_at is not null as deposit_recorded
  from public.invoices i
  join public.food_trucks t on t.id = i.food_truck_id
  join public.events e on e.id = t.event_id and e.is_active
 order by t.business_name;
