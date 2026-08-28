-- ============================================================
-- TEARDOWN for an /api/admin/import-returning test.
--
-- ⚠  PASTE AND RUN THIS WHOLE FILE. It is one DO block plus one SELECT, and
-- they must run together - the block writes its report to a temp table that
-- the SELECT reads. Unlike the verify files, this one is designed for a single
-- run, so the editor's last-statement-wins behaviour works in our favour: the
-- SELECT you see IS the report.
--
-- ⚠  NO psql META-COMMANDS. The previous version opened with
-- `\set test_email '…'`, which is a psql CLIENT command - the Supabase web
-- editor is not psql and rejected it with `42601: syntax error at or near "\"`.
-- The email is now a plpgsql variable, declared once, on the marked line below.
--
-- ⚠  IT STARTS IN DRY-RUN MODE. Nothing is deleted until you set
-- v_dry_run := false. The dry run does the counting through the SAME code path
-- as the real thing, then aborts, so what it reports is what the live run will
-- actually remove - not a separate query that might disagree with it.
--
-- WHY THE ASSERTIONS EXIST. The previous version shipped with the placeholder
-- address still in it. Had the syntax error not stopped it, every statement
-- would have matched zero rows and the file would have reported a clean,
-- successful teardown having deleted nothing - the same silent-success shape
-- as the RLS writes that returned `data: []` with `error: null`. A teardown
-- that cannot tell "removed it" from "never found it" is worse than no
-- teardown, because you stop looking. So this one REFUSES to run against the
-- placeholder, REFUSES to run if the account does not exist, and REFUSES to
-- report success unless the rows are provably gone.
-- ============================================================

do $$
declare
  ---------------------------------------------------------------
  -- SET THIS. The only line you edit.
  v_email    text    := 'ryan@skinreserve.com';
  -- Set to false to actually delete. Leave true to preview.
  v_dry_run  boolean := true;
  ---------------------------------------------------------------
  v_user_id      uuid;
  v_apps         int;
  v_invoices     int;
  v_exhibitors   int;
  v_booths       int;
  v_left_users   int;
  v_left_apps    int;
  v_left_profile int;
  v_summary      text;
begin
  -- ── Guard 1: the placeholder ──────────────────────────────
  if lower(v_email) = 'replace-me@example.com' or v_email = '' then
    raise exception
      'REFUSING TO RUN: the email is still the placeholder. Edit v_email above to the throwaway address you used for the import.';
  end if;

  -- ── Guard 2: the account must exist ───────────────────────
  -- This is the assertion that would have caught the silent no-op. Zero
  -- matches is not "already clean" - it is "you are pointed at the wrong
  -- address", and the two are indistinguishable without saying so.
  select id into v_user_id from auth.users where lower(email) = lower(v_email);
  if v_user_id is null then
    raise exception
      'REFUSING TO RUN: no auth user exists for %. Nothing was deleted. Check the address - an import that succeeded always leaves one.', v_email;
  end if;

  -- ── Count what is about to go ─────────────────────────────
  select count(*) into v_apps       from applications where user_id = v_user_id;
  select count(*) into v_invoices   from invoices i
    join applications a on a.id = i.application_id where a.user_id = v_user_id;
  select count(*) into v_exhibitors from exhibitors e
    join applications a on a.id = e.application_id where a.user_id = v_user_id;
  select count(*) into v_booths     from booths b
    join applications a on a.id = b.application_id where a.user_id = v_user_id;

  v_summary := format(
    'account %s (%s) · applications %s · invoices %s · exhibitor rows %s · booths held %s',
    v_email, v_user_id, v_apps, v_invoices, v_exhibitors, v_booths);

  -- ── Dry run stops here ────────────────────────────────────
  -- Raising rolls the whole block back, so nothing is removed AND the summary
  -- is guaranteed to be displayed - an exception message always surfaces,
  -- where a NOTICE may not.
  if v_dry_run then
    raise exception
      'DRY RUN - NOTHING DELETED. Would remove: %. If that is right, set v_dry_run := false and run again.', v_summary;
  end if;

  -- ── Delete, children first ────────────────────────────────
  -- booths.application_id is ON DELETE SET NULL, so the booth would be freed
  -- anyway; doing it explicitly means it is verifiably released rather than
  -- incidentally released.
  update booths set application_id = null
   where application_id in (select id from applications where user_id = v_user_id);

  delete from invoices
   where application_id in (select id from applications where user_id = v_user_id);

  delete from exhibitors
   where application_id in (select id from applications where user_id = v_user_id);

  delete from applications where user_id = v_user_id;

  -- profiles.id references auth.users. If that FK is not ON DELETE CASCADE the
  -- auth delete below fails, so clear it first - harmless either way.
  delete from profiles where id = v_user_id;

  delete from auth.users where id = v_user_id;

  -- ── Guard 3: prove it actually went ───────────────────────
  select count(*) into v_left_users   from auth.users    where id = v_user_id;
  select count(*) into v_left_apps    from applications  where user_id = v_user_id;
  select count(*) into v_left_profile from profiles      where id = v_user_id;

  if v_left_users <> 0 or v_left_apps <> 0 or v_left_profile <> 0 then
    raise exception
      'TEARDOWN INCOMPLETE - ROLLED BACK. Remaining: auth.users %, applications %, profiles %. Nothing has been changed.',
      v_left_users, v_left_apps, v_left_profile;
  end if;

  -- ── Report ────────────────────────────────────────────────
  drop table if exists _teardown_report;
  create temp table _teardown_report (result text, detail text);
  insert into _teardown_report values
    ('DELETED', v_summary),
    ('VERIFIED', 'auth.users 0 · applications 0 · profiles 0 - confirmed after deletion');
end $$;

-- The report. Only reachable if the block above completed without raising, so
-- seeing rows here means the teardown ran AND verified itself.
select * from _teardown_report;
