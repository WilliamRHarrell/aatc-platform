-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass. Reads only; no fixtures. Blocks
-- that switch role do so with `set local role` inside a DO block and reset.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
-- ============================================================

-- ── A. the view: shape, options, grants  (NOTICE pane)
do $$
declare cols text; want text;
begin
  if not exists (select 1 from pg_views where schemaname = 'public' and viewname = 'applications_public') then
    raise exception 'FAIL A: applications_public missing';
  end if;
  if position('security_invoker=false' in coalesce(array_to_string((select reloptions from pg_class where oid = 'public.applications_public'::regclass), ','), '')) = 0 then
    raise exception 'FAIL A: applications_public is not security_invoker = false (it would run as the caller and hit RLS)';
  end if;
  if position('security_barrier=true' in coalesce(array_to_string((select reloptions from pg_class where oid = 'public.applications_public'::regclass), ','), '')) = 0 then
    raise exception 'FAIL A: applications_public is not security_barrier = true';
  end if;
  if has_table_privilege('anon', 'public.applications_public', 'update') or has_table_privilege('anon', 'public.applications_public', 'delete')
     or has_table_privilege('authenticated', 'public.applications_public', 'insert') or has_table_privilege('authenticated', 'public.applications_public', 'update') or has_table_privilege('authenticated', 'public.applications_public', 'delete') then
    raise exception 'FAIL A: a write privilege on the view exists for anon or authenticated (owner-executed view: it would bypass RLS)';
  end if;
  -- Column list and ORDER pinned (HANDOFF: row counts do not check shape).
  cols := (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
            where table_schema = 'public' and table_name = 'applications_public');
  want := 'id,event_id,status,exhibitor_type,business_name,booth_size,artist_single_qty,artist_double_qty,vendor_single_qty,vendor_double_qty,corner_count,artist_count,instagram,website,facebook,phone,artists,tv_show,logo_url,portfolio_image_urls';
  if cols is distinct from want then raise exception 'FAIL A: view columns are (%), want (%)', cols, want; end if;
  if not has_table_privilege('anon', 'public.applications_public', 'select') then raise exception 'FAIL A: anon cannot select the view'; end if;
  if not has_table_privilege('authenticated', 'public.applications_public', 'select') then raise exception 'FAIL A: authenticated cannot select the view'; end if;
  if has_table_privilege('anon', 'public.applications_public', 'insert') then raise exception 'FAIL A: anon holds INSERT on the view'; end if;
  raise notice 'PASS A: view present, definer-owned, 20 columns in order, SELECT for anon + authenticated only';
end $$;

-- ── B. the table: public policy gone, anon has nothing  (NOTICE pane)
do $$
declare n int; n_view int;
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'applications' and policyname = 'applications: public read deposit-paid') then
    raise exception 'FAIL B: "applications: public read deposit-paid" still exists';
  end if;
  if has_table_privilege('anon', 'public.applications', 'select') then raise exception 'FAIL B: anon holds table SELECT on applications'; end if;
  if has_any_column_privilege('anon', 'public.applications', 'select') then raise exception 'FAIL B: anon still holds a column SELECT on applications (074 grant not revoked)'; end if;

  -- Positive control, as anon: the view returns exactly the rows the old policy did.
  n := (select count(*) from public.applications a
         where a.status = 'approved' and a.needs_roster = false and (public.has_paid_deposit(a.id) or a.directory_override = true));
  set local role anon;
  n_view := (select count(*) from public.applications_public);
  reset role;
  if n_view <> n then raise exception 'FAIL B: anon sees % view rows, predicate says %', n_view, n; end if;

  begin
    set local role anon;
    perform 1 from public.applications limit 1;
    reset role;
    raise exception 'FAIL B: anon selected from the applications TABLE';
  exception
    when insufficient_privilege then reset role; raise notice 'PASS B1: anon table read refused (42501)';
  end;
  raise notice 'PASS B: public policy dropped; anon reads % rows through the view and none through the table', n_view;
end $$;

-- ── C. staff policy: content_editor and sponsorship_manager keep their rows  (NOTICE pane)
do $$
declare n_pred int; n_seen int; v_uid uuid;
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'applications' and policyname = 'applications: staff read directory rows') then
    raise exception 'FAIL C: staff policy missing';
  end if;
  if (select roles::text from pg_policies where schemaname = 'public' and tablename = 'applications' and policyname = 'applications: staff read directory rows') <> '{authenticated}' then
    raise exception 'FAIL C: staff policy is not scoped to authenticated';
  end if;
  n_pred := (select count(*) from public.applications a
              where a.status = 'approved' and a.needs_roster = false and (public.has_paid_deposit(a.id) or a.directory_override = true));
  -- As a content_editor, if one exists (skipped with a notice otherwise).
  v_uid := (select id from public.profiles where role = 'content_editor' order by created_at limit 1);
  if v_uid is null then
    raise notice 'SKIP C: no content_editor profile to test as';
  else
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    n_seen := (select count(*) from public.applications);
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if n_seen <> n_pred then raise exception 'FAIL C: content_editor sees % rows, predicate says %', n_seen, n_pred; end if;
    raise notice 'PASS C: content_editor sees exactly the % directory rows', n_seen;
  end if;
end $$;

-- ── D. owners keep their own row  (NOTICE pane)
do $$
declare v_uid uuid; n_own int; n_seen int;
begin
  v_uid := (select user_id from public.applications where user_id is not null order by created_at limit 1);
  if v_uid is null then raise notice 'SKIP D: no application with an owner'; return; end if;
  n_own := (select count(*) from public.applications where user_id = v_uid);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  n_seen := (select count(*) from public.applications);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if n_seen < n_own then raise exception 'FAIL D: owner sees % rows but owns %', n_seen, n_own; end if;
  raise notice 'PASS D: an owner still reads their own % row(s) (sees %)', n_own, n_seen;
end $$;

-- ── E. artists[].id_url is stripped in the view  (NOTICE pane)
do $$
declare n int;
begin
  n := (select count(*) from public.applications_public v, jsonb_array_elements(coalesce(v.artists, '[]'::jsonb)) el where el ? 'id_url');
  if n <> 0 then raise exception 'FAIL E: % artist element(s) in the view still carry id_url', n; end if;
  raise notice 'PASS E: no id_url in any view artists element (% rows checked)', (select count(*) from public.applications_public);
end $$;

-- ── F. write policies by role, FROM THE CATALOG  (grid + NOTICE)
-- No hardcoded policy list (Ryan, 2026-09-25). Hard rule: no write policy in
-- public is PUBLIC-scoped (no TO clause). Anon-reachable writes are printed
-- and reported by count; 076 takes that count to zero and asserts it.
select tablename, policyname, cmd, roles::text from pg_policies
 where schemaname = 'public' and cmd <> 'SELECT' and ('anon' = any(roles) or roles = '{public}')
 order by tablename, policyname;
do $$
declare bad text; anon_writes text; sel text;
begin
  bad := (select string_agg(tablename || ': ' || policyname, ', ') from pg_policies
           where schemaname = 'public' and roles = '{public}' and cmd <> 'SELECT');
  if bad is not null then raise exception 'FAIL F: PUBLIC-scoped write policies remain: %', bad; end if;
  anon_writes := (select string_agg(tablename || ': ' || policyname || ' (' || cmd || ')', ', ') from pg_policies
                   where schemaname = 'public' and cmd <> 'SELECT' and 'anon' = any(roles));
  if anon_writes is not null then
    raise notice 'REVIEW F: policies that grant anon a write: % - expected only the sponsor insert until 076 is applied, none after', anon_writes;
  else
    raise notice 'PASS F: no policy grants anon a write';
  end if;
  sel := (select string_agg(tablename || ': ' || policyname, ', ') from pg_policies where schemaname = 'public' and roles = '{public}' and cmd = 'SELECT');
  if sel is not null then raise notice 'REVIEW F: PUBLIC-scoped SELECT policies (public reads by design; owner reads are dead for anon): %', sel; end if;
  raise notice 'PASS F: every write policy in public names its roles';
end $$;

