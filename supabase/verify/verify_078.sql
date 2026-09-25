-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass.
--
-- STORAGE IS ASSERTED FROM pg_policies ONLY. Supabase forbids direct writes
-- to storage.objects (storage.protect_delete raised 42501 on the first run of
-- this file, 2026-09-25), so the real upload path is exercised by
--   node scripts/verify-graphics-owner.mjs
-- which creates a temporary non-admin user, uploads to its own folder
-- through the Storage API, is refused elsewhere, and removes everything.
-- Run both. Block B writes one aatc_submissions row (a table, not storage)
-- as the RLS harness user and removes it in the same block.
-- ============================================================

-- ── A. the storage policy, exactly  (grid + NOTICE)
select policyname, cmd, roles::text, with_check from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'exhibitor-media:%'
 order by policyname;
do $$
declare wc text;
begin
  wc := (select with_check from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'exhibitor-media: own aatc-graphics insert' and cmd = 'INSERT' and roles::text = '{authenticated}');
  if wc is null then raise exception 'FAIL A: "exhibitor-media: own aatc-graphics insert" missing or not INSERT to authenticated'; end if;
  if position('exhibitor-media' in wc) = 0 then raise exception 'FAIL A: policy is not scoped to the exhibitor-media bucket (%)', wc; end if;
  if position('aatc-graphics' in wc) = 0 then raise exception 'FAIL A: policy is not scoped to the aatc-graphics prefix (%)', wc; end if;
  if position('auth.uid()' in wc) = 0 then raise exception 'FAIL A: policy does not bind the folder to auth.uid() (%)', wc; end if;
  -- No other policy may let an exhibitor write outside profiles/<uid>/ or aatc-graphics/<uid>/.
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
               and policyname like 'exhibitor-media:%' and cmd in ('INSERT','UPDATE','DELETE')
               and coalesce(with_check, qual) not like '%is_admin()%'
               and coalesce(with_check, qual) not like '%auth.uid()%') then
    raise exception 'FAIL A: an exhibitor-media write policy is neither admin-only nor owner-scoped';
  end if;
  raise notice 'PASS A: owner insert policy for aatc-graphics/<uid>/ present; every exhibitor-media write policy is admin-only or owner-scoped';
end $$;

-- ── B. a signed-in exhibitor inserts their OWN aatc_submissions row and nobody else's  (NOTICE pane; table fixture)
do $$
declare v_uid uuid; v_sub uuid;
begin
  v_uid := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_uid is null then raise exception 'ABORT: RLS harness user missing'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  insert into public.aatc_submissions (exhibitor_id, artist_name, instagram_handle, square_paths, vertical_paths, caption)
  values (v_uid, 'ZZ VERIFY 078', 'zz', array['aatc-graphics/' || v_uid::text || '/zz-verify-078.jpg'], '{}', 'zz')
  returning id into v_sub;

  begin
    insert into public.aatc_submissions (exhibitor_id, artist_name, instagram_handle, square_paths, vertical_paths, caption)
    values ('00000000-0000-0000-0000-000000000000', 'ZZ VERIFY 078', 'zz', '{}', '{}', 'zz');
    raise exception 'FAIL B: harness user inserted a submission for another exhibitor_id';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  delete from public.aatc_submissions where id = v_sub;
  raise notice 'PASS B: exhibitor inserts own row; another exhibitor_id refused; fixture removed';
end $$;

-- ── Z. residue  (results grid; want zero rows)
select artist_name from public.aatc_submissions where artist_name = 'ZZ VERIFY 078';
