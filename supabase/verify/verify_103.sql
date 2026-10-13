-- ============================================================
-- HOW TO RUN: after 103 is applied, paste the whole file (copy it from the
-- Raw file on develop). Read the MESSAGES pane; a failure RAISES. Block B
-- uses fixtures on the ACTIVE event named "ZZ VERIFY 103 ... (DELETE ME)"
-- and deletes them. verify_101 is HISTORICAL from 103 on (it asserts the
-- view's pre-103 columns); this file re-asserts everything the DROP VIEW
-- could have lost.
-- ============================================================

-- ── A. structure, grants, the ingest column  (NOTICE pane)
do $$
declare v_cols text; v_opts text[];
begin
  select string_agg(column_name::text, ',' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema = 'public' and table_name = 'artist_social_handles_v';
  if v_cols is distinct from 'artist_uid,application_id,display_name,handle,booth_label,exhibitor_type' then
    raise exception 'FAIL A: artist_social_handles_v columns are %', v_cols;
  end if;
  v_opts := (select reloptions from pg_class where oid = 'public.artist_social_handles_v'::regclass);
  if v_opts is null or not ('security_invoker=true' = any(v_opts)) then
    raise exception 'FAIL A: artist_social_handles_v is not security_invoker (reloptions %)', v_opts;
  end if;
  -- the grants the DROP discarded: still service_role only
  if has_table_privilege('anon', 'public.artist_social_handles_v', 'select')
     or has_table_privilege('authenticated', 'public.artist_social_handles_v', 'select') then
    raise exception 'FAIL A: artist_social_handles_v is readable by anon or authenticated after the recreate';
  end if;
  if not has_table_privilege('service_role', 'public.artist_social_handles_v', 'select') then
    raise exception 'FAIL A: service_role cannot read artist_social_handles_v';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'artist_social_posts'
                    and column_name = 'exhibitor_type' and column_default like '%artist%' and is_nullable = 'NO') then
    raise exception 'FAIL A: artist_social_posts.exhibitor_type missing or not defaulted to artist';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.artist_social_posts'::regclass
                    and conname = 'artist_social_posts_exhibitor_type_check') then
    raise exception 'FAIL A: exhibitor_type check constraint missing';
  end if;

  -- 101''s policies are untouched
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'artist_social_posts') <> 2
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'artist_repost_opt_outs') <> 1
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'artist_scrape_runs') <> 1 then
    raise exception 'FAIL A: the 101 policies changed';
  end if;
  raise notice 'PASS A: new view shape, service_role-only grants survive the recreate, ingest column with its check, policies untouched';
end $$;

-- ── B. vendor rows, gate, normalization, opt-out, artist-wins dedupe  (NOTICE pane)
do $$
declare
  v_harness uuid; v_event uuid; v_art uuid; v_ven1 uuid; v_ven2 uuid;
  r record; n int; v_ok boolean;
begin
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  v_event   := (select id from public.events where is_active limit 1);
  if v_harness is null or v_event is null then raise exception 'ABORT: RLS harness user or active event missing'; end if;
  perform set_config('request.jwt.claims', '', true);

  -- the artist side (unchanged by 103): one roster artist behind the override gate
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, artist_single_qty, artist_count, total_amount, status, directory_override, artists)
  values (v_event, v_harness, 'artist', 'ZZ VERIFY 103 SHOP (DELETE ME)', 'ZZ', 'zz-103@example.com', 1, 1,
          public.application_list_price('artist', 1, 0, 0, 0, 0, 1, '[]'::jsonb, false), 'approved', true,
          jsonb_build_array(jsonb_build_object('name', 'ZZ Artist', 'instagram', 'ZZ_Shared')))
  returning id into v_art;
  select * into r from public.artist_social_handles_v where application_id = v_art;
  if r.handle is distinct from 'zz_shared' or r.exhibitor_type is distinct from 'artist' or r.artist_uid is null then
    raise exception 'FAIL B1: the artist arm changed (handle %, type %, uid %)', r.handle, r.exhibitor_type, r.artist_uid;
  end if;
  raise notice 'PASS B1: the artist arm is unchanged and carries exhibitor_type = artist';

  -- B2. a vendor: approved alone is not enough; a paid deposit opens the gate
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, vendor_single_qty, artist_count, total_amount, status, instagram)
  values (v_event, null, 'vendor', 'ZZ VERIFY 103 VENDOR (DELETE ME)', 'ZZ', 'zz-103-v@example.com', 1, 0,
          public.application_list_price('vendor', 0, 0, 1, 0, 0, 0, '[]'::jsonb, false), 'approved',
          'https://www.instagram.com/ZZ_Vend?stkn=abc&utm_source=qr')
  returning id into v_ven1;
  if exists (select 1 from public.artist_social_handles_v where application_id = v_ven1) then
    raise exception 'FAIL B2: an approved vendor with nothing paid is in the view';
  end if;
  insert into public.invoices (application_id, amount, amount_paid, status) values (v_ven1, 100, 0, 'pending');
  update public.invoices set deposit_paid_at = now() where application_id = v_ven1;
  select * into r from public.artist_social_handles_v where application_id = v_ven1;
  if r.handle is distinct from 'zz_vend' or r.exhibitor_type is distinct from 'vendor'
     or r.artist_uid is not null or r.display_name is distinct from 'ZZ VERIFY 103 VENDOR (DELETE ME)' then
    raise exception 'FAIL B2: vendor row wrong (handle %, type %, uid %, name %)', r.handle, r.exhibitor_type, r.artist_uid, r.display_name;
  end if;
  raise notice 'PASS B2: a deposit-paid vendor appears; the URL with a query string normalizes; artist_uid null, display_name = business name';

  -- B3. a facebook link in the IG field drops the vendor; fixing it brings them back
  update public.applications set instagram = 'facebook.com/zzvend' where id = v_ven1;
  if exists (select 1 from public.artist_social_handles_v where application_id = v_ven1) then
    raise exception 'FAIL B3: a facebook link in the vendor IG field is in the view';
  end if;
  update public.applications set instagram = '@ZZ_Vend ' where id = v_ven1;
  if not exists (select 1 from public.artist_social_handles_v where application_id = v_ven1 and handle = 'zz_vend') then
    raise exception 'FAIL B3: the @-prefixed handle with a trailing space did not normalize back to zz_vend';
  end if;
  raise notice 'PASS B3: facebook excluded; @, case and whitespace normalize on the vendor arm';

  -- B4. a NULL-uid opt-out excludes the vendor; removing it restores them
  insert into public.artist_repost_opt_outs (application_id, artist_uid) values (v_ven1, null);
  if exists (select 1 from public.artist_social_handles_v where application_id = v_ven1) then
    raise exception 'FAIL B4: an opted-out vendor is in the view';
  end if;
  delete from public.artist_repost_opt_outs where application_id = v_ven1;
  if not exists (select 1 from public.artist_social_handles_v where application_id = v_ven1) then
    raise exception 'FAIL B4: the vendor did not return after the opt-out was removed';
  end if;
  raise notice 'PASS B4: the whole-application opt-out gates the vendor arm';

  -- B5. a vendor sharing an artist''s handle loses the tie
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, vendor_single_qty, artist_count, total_amount, status, instagram)
  values (v_event, null, 'vendor', 'ZZ VERIFY 103 VENDOR 2 (DELETE ME)', 'ZZ', 'zz-103-v2@example.com', 1, 0,
          public.application_list_price('vendor', 0, 0, 1, 0, 0, 0, '[]'::jsonb, false), 'approved', 'ZZ_SHARED')
  returning id into v_ven2;
  insert into public.invoices (application_id, amount, amount_paid, status) values (v_ven2, 100, 0, 'pending');
  update public.invoices set deposit_paid_at = now() where application_id = v_ven2;
  n := (select count(*) from public.artist_social_handles_v where handle = 'zz_shared');
  select * into r from public.artist_social_handles_v where handle = 'zz_shared';
  if n <> 1 or r.application_id <> v_art or r.exhibitor_type <> 'artist' then
    raise exception 'FAIL B5: artist did not win the shared handle (% rows, type %)', n, r.exhibitor_type;
  end if;
  raise notice 'PASS B5: one row per handle; the artist wins the tie';

  -- B6. the ingest column: vendor accepted, anything else refused, default artist
  insert into public.artist_social_posts (application_id, handle, shortcode, post_url, media, scraped_at, exhibitor_type)
  values (v_ven1, 'zz_vend', 'ZZVERIFY103V', 'https://www.instagram.com/p/ZZVERIFY103V/', '[]'::jsonb, now(), 'vendor');
  insert into public.artist_social_posts (handle, shortcode, post_url, media, scraped_at)
  values ('zz_shared', 'ZZVERIFY103A', 'https://www.instagram.com/p/ZZVERIFY103A/', '[]'::jsonb, now());
  if (select exhibitor_type from public.artist_social_posts where shortcode = 'ZZVERIFY103A') <> 'artist' then
    raise exception 'FAIL B6: exhibitor_type does not default to artist';
  end if;
  v_ok := false;
  begin
    insert into public.artist_social_posts (handle, shortcode, post_url, media, scraped_at, exhibitor_type)
    values ('zz_vend', 'ZZVERIFY103X', 'https://www.instagram.com/p/ZZVERIFY103X/', '[]'::jsonb, now(), 'sponsor');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B6: exhibitor_type = sponsor was accepted'; end if;
  raise notice 'PASS B6: exhibitor_type takes vendor, defaults to artist, refuses anything else';

  delete from public.artist_social_posts where shortcode like 'ZZVERIFY103%';
  delete from public.applications where id in (v_art, v_ven1, v_ven2);
end $$;

-- ── C. fixtures gone  (NOTICE pane)
do $$
begin
  if exists (select 1 from public.applications where business_name like 'ZZ VERIFY 103%')
     or exists (select 1 from public.artist_social_posts where shortcode like 'ZZVERIFY103%') then
    raise exception 'FAIL C: fixtures left behind';
  end if;
  raise notice 'PASS C: fixtures removed';
end $$;
