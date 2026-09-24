-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass. Reads only; no fixtures.
--
-- Also answers the 2026-09-24 question "what can anon execute?" exactly:
-- block A prints every function in public that anon may execute, block B
-- asserts that list equals the intended allow-list, block C asserts the
-- guarded functions refuse anon at the grant level, block D calls
-- expire_application as anon with a nil UUID and expects 42501.
-- ============================================================

-- ── A. what anon can execute today  (results grid)
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prorettype <> 'trigger'::regtype
   and has_function_privilege('anon', p.oid, 'execute')
 order by p.proname;

-- ── B. anon's list is EXACTLY the intended one  (NOTICE pane)
do $$
declare
  allowed text[] := array[
    'is_admin', 'has_paid_deposit', 'booth_publicly_visible', 'sponsor_tier_counts',
    'register_pinup_entry', 'pinup_spots_remaining', 'voting_state', 'tattoo_battle_media_ok'
  ];
  extra text; missing text;
begin
  extra := (select string_agg(p.proname, ', ' order by p.proname)
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
               and has_function_privilege('anon', p.oid, 'execute')
               and not (p.proname = any(allowed)));
  if extra is not null then
    raise exception 'FAIL B: anon can execute functions outside the allow-list: %', extra;
  end if;
  missing := (select string_agg(a, ', ') from unnest(allowed) a
               where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                  where n.nspname = 'public' and p.proname = a
                                    and has_function_privilege('anon', p.oid, 'execute')));
  if missing is not null then
    raise exception 'FAIL B: intended anon functions lost their grant: %', missing;
  end if;
  raise notice 'PASS B: anon executes exactly the % allow-listed functions', array_length(allowed, 1);
end $$;

-- ── C. the guarded functions, role by role  (NOTICE pane)
do $$
begin
  if has_function_privilege('anon', 'public.comp_application(uuid)', 'execute') then raise exception 'FAIL C: anon -> comp_application'; end if;
  if has_function_privilege('anon', 'public.uncomp_application(uuid)', 'execute') then raise exception 'FAIL C: anon -> uncomp_application'; end if;
  if has_function_privilege('anon', 'public.has_role(text[])', 'execute') then raise exception 'FAIL C: anon -> has_role'; end if;
  if has_function_privilege('anon', 'public.owns_invoice(uuid,uuid,uuid)', 'execute') then raise exception 'FAIL C: anon -> owns_invoice'; end if;
  if has_function_privilege('anon', 'public.set_tattoo_battle_champion(uuid)', 'execute') then raise exception 'FAIL C: anon -> set_tattoo_battle_champion'; end if;
  if has_function_privilege('anon', 'public.expire_application(uuid)', 'execute') then raise exception 'FAIL C: anon -> expire_application'; end if;
  if has_function_privilege('anon', 'public.cancel_application(uuid)', 'execute') then raise exception 'FAIL C: anon -> cancel_application'; end if;
  if has_function_privilege('authenticated', 'public.expire_application(uuid)', 'execute') then raise exception 'FAIL C: authenticated -> expire_application'; end if;
  if has_function_privilege('authenticated', 'public.cancel_application(uuid)', 'execute') then raise exception 'FAIL C: authenticated -> cancel_application'; end if;
  if not has_function_privilege('service_role', 'public.expire_application(uuid)', 'execute') then raise exception 'FAIL C: service_role lost expire_application - the sweep would break'; end if;
  if not has_function_privilege('service_role', 'public.cancel_application(uuid)', 'execute') then raise exception 'FAIL C: service_role lost cancel_application - the sweep would break'; end if;
  if not has_function_privilege('authenticated', 'public.comp_application(uuid)', 'execute') then raise exception 'FAIL C: authenticated lost comp_application - the drawer would break'; end if;
  if not has_function_privilege('authenticated', 'public.has_role(text[])', 'execute') then raise exception 'FAIL C: authenticated lost has_role - every editorial policy would break'; end if;
  raise notice 'PASS C: grants are exactly as intended for anon, authenticated and service_role';
end $$;

-- ── D. the internal guard, as anon and as a signed-in non-admin  (NOTICE pane)
do $$
declare body text; v_uid uuid;
begin
  body := pg_get_functiondef('public.expire_application'::regproc);
  if position('auth.role() is distinct from ''service_role''' in body) = 0 then raise exception 'FAIL D: expire_application has no internal guard'; end if;
  body := pg_get_functiondef('public.cancel_application'::regproc);
  if position('auth.role() is distinct from ''service_role''' in body) = 0 then raise exception 'FAIL D: cancel_application has no internal guard'; end if;

  -- anon at the grant level
  begin
    set local role anon;
    perform public.expire_application('00000000-0000-0000-0000-000000000000');
    reset role;
    raise exception 'FAIL D: anon executed expire_application';
  exception
    when insufficient_privilege then reset role; raise notice 'PASS D1: anon refused at the grant (42501)';
  end;

  -- a signed-in non-admin at the grant level (authenticated has no grant)
  v_uid := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_uid is null then raise exception 'ABORT: RLS harness user missing'; end if;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform public.cancel_application('00000000-0000-0000-0000-000000000000');
    reset role;
    raise exception 'FAIL D: a signed-in non-admin executed cancel_application';
  exception
    when insufficient_privilege then
      reset role; perform set_config('request.jwt.claims', '', true);
      raise notice 'PASS D2: authenticated non-admin refused at the grant (42501)';
  end;
  raise notice 'PASS D: internal guards present, grant-level refusals confirmed';
end $$;
