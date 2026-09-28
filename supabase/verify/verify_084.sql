-- ============================================================
-- HOW TO RUN: after 084 is applied, paste the whole file. Read the MESSAGES
-- pane and the grid. A failure RAISES and aborts.
--
-- Writes nothing that survives: every write in block B runs inside a
-- sub-block that is rolled back on purpose (ZZ_ROLLBACK), so no row's
-- show_price or updated_at changes.
-- ============================================================

-- ── A. shape, grants and policies  (NOTICE pane)
do $$
declare n int; missing text;
begin
  if to_regclass('public.sponsor_tier_settings') is null then raise exception 'FAIL A: sponsor_tier_settings does not exist - 084 is not applied'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.sponsor_tier_settings'::regclass) then raise exception 'FAIL A: RLS is off'; end if;

  -- One row per value of the enum (read from pg_enum, never a written-out list),
  -- so a tier added to the enum later fails here until it has a row.
  missing := (select string_agg(e.enumlabel, ', ') from pg_enum e
               where e.enumtypid = 'public.sponsor_tier'::regtype
                 and not exists (select 1 from public.sponsor_tier_settings s where s.tier::text = e.enumlabel));
  if missing is not null then raise exception 'FAIL A: tiers with no row (they read as hidden): %', missing; end if;

  if (select string_agg(policyname, ', ' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'sponsor_tier_settings')
     is distinct from 'sponsor_tier_settings: admin update, sponsor_tier_settings: public read' then
    raise exception 'FAIL A: policies are not exactly "admin update" and "public read"';
  end if;
  if position('has_role' in (select qual from pg_policies where tablename = 'sponsor_tier_settings' and policyname = 'sponsor_tier_settings: admin update')) = 0 then
    raise exception 'FAIL A: admin update policy does not use has_role';
  end if;

  if not has_table_privilege('anon', 'public.sponsor_tier_settings', 'select') then raise exception 'FAIL A: anon cannot read (the public pages need it)'; end if;
  if has_table_privilege('anon', 'public.sponsor_tier_settings', 'insert') or has_table_privilege('anon', 'public.sponsor_tier_settings', 'update')
     or has_table_privilege('anon', 'public.sponsor_tier_settings', 'delete') then
    raise exception 'FAIL A: anon holds a write privilege';
  end if;
  if has_table_privilege('authenticated', 'public.sponsor_tier_settings', 'insert') or has_table_privilege('authenticated', 'public.sponsor_tier_settings', 'delete') then
    raise exception 'FAIL A: authenticated can insert or delete';
  end if;

  -- The table holds a flag, never a figure.
  n := (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'sponsor_tier_settings');
  if n <> 3 then raise exception 'FAIL A: expected 3 columns (tier, show_price, updated_at), found %', n; end if;
  raise notice 'PASS A: every tier has a row; RLS on; 2 policies; anon read-only; no insert/delete for authenticated';
end $$;

-- ── B. who can change a flag  (NOTICE pane; rolled back)
do $$
declare n int; v_admin uuid; v_nobody uuid := gen_random_uuid();
begin
  -- B1. anon cannot update
  begin
    set local role anon;
    update public.sponsor_tier_settings set show_price = show_price where tier = 'gold';
    reset role; raise exception 'FAIL B1: anon updated a flag';
  exception when insufficient_privilege then reset role;
  end;
  raise notice 'PASS B1: anon cannot update';

  -- B2. a signed-in non-admin updates zero rows
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_nobody, 'role', 'authenticated')::text, true);
    update public.sponsor_tier_settings set show_price = show_price where tier = 'gold';
    get diagnostics n = row_count;
    reset role; perform set_config('request.jwt.claims', '', true);
    if n <> 0 then raise exception 'FAIL B2: a non-admin updated % row(s)', n; end if;
    raise exception using errcode = 'P0001', message = 'ZZ_ROLLBACK';
  exception when sqlstate 'P0001' then
    reset role; perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'ZZ_ROLLBACK' then raise; end if;
  end;
  raise notice 'PASS B2: a signed-in non-admin changes nothing';

  -- B3. a signed-in non-admin cannot insert
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_nobody, 'role', 'authenticated')::text, true);
    insert into public.sponsor_tier_settings (tier, show_price) values ('gold', true);
    reset role; raise exception 'FAIL B3: authenticated inserted a row';
  exception when insufficient_privilege then reset role; perform set_config('request.jwt.claims', '', true);
  end;
  raise notice 'PASS B3: authenticated cannot insert';

  -- B4. control: an admin updates one row (then rolled back)
  v_admin := (select id from public.profiles where role = 'admin' order by created_at limit 1);
  if v_admin is null then
    raise notice 'NOTE B4: no admin profile found; the positive control did not run';
  else
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      update public.sponsor_tier_settings set show_price = show_price where tier = 'gold';
      get diagnostics n = row_count;
      reset role; perform set_config('request.jwt.claims', '', true);
      if n <> 1 then raise exception 'FAIL B4: an admin updated % row(s), expected 1', n; end if;
      raise exception using errcode = 'P0001', message = 'ZZ_ROLLBACK';
    exception when sqlstate 'P0001' then
      reset role; perform set_config('request.jwt.claims', '', true);
      if sqlerrm <> 'ZZ_ROLLBACK' then raise; end if;
    end;
    raise notice 'PASS B4: an admin can change a flag (rolled back)';
  end if;
end $$;

-- ── C. the live settings, one line per ENUM value  (results grid)
-- Seeded: 5 packages hidden, 5 items shown (084), bronze hidden (084b). Driven
-- by the enum, so a value with no row shows here as show_price NULL.
select e.enumlabel as tier, s.show_price, s.updated_at
  from pg_enum e
  left join public.sponsor_tier_settings s on s.tier::text = e.enumlabel
 where e.enumtypid = 'public.sponsor_tier'::regtype
 order by s.show_price nulls first, e.enumsortorder;
