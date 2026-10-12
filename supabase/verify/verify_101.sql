-- ============================================================
-- HOW TO RUN: after 101 is applied, paste the whole file (copy it from the
-- Raw file on develop). Read the MESSAGES pane; a failure RAISES. Blocks B-D
-- use fixtures on the ACTIVE event named "ZZ VERIFY 101 ... (DELETE ME)" and
-- delete them. The artist-posts BUCKET is not checked here: its SQL
-- (supabase/seeds/artist_posts_bucket.sql) carries its own read-back.
-- ============================================================

-- ── A. structure and access  (NOTICE pane)
do $$
declare v_cols text; v_opts text[];
begin
  if not (select relrowsecurity from pg_class where oid = 'public.artist_repost_opt_outs'::regclass) then raise exception 'FAIL A: RLS is off on artist_repost_opt_outs'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.artist_social_posts'::regclass) then raise exception 'FAIL A: RLS is off on artist_social_posts'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.artist_scrape_runs'::regclass) then raise exception 'FAIL A: RLS is off on artist_scrape_runs'; end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'artist_repost_opt_outs') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'artist_repost_opt_outs'
                     and policyname = 'artist_repost_opt_outs: admin all' and roles = '{authenticated}'
                     and qual like '%is_admin()%' and with_check like '%is_admin()%') then
    raise exception 'FAIL A: artist_repost_opt_outs must have exactly the admin-all policy';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'artist_social_posts') <> 2
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'artist_social_posts'
                     and policyname = 'artist_social_posts: admin read' and cmd = 'SELECT' and qual like '%is_admin()%')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'artist_social_posts'
                     and policyname = 'artist_social_posts: admin update' and cmd = 'UPDATE'
                     and qual like '%is_admin()%' and with_check like '%is_admin()%') then
    raise exception 'FAIL A: artist_social_posts must have exactly admin read + admin update';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'artist_scrape_runs') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'artist_scrape_runs'
                     and policyname = 'artist_scrape_runs: admin read' and cmd = 'SELECT' and qual like '%is_admin()%') then
    raise exception 'FAIL A: artist_scrape_runs must have exactly the admin-read policy';
  end if;

  if has_table_privilege('anon', 'public.artist_repost_opt_outs', 'select') then raise exception 'FAIL A: anon can read artist_repost_opt_outs'; end if;
  if has_table_privilege('anon', 'public.artist_social_posts', 'select') then raise exception 'FAIL A: anon can read artist_social_posts'; end if;
  if has_table_privilege('anon', 'public.artist_scrape_runs', 'select') then raise exception 'FAIL A: anon can read artist_scrape_runs'; end if;
  if has_table_privilege('authenticated', 'public.artist_social_posts', 'insert')
     or has_table_privilege('authenticated', 'public.artist_social_posts', 'delete') then
    raise exception 'FAIL A: authenticated can insert or delete artist_social_posts (service role only)';
  end if;
  if has_table_privilege('authenticated', 'public.artist_scrape_runs', 'insert') then raise exception 'FAIL A: authenticated can write artist_scrape_runs'; end if;

  -- the view: service_role only, security_invoker
  if has_table_privilege('anon', 'public.artist_social_handles_v', 'select')
     or has_table_privilege('authenticated', 'public.artist_social_handles_v', 'select') then
    raise exception 'FAIL A: artist_social_handles_v is readable by anon or authenticated';
  end if;
  if not has_table_privilege('service_role', 'public.artist_social_handles_v', 'select') then
    raise exception 'FAIL A: service_role cannot read artist_social_handles_v';
  end if;
  v_opts := (select reloptions from pg_class where oid = 'public.artist_social_handles_v'::regclass);
  if v_opts is null or not ('security_invoker=true' = any(v_opts)) then
    raise exception 'FAIL A: artist_social_handles_v is not security_invoker (reloptions %)', v_opts;
  end if;
  select string_agg(column_name::text, ',' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema = 'public' and table_name = 'artist_social_handles_v';
  if v_cols is distinct from 'artist_uid,application_id,display_name,handle,booth_label' then
    raise exception 'FAIL A: artist_social_handles_v columns are %', v_cols;
  end if;

  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'artist_repost_opt_outs' and indexname = 'artist_repost_opt_outs_one_per_subject') then
    raise exception 'FAIL A: unique index artist_repost_opt_outs_one_per_subject missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.artist_social_posts'::regclass and contype = 'u') then
    raise exception 'FAIL A: unique (platform, shortcode) missing on artist_social_posts';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'artist_social_posts' and indexname = 'artist_social_posts_handle_top5_idx')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'artist_social_posts' and indexname = 'artist_social_posts_status_idx') then
    raise exception 'FAIL A: artist_social_posts indexes missing';
  end if;
  raise notice 'PASS A: admin-only tables, service_role-only security_invoker view, upsert key and indexes in place';
end $$;

-- ── B. the view: gate, normalization, dedupe, opt-out  (NOTICE pane)
do $$
declare
  v_admin uuid; v_harness uuid; v_event uuid; v_app1 uuid; v_app2 uuid;
  u1 text; u2 text; v_bn1 text; v_bn2 text; v_label text; n int; v_ok boolean; v_app uuid;
begin
  v_admin   := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  v_event   := (select id from public.events where is_active limit 1);
  if v_admin is null or v_harness is null or v_event is null then raise exception 'ABORT: admin, RLS harness user or active event missing'; end if;
  perform set_config('request.jwt.claims', '', true);

  -- app1: one double booth, 4 roster artists exercising every handle format
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, artist_double_qty, artist_count, total_amount, status, artists)
  values (v_event, v_harness, 'artist', 'ZZ VERIFY 101 SHOP (DELETE ME)', 'ZZ', 'zz-101@example.com', 1, 4,
          public.application_list_price('artist', 0, 1, 0, 0, 0, 4, '[]'::jsonb, false), 'pending',
          jsonb_build_array(
            jsonb_build_object('name', 'ZZ One',   'instagram', '@ZZ_Handle.One '),
            jsonb_build_object('name', 'ZZ Two',   'nickname', 'ZZ Nick', 'instagram', 'https://www.instagram.com/zz_two/?hl=en'),
            jsonb_build_object('name', 'ZZ Three', 'instagram', 'facebook.com/zzthree'),
            jsonb_build_object('name', 'ZZ Four',  'instagram', '')))
  returning id into v_app1;
  select artists->0->>'uid', artists->1->>'uid' into u1, u2 from public.applications where id = v_app1;

  -- B1. pending, then approved with nothing paid: not in the view
  if exists (select 1 from public.artist_social_handles_v where application_id = v_app1) then raise exception 'FAIL B1: a pending application is in the view'; end if;
  update public.applications set status = 'approved' where id = v_app1;
  if exists (select 1 from public.artist_social_handles_v where application_id = v_app1) then raise exception 'FAIL B1: approved without deposit/override/comp is in the view'; end if;
  raise notice 'PASS B1: the directory gate holds (pending and unpaid-approved are out)';

  -- B2. directory_override opens the gate; normalization and display names
  update public.applications set directory_override = true where id = v_app1;
  n := (select count(*) from public.artist_social_handles_v where application_id = v_app1);
  if n <> 2 then raise exception 'FAIL B2: expected 2 rows (facebook and empty excluded), got %', n; end if;
  if not exists (select 1 from public.artist_social_handles_v where application_id = v_app1 and artist_uid = u1 and handle = 'zz_handle.one' and display_name = 'ZZ One') then
    raise exception 'FAIL B2: @-prefixed uppercase handle with trailing space did not normalize to zz_handle.one';
  end if;
  if not exists (select 1 from public.artist_social_handles_v where application_id = v_app1 and artist_uid = u2 and handle = 'zz_two' and display_name = 'ZZ Nick') then
    raise exception 'FAIL B2: instagram.com URL did not normalize to zz_two with the nickname as display_name';
  end if;
  raise notice 'PASS B2: directory_override passes the gate; @, URL, case and whitespace normalize; facebook and empty are out';

  -- B3. booth_label aggregates assigned booths in order
  select booth_number into v_bn1 from public.booths where event_id = v_event and application_id is null order by booth_number limit 1;
  select booth_number into v_bn2 from public.booths where event_id = v_event and application_id is null and booth_number <> v_bn1 order by booth_number limit 1;
  if v_bn1 is null or v_bn2 is null then raise exception 'ABORT B3: no free booths on the active event'; end if;
  if exists (select 1 from public.artist_social_handles_v where application_id = v_app1 and booth_label is not null) then raise exception 'FAIL B3: booth_label set with no booth assigned'; end if;
  update public.booths set application_id = v_app1 where event_id = v_event and booth_number in (v_bn1, v_bn2);
  select booth_label into v_label from public.artist_social_handles_v where application_id = v_app1 and handle = 'zz_two';
  if v_label is distinct from (select string_agg(x, ', ' order by x) from unnest(array[v_bn1, v_bn2]) as x) then
    raise exception 'FAIL B3: booth_label is % (expected the two assigned booths)', v_label;
  end if;
  raise notice 'PASS B3: booth_label is null unassigned, then lists both booths';

  -- B4. deposit path (override off, paid invoice on)
  update public.applications set directory_override = false where id = v_app1;
  if exists (select 1 from public.artist_social_handles_v where application_id = v_app1) then raise exception 'FAIL B4: override off, still in the view'; end if;
  insert into public.invoices (application_id, amount, amount_paid, status) values (v_app1, 100, 0, 'pending');
  update public.invoices set deposit_paid_at = now() where application_id = v_app1;
  if (select count(*) from public.artist_social_handles_v where application_id = v_app1) <> 2 then raise exception 'FAIL B4: a paid deposit does not pass the gate'; end if;
  raise notice 'PASS B4: a paid deposit passes the gate';

  -- B5. comp path (comped_at alone, the Adu Ink / Pennyboy / Sir George shape):
  --     a trigger strips comped_at on insert, so the admin comps it through
  --     set_comp (089), as production does. Dedupe: app2 repeats app1''s
  --     first handle in another casing.
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, artist_single_qty, artist_count, total_amount, status, artists)
  values (v_event, null, 'artist', 'ZZ VERIFY 101 COMP (DELETE ME)', 'ZZ', 'zz-101-c@example.com', 1, 1,
          public.application_list_price('artist', 1, 0, 0, 0, 0, 1, '[]'::jsonb, false), 'approved',
          jsonb_build_array(jsonb_build_object('name', 'ZZ Dup', 'instagram', 'ZZ_HANDLE.ONE')))
  returning id into v_app2;
  if exists (select 1 from public.artist_social_handles_v where application_id = v_app2) then raise exception 'FAIL B5: app2 is in the view before the comp'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.set_comp(v_app2, true, false);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select comped_at from public.applications where id = v_app2) is null then raise exception 'FAIL B5: set_comp did not set comped_at'; end if;
  -- both fixtures share this transaction''s now(); make app2 the later application, as it would be live
  update public.applications set created_at = created_at + interval '1 second' where id = v_app2;
  n := (select count(*) from public.artist_social_handles_v where handle = 'zz_handle.one');
  select application_id into v_app from public.artist_social_handles_v where handle = 'zz_handle.one';
  if n <> 1 or v_app <> v_app1 then raise exception 'FAIL B5: dedupe by handle broken (% rows, application %)', n, v_app; end if;
  raise notice 'PASS B5: comped_at alone passes the gate; a duplicate handle keeps the earliest application';

  -- B6. opt-outs: one artist, whole application (dup surfaces), unique
  insert into public.artist_repost_opt_outs (application_id, artist_uid) values (v_app1, u2);
  if exists (select 1 from public.artist_social_handles_v where handle = 'zz_two') then raise exception 'FAIL B6: an opted-out artist is in the view'; end if;
  if not exists (select 1 from public.artist_social_handles_v where application_id = v_app1 and handle = 'zz_handle.one') then raise exception 'FAIL B6: opt-out removed a sibling artist'; end if;
  insert into public.artist_repost_opt_outs (application_id, artist_uid) values (v_app1, null);
  select application_id into v_app from public.artist_social_handles_v where handle = 'zz_handle.one';
  if v_app is distinct from v_app2 then raise exception 'FAIL B6: whole-application opt-out did not hand the handle to the comped duplicate'; end if;
  insert into public.artist_repost_opt_outs (application_id, artist_uid) values (v_app2, null);
  if exists (select 1 from public.artist_social_handles_v where application_id in (v_app1, v_app2)) then raise exception 'FAIL B6: an opted-out application is in the view'; end if;
  v_ok := false;
  begin
    insert into public.artist_repost_opt_outs (application_id, artist_uid) values (v_app1, null);
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B6: a duplicate opt-out was accepted'; end if;
  raise notice 'PASS B6: per-artist and whole-application opt-outs work; one opt-out per subject';

  -- B7. owners cannot see or write opt-outs
  v_ok := false;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  begin
    insert into public.artist_repost_opt_outs (application_id, artist_uid) values (v_app1, u1);
  exception when insufficient_privilege then v_ok := true;
  end;
  n := (select count(*) from public.artist_repost_opt_outs);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if not v_ok then raise exception 'FAIL B7: an owner inserted an opt-out'; end if;
  if n <> 0 then raise exception 'FAIL B7: an owner can read opt-outs (% rows)', n; end if;
  raise notice 'PASS B7: owners can neither write nor read opt-outs';

  delete from public.applications where id in (v_app1, v_app2);
end $$;

-- ── C. posts and scrape runs: writes, state, roles  (NOTICE pane)
do $$
declare
  v_admin uuid; v_harness uuid; v_event uuid; v_app uuid; u1 text; n int; v_ok boolean; v_status text;
begin
  v_admin   := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  v_event   := (select id from public.events where is_active limit 1);
  perform set_config('request.jwt.claims', '', true);

  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, artist_single_qty, artist_count, total_amount, status, artists)
  values (v_event, v_harness, 'artist', 'ZZ VERIFY 101 POSTS (DELETE ME)', 'ZZ', 'zz-101-p@example.com', 1, 1,
          public.application_list_price('artist', 1, 0, 0, 0, 0, 1, '[]'::jsonb, false), 'approved',
          jsonb_build_array(jsonb_build_object('name', 'ZZ P', 'instagram', 'zz_posts')))
  returning id into v_app;
  select artists->0->>'uid' into u1 from public.applications where id = v_app;

  -- C1. the service role ingests; the upsert key holds
  set local role service_role;
  insert into public.artist_social_posts (application_id, artist_uid, handle, shortcode, post_url, post_type, media, scraped_at, likes, comments, score, rank)
  values (v_app, u1, 'zz_posts', 'ZZVERIFY101A', 'https://www.instagram.com/p/ZZVERIFY101A/', 'image',
          '[{"path": "artist-posts/zz_posts/ZZVERIFY101A/0.jpg", "type": "image"}]'::jsonb, now(), 10, 2, 16, 1);
  v_ok := false;
  begin
    insert into public.artist_social_posts (handle, shortcode, post_url, media, scraped_at)
    values ('zz_posts', 'ZZVERIFY101A', 'https://www.instagram.com/p/ZZVERIFY101A/', '[]'::jsonb, now());
  exception when unique_violation then v_ok := true;
  end;
  reset role;
  if not v_ok then raise exception 'FAIL C1: duplicate (platform, shortcode) accepted'; end if;
  raise notice 'PASS C1: service role ingests; (platform, shortcode) is unique';

  -- C2. a metrics-only re-upsert never resets state
  update public.artist_social_posts set status = 'sent', sent_at = now(), sent_by = v_admin where shortcode = 'ZZVERIFY101A';
  set local role service_role;
  insert into public.artist_social_posts (application_id, artist_uid, handle, shortcode, post_url, post_type, media, scraped_at, likes, comments, score, rank)
  values (v_app, u1, 'zz_posts', 'ZZVERIFY101A', 'https://www.instagram.com/p/ZZVERIFY101A/', 'image',
          '[{"path": "artist-posts/zz_posts/ZZVERIFY101A/0.jpg", "type": "image"}]'::jsonb, now(), 99, 9, 126, 1)
  on conflict (platform, shortcode) do update
    set likes = excluded.likes, comments = excluded.comments, score = excluded.score,
        rank = excluded.rank, media = excluded.media, scraped_at = excluded.scraped_at,
        is_current_top5 = true;
  reset role;
  select status into v_status from public.artist_social_posts where shortcode = 'ZZVERIFY101A';
  if v_status is distinct from 'sent' then raise exception 'FAIL C2: the ingest upsert reset status to %', v_status; end if;
  if (select likes from public.artist_social_posts where shortcode = 'ZZVERIFY101A') <> 99 then raise exception 'FAIL C2: metrics not updated'; end if;
  raise notice 'PASS C2: ingest re-upsert updates metrics and keeps status=sent';

  -- C3. rank outside 1-5 is refused
  v_ok := false;
  begin
    insert into public.artist_social_posts (handle, shortcode, post_url, media, scraped_at, rank)
    values ('zz_posts', 'ZZVERIFY101B', 'https://www.instagram.com/p/ZZVERIFY101B/', '[]'::jsonb, now(), 6);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL C3: rank 6 accepted'; end if;
  raise notice 'PASS C3: rank is 1-5';

  -- C4. scrape runs: service role writes, admin reads, others see nothing
  set local role service_role;
  insert into public.artist_scrape_runs (handle, result, post_count_scanned) values ('zz_posts', 'ok', 42);
  reset role;

  -- C5. the harness user sees nothing and cannot insert; anon has no grant
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  n := (select count(*) from public.artist_social_posts) + (select count(*) from public.artist_scrape_runs);
  update public.artist_social_posts set admin_caption = 'ZZ NOPE' where shortcode = 'ZZVERIFY101A';
  v_ok := false;
  begin
    insert into public.artist_social_posts (handle, shortcode, post_url, media, scraped_at)
    values ('zz_posts', 'ZZVERIFY101C', 'https://www.instagram.com/p/ZZVERIFY101C/', '[]'::jsonb, now());
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if n <> 0 then raise exception 'FAIL C5: a non-admin reads posts or scrape runs (% rows)', n; end if;
  if not v_ok then raise exception 'FAIL C5: a non-admin inserted a post'; end if;
  if (select admin_caption from public.artist_social_posts where shortcode = 'ZZVERIFY101A') is not null then
    raise exception 'FAIL C5: a non-admin updated a post';
  end if;
  v_ok := false;
  set local role anon;
  begin
    n := (select count(*) from public.artist_social_posts);
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  if not v_ok then raise exception 'FAIL C5: anon can select artist_social_posts'; end if;
  raise notice 'PASS C5: non-admins see and change nothing; anon has no grant';

  -- C6. the admin reads and updates state
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  n := (select count(*) from public.artist_social_posts where shortcode = 'ZZVERIFY101A')
     + (select count(*) from public.artist_scrape_runs where handle = 'zz_posts');
  update public.artist_social_posts set status = 'skipped' where shortcode = 'ZZVERIFY101A';
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if n <> 2 then raise exception 'FAIL C6: the admin cannot read posts and scrape runs (% of 2)', n; end if;
  if (select status from public.artist_social_posts where shortcode = 'ZZVERIFY101A') <> 'skipped' then
    raise exception 'FAIL C6: the admin update did not stick';
  end if;
  raise notice 'PASS C6: the admin reads and updates post state';

  -- C7. deleting the application keeps the sent history (application_id nulls)
  delete from public.applications where id = v_app;
  if (select count(*) from public.artist_social_posts where shortcode = 'ZZVERIFY101A' and application_id is null) <> 1 then
    raise exception 'FAIL C7: post history did not survive the application deletion';
  end if;
  raise notice 'PASS C7: post rows survive an application deletion (application_id set null)';

  delete from public.artist_social_posts where shortcode like 'ZZVERIFY101%';
  delete from public.artist_scrape_runs where handle = 'zz_posts';
end $$;

-- ── D. the view by role  (NOTICE pane)
do $$
declare n int; v_ok boolean;
begin
  set local role service_role;
  n := (select count(*) from public.artist_social_handles_v);
  reset role;
  raise notice 'PASS D: service_role reads the view (% row(s) right now)', n;

  v_ok := false;
  set local role anon;
  begin
    n := (select count(*) from public.artist_social_handles_v);
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  if not v_ok then raise exception 'FAIL D: anon can read artist_social_handles_v'; end if;

  v_ok := false;
  set local role authenticated;
  begin
    n := (select count(*) from public.artist_social_handles_v);
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  if not v_ok then raise exception 'FAIL D: authenticated can read artist_social_handles_v'; end if;
  raise notice 'PASS D: anon and authenticated cannot read the view';
end $$;

-- ── E. fixtures gone  (NOTICE pane)
do $$
begin
  if exists (select 1 from public.applications where business_name like 'ZZ VERIFY 101%')
     or exists (select 1 from public.artist_social_posts where shortcode like 'ZZVERIFY101%')
     or exists (select 1 from public.artist_scrape_runs where handle in ('zz_posts'))
     or exists (select 1 from public.booths b join public.applications a on a.id = b.application_id where a.business_name like 'ZZ VERIFY 101%') then
    raise exception 'FAIL E: fixtures left behind';
  end if;
  raise notice 'PASS E: fixtures removed (booths released by the application delete)';
end $$;
