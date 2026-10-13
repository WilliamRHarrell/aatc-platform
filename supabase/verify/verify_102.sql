-- ============================================================
-- HOW TO RUN: after 102 is applied, paste the whole file (copy it from the
-- Raw file on develop). Read the MESSAGES pane; a failure RAISES. The fixture
-- row is deleted at the end.
-- ============================================================

do $$
declare v_before timestamptz; v_after timestamptz;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'artist_social_posts' and column_name = 'updated_at') then
    raise exception 'FAIL: artist_social_posts.updated_at missing';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.artist_social_posts'::regclass
                    and tgname = 'artist_social_posts_updated_at' and not tgisinternal) then
    raise exception 'FAIL: artist_social_posts_updated_at trigger missing';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'artist_social_posts') <> 2 then
    raise exception 'FAIL: artist_social_posts no longer has exactly its two 101 policies';
  end if;

  -- The trigger is BEFORE UPDATE only, so an insert can place the row in the
  -- past; the update must then bring it to now() (fixed per transaction).
  insert into public.artist_social_posts (handle, shortcode, post_url, media, scraped_at, updated_at)
  values ('zz_verify_102', 'ZZVERIFY102A', 'https://www.instagram.com/p/ZZVERIFY102A/', '[]'::jsonb, now(), now() - interval '1 hour');
  select updated_at into v_before from public.artist_social_posts where shortcode = 'ZZVERIFY102A';
  if v_before is distinct from now() - interval '1 hour' then raise exception 'FAIL: updated_at not stored on insert (got %)', v_before; end if;

  update public.artist_social_posts set status = 'skipped' where shortcode = 'ZZVERIFY102A';
  select updated_at into v_after from public.artist_social_posts where shortcode = 'ZZVERIFY102A';
  if v_after is distinct from now() then
    raise exception 'FAIL: the trigger did not bump updated_at (got %, tx now %)', v_after, now();
  end if;

  delete from public.artist_social_posts where shortcode = 'ZZVERIFY102A';
  if exists (select 1 from public.artist_social_posts where shortcode = 'ZZVERIFY102A') then
    raise exception 'FAIL: fixture not removed';
  end if;
  raise notice 'PASS: updated_at exists, defaults on insert, bumps on update; fixture removed';
end $$;
