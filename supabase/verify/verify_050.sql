-- ============================================================
-- ⚠  RUN ONE LETTERED BLOCK AT A TIME - DO NOT RUN THIS FILE WHOLE.
--
-- The Supabase SQL Editor displays only the LAST statement's result. Running
-- the whole file returns the final query and silently discards every check
-- above it, which looks exactly like a file that only ever had one check in
-- it. Nothing errors; the other results simply never appear.
--
-- ⚠  BLOCKS C, D, G AND G2 REPORT VIA `RAISE NOTICE`, NOT THE RESULTS GRID.
-- Read the Messages / Notices pane for those four. A PASS is a notice; a FAIL
-- is a raised exception, so it shows up as a red error and is hard to miss.
--
-- Negative assertions are wrapped in a DO block that catches ONLY the specific
-- error class it expects. The first version of this file asserted the alt
-- constraint by running a bare INSERT and expecting it to error - the
-- constraint fired correctly, but the raw ERROR aborted the script and blocks
-- D through I never ran, so the anon-visibility check went unverified while
-- the file looked like it had passed. An expected failure has to be caught and
-- reported, not allowed to terminate the run.
--
-- The catch is always on the named condition (check_violation), never
-- `when others` - a bare catch would swallow an unrelated error and print PASS.
-- ============================================================

-- ============================================================
-- VERIFY 050 - run after the migration. Nothing mutates permanently.
-- ============================================================

-- ── A. bucket exists, public, 10 MB, three MIME types
--    want: page-images | t | 10485760 | {image/jpeg,image/png,image/webp}
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets
 where id = 'page-images';

-- ── B. the three slugs exist and are EMPTY
--    want: 3 rows, image_path/alt/caption all null, active = t.
--    Any non-null content here means something seeded copy that nobody wrote.
select slug, image_path, alt, caption, active
  from public.page_images
 order by slug;

-- ── C. the alt constraint bites, both ways  (NOTICE pane)
--    want: two PASS notices. A FAIL here means an image can reach the site
--    with no alt text, which is invisible to everyone except the person
--    relying on a screen reader.
do $$
begin
  begin
    insert into public.page_images (slug, image_path, alt)
    values ('zz-constraint-probe', 'probe.webp', '   ');
    raise exception 'FAIL: whitespace-only alt was accepted alongside an image_path';
  exception
    when check_violation then
      raise notice 'PASS: whitespace-only alt rejected';
  end;

  begin
    insert into public.page_images (slug, image_path)
    values ('zz-constraint-probe', 'probe.webp');
    raise exception 'FAIL: null alt was accepted alongside an image_path';
  exception
    when check_violation then
      raise notice 'PASS: null alt rejected';
  end;

  -- Belt and braces: nothing above should have landed.
  delete from public.page_images where slug like 'zz-%probe';
end $$;

-- ── D. alt WITHOUT an image is still allowed  (NOTICE pane)
--    want: PASS. A slug may be prepared before the upload, so this must NOT
--    be rejected. Without this block, C would still pass on a constraint that
--    wrongly forbade every row.
do $$
declare n int;
begin
  insert into public.page_images (slug, alt) values ('zz-altonly-probe', 'prepared');
  select count(*) into n from public.page_images where slug = 'zz-altonly-probe';
  if n <> 1 then
    raise exception 'FAIL: alt-without-image was not inserted';
  end if;
  raise notice 'PASS: alt without image_path accepted';
  delete from public.page_images where slug = 'zz-altonly-probe';
end $$;

-- ── E. RLS is on
--    want: rowsecurity = t
select relrowsecurity as rowsecurity
  from pg_class where oid = 'public.page_images'::regclass;

-- ── F. policy list
--    want: exactly 2 rows -
--      "admins write page images"       | ALL    | {authenticated}
--      "anyone reads active page images"| SELECT | {anon,authenticated}
select policyname, cmd, roles::text
  from pg_policies
 where schemaname = 'public' and tablename = 'page_images'
 order by policyname;

-- ── G. anon sees ACTIVE rows and cannot see DEACTIVATED ones  (NOTICE pane)
--    want: two PASS notices.
--
--    Two things were wrong with the first version of this block. It used
--    `set local role anon` as a bare statement, and SET LOCAL outside a
--    transaction is a no-op with a warning - the check would have run as
--    postgres, which is the table owner and bypasses RLS entirely. A DO block
--    is its own transaction, so SET LOCAL takes effect here.
--
--    More importantly it only asserted the negative. If anon could not read
--    the table at all - a missing grant, a policy typo - the deactivated-row
--    check returns 0 rows and prints PASS while proving nothing. The active-row
--    control below is what stops this from being a test that cannot fail.
--
--    Rolls itself back: the row is restored before the block ends, and if
--    anything raises, the whole DO aborts and the UPDATE goes with it.
do $$
declare n_active int; n_inactive int;
begin
  set local role anon;
  select count(*) into n_active from public.page_images where slug = 'schedule-hero';
  reset role;

  if n_active <> 1 then
    raise exception 'FAIL: anon cannot read an ACTIVE row (got %). Public read is broken; the check below would pass vacuously.', n_active;
  end if;
  raise notice 'PASS: anon reads an active row';

  update public.page_images set active = false where slug = 'schedule-hero';

  set local role anon;
  select count(*) into n_inactive from public.page_images where slug = 'schedule-hero';
  reset role;

  if n_inactive <> 0 then
    raise exception 'FAIL: anon read a DEACTIVATED row (got %). active=false hides it in the UI only.', n_inactive;
  end if;
  raise notice 'PASS: anon cannot read a deactivated row';

  update public.page_images set active = true where slug = 'schedule-hero';
end $$;

-- ── G2. anon cannot WRITE, and the two refusals look different  (NOTICE pane)
--    want: three PASS notices.
--
--    Worth asserting separately because the two write paths fail in different
--    shapes, and only one of them is loud:
--
--      INSERT raises 42501 (insufficient_privilege) - the WITH CHECK clause
--             rejects the new row outright.
--      UPDATE raises nothing at all. The USING clause filters the row out
--             before the update is applied, so it succeeds against zero rows.
--             Over PostgREST this is an HTTP 204, which reads as success.
--             Confirmed by hand against the live table: the request returned
--             204 and the caption was still null.
--
--    So the UPDATE half must assert on the row count, not on an exception.
--    Waiting for an error that never arrives is how a write path gets called
--    verified when nothing was ever checked - the same silent-zero-rows case
--    guardedWrite() exists to catch in the application.
do $$
declare n int;
begin
  begin
    set local role anon;
    insert into public.page_images (slug) values ('zz-anon-probe');
    reset role;
    raise exception 'FAIL: anon inserted a row';
  exception
    when insufficient_privilege then
      raise notice 'PASS: anon insert rejected (42501)';
  end;
  reset role;

  set local role anon;
  update public.page_images set caption = 'zz anon probe' where slug = 'schedule-hero';
  get diagnostics n = row_count;
  reset role;

  if n <> 0 then
    raise exception 'FAIL: anon updated % row(s)', n;
  end if;
  raise notice 'PASS: anon update affected 0 rows';

  select count(*) into n from public.page_images
   where slug = 'schedule-hero' and caption is not null;
  if n <> 0 then
    raise exception 'FAIL: caption was modified despite a 0 row count';
  end if;
  raise notice 'PASS: row genuinely unchanged';

  delete from public.page_images where slug like 'zz-%probe';
end $$;

-- ── H. updated_at trigger is wired to the shared function, not a second one
--    want: 1 row, page_images_updated_at -> handle_updated_at
select t.tgname, p.proname
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.page_images'::regclass
   and not t.tgisinternal;

-- ── I. storage policies mirror 018
--    want: 4 rows for page-images (read/insert/update/delete).
select policyname, cmd
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname ilike '%page images%'
 order by policyname;

-- ── Z. residue check - run LAST, and expect nothing
--    want: 0 rows, and schedule-hero active = t.
--    C and D clean up after themselves and a failed INSERT leaves nothing, but
--    a probe row that escaped would be a test row on a live table, which is a
--    round we have already spent once.
select slug, image_path, alt, active
  from public.page_images
 where slug like 'zz-%'
    or (slug = 'schedule-hero' and active is not true);
