-- ============================================================
-- HOW TO RUN: after 099 is applied, paste the whole file. Read the MESSAGES
-- pane; a failure RAISES. Block B uses a fixture on the ACTIVE event named
-- "ZZ VERIFY 099 (DELETE ME)" and deletes it (its vip row cascades).
-- Supersedes verify_098 block A's column list.
-- ============================================================

-- ── A. the view's columns and access  (NOTICE pane)
do $$
declare v_cols text;
begin
  select string_agg(column_name::text, ',' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema = 'public' and table_name = 'vip_featured_public';
  if v_cols is distinct from 'id,display_order,artist_name,shop,instagram,photo_url,tv_credit,bio,application_id,artist_uid,in_directory' then
    raise exception 'FAIL A: vip_featured_public columns are %', v_cols;
  end if;
  if not has_table_privilege('anon', 'public.vip_featured_public', 'select') then raise exception 'FAIL A: anon cannot read vip_featured_public'; end if;
  if has_table_privilege('anon', 'public.vip_featured_artists', 'select') then raise exception 'FAIL A: anon can read vip_featured_artists'; end if;
  raise notice 'PASS A: 098 columns in order plus application_id, artist_uid, in_directory; anon reads the view only';
end $$;

-- ── B. ids and in_directory  (NOTICE pane)
do $$
declare v_event uuid; v_app uuid; v_uid text; r record;
begin
  v_event := (select id from public.events where is_active limit 1);
  if v_event is null then raise exception 'ABORT: no active event'; end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, artist_single_qty, artist_count, total_amount, status, artists)
  values (v_event, null, 'artist', 'ZZ VERIFY 099 (DELETE ME)', 'ZZ', 'zz-099@example.com', 1, 1,
          public.application_list_price('artist', 1, 0, 0, 0, 0, 1, '[]'::jsonb, false), 'approved',
          jsonb_build_array(jsonb_build_object('name', 'ZZ 099')))
  returning id into v_app;
  update public.applications set needs_roster = true where id = v_app;
  select artists->0->>'uid' into v_uid from public.applications where id = v_app;
  insert into public.vip_featured_artists (application_id, artist_uid) values (v_app, v_uid);

  set local role anon;
  select application_id, artist_uid, in_directory into r from public.vip_featured_public where shop = 'ZZ VERIFY 099 (DELETE ME)';
  reset role;
  if r.application_id is distinct from v_app or r.artist_uid is distinct from v_uid then raise exception 'FAIL B1: ids are % / %', r.application_id, r.artist_uid; end if;
  if r.in_directory is distinct from false then raise exception 'FAIL B1: an unlisted application reads in_directory = %', r.in_directory; end if;
  raise notice 'PASS B1: application_id and artist_uid; unlisted reads in_directory false';

  update public.applications set needs_roster = false, directory_override = true where id = v_app;
  if not exists (select 1 from public.applications_public where id = v_app) then raise exception 'ABORT B2: fixture did not reach applications_public'; end if;
  if (select in_directory from public.vip_featured_public where shop = 'ZZ VERIFY 099 (DELETE ME)') is distinct from true then
    raise exception 'FAIL B2: a listed application reads in_directory false';
  end if;
  raise notice 'PASS B2: listed reads in_directory true';

  delete from public.applications where id = v_app;
  if exists (select 1 from public.applications where business_name = 'ZZ VERIFY 099 (DELETE ME)') or exists (select 1 from public.vip_featured_artists where application_id = v_app) then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS B: fixtures removed';
end $$;
