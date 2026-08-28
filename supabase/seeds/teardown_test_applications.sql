-- ============================================================
-- TEST DATA TEARDOWN - applications and everything hanging off them
--
-- Removes the 14 test applications created March - May 2026, their invoices and
-- exhibitor rows, and releases their booth assignments back to available.
--
-- ── PRESERVED, DELIBERATELY ─────────────────────────────────
-- The RLS harness records are excluded by name and by user. The verify script
-- needs them:
--     auth user     rls-harness@allamericantattooconvention.com
--     sponsorship   'ZZ TEST — RLS Harness Pending (DELETE ME)'  (pending)
--     sponsorship   'ZZ TEST — RLS Harness (DELETE ME)'          (confirmed)
--     invoice       the one attached to the pending harness sponsorship
-- The script ABORTS if those are not all present, so it cannot run against the
-- wrong database or after a partial cleanup.
--
-- ── ALSO NOT TOUCHED (flagged, not assumed) ─────────────────
--   * sponsorship 'Tattoo Goo' (confirmed) - not a harness record and not an
--     application. Outside this teardown's scope; decide separately.
--   * 2 invoices linked to NEITHER an application nor a sponsorship. They are
--     not reachable from applications, so nothing here removes them.
--   * aatc_submissions (1 row) and contest_entries (6 rows) - no FK to
--     applications.
--   * auth.users rows for the test applicants. Left alone so the harness user
--     is never at risk. Delete them separately if you want them gone.
--   * Supabase STORAGE objects. id_doc_url, veteran_id_url, logo_url,
--     portfolio_image_urls and artists[].id_url point at files in the
--     application-docs / exhibitor-media buckets. SQL cannot remove those -
--     they will be orphaned. Clear the buckets from the dashboard.
--
-- ── FK BEHAVIOUR (why the order below) ──────────────────────
--   invoices.application_id    -> ON DELETE CASCADE
--   exhibitors.application_id  -> ON DELETE CASCADE
--   booths.application_id      -> ON DELETE SET NULL
-- Deleting an application therefore removes its invoices and exhibitor rows on
-- its own, and NULLs the booth link - but it does NOT reset booths.status,
-- which would leave 23 booths flagged reserved/sold with no occupant. The
-- explicit statements below do the deletes anyway, so the counts are honest
-- rather than inferred from cascade behaviour.
--
-- There is no roster or artist TABLE - applications.artists is a jsonb column,
-- so roster data goes with the application row.
-- ============================================================

begin;

do $$
declare
  n_apps        int;
  n_inv_app     int;
  n_inv_spon    int;
  n_inv_orphan  int;
  n_exh         int;
  n_booth_asgn  int;
  n_spon        int;
  n_harness_sp  int;
  n_harness_inv int;
  n_harness_usr int;
begin
  -- ══ BASELINE, BEFORE ANYTHING IS REMOVED ══════════════════
  select count(*) into n_apps       from applications;
  select count(*) into n_inv_app    from invoices where application_id is not null;
  select count(*) into n_inv_spon   from invoices where sponsorship_id is not null;
  select count(*) into n_inv_orphan from invoices where application_id is null and sponsorship_id is null;
  select count(*) into n_exh        from exhibitors;
  select count(*) into n_booth_asgn from booths where application_id is not null;
  select count(*) into n_spon       from sponsorships;

  select count(*) into n_harness_sp  from sponsorships where sponsor_name like 'ZZ TEST — RLS Harness%';
  select count(*) into n_harness_usr from auth.users   where email = 'rls-harness@allamericantattooconvention.com';
  select count(*) into n_harness_inv from invoices i
    join sponsorships s on s.id = i.sponsorship_id
   where s.sponsor_name like 'ZZ TEST — RLS Harness%';

  raise notice '';
  raise notice '════ BEFORE ════';
  raise notice '  applications                : %', n_apps;
  raise notice '  invoices -> application     : %', n_inv_app;
  raise notice '  invoices -> sponsorship     : %', n_inv_spon;
  raise notice '  invoices -> neither         : %  (not reachable from applications)', n_inv_orphan;
  raise notice '  exhibitors                  : %', n_exh;
  raise notice '  booths WITH an assignment   : %', n_booth_asgn;
  raise notice '  sponsorships (all)          : %', n_spon;
  raise notice '  -- harness records to keep --';
  raise notice '  harness auth user           : %', n_harness_usr;
  raise notice '  harness sponsorships        : %', n_harness_sp;
  raise notice '  harness invoices            : %', n_harness_inv;

  -- ══ SAFETY GUARD ══════════════════════════════════════════
  if n_harness_usr <> 1 or n_harness_sp <> 2 or n_harness_inv <> 1 then
    raise exception
      'ABORT - harness records not as expected (user=%, sponsorships=%, invoices=%; wanted 1/2/1). Refusing to run: either this is the wrong database or the harness has already been partly removed.',
      n_harness_usr, n_harness_sp, n_harness_inv;
  end if;
end $$;


-- ══ DELETES, child-first ════════════════════════════════════
-- Every statement is scoped to applications only. No statement can reach a
-- sponsorship, so the harness records are structurally out of range.

-- 1. Invoices belonging to applications. (Sponsorship and orphan invoices are
--    excluded by the NOT NULL predicate - the harness invoice is a sponsorship
--    invoice and cannot match.)
delete from invoices
 where application_id is not null;

-- 2. Exhibitor rows derived from applications.
delete from exhibitors
 where application_id is not null;

-- 3. Release booths BEFORE deleting the applications. ON DELETE SET NULL would
--    clear the link but leave status as reserved/sold with nobody in the booth.
update booths
   set application_id = null,
       status         = 'available'
 where application_id is not null;

-- 4. The applications themselves.
delete from applications;


do $$
declare
  n_apps        int;
  n_inv         int;
  n_inv_app     int;
  n_exh         int;
  n_booth_asgn  int;
  n_booth_avail int;
  n_harness_sp  int;
  n_harness_inv int;
  n_harness_usr int;
  problems      text := '';
begin
  -- ══ AFTER ═════════════════════════════════════════════════
  select count(*) into n_apps        from applications;
  select count(*) into n_inv         from invoices;
  select count(*) into n_inv_app     from invoices where application_id is not null;
  select count(*) into n_exh         from exhibitors;
  select count(*) into n_booth_asgn  from booths where application_id is not null;
  select count(*) into n_booth_avail from booths where status = 'available';

  select count(*) into n_harness_sp  from sponsorships where sponsor_name like 'ZZ TEST — RLS Harness%';
  select count(*) into n_harness_usr from auth.users   where email = 'rls-harness@allamericantattooconvention.com';
  select count(*) into n_harness_inv from invoices i
    join sponsorships s on s.id = i.sponsorship_id
   where s.sponsor_name like 'ZZ TEST — RLS Harness%';

  raise notice '';
  raise notice '════ AFTER ════';
  raise notice '  applications                : %  (want 0)', n_apps;
  raise notice '  invoices remaining (total)  : %', n_inv;
  raise notice '  invoices -> application     : %  (want 0)', n_inv_app;
  raise notice '  exhibitors                  : %  (want 0)', n_exh;
  raise notice '  booths WITH an assignment   : %  (want 0)', n_booth_asgn;
  raise notice '  booths status=available     : %', n_booth_avail;
  raise notice '  -- harness records --';
  raise notice '  harness auth user           : %  (want 1)', n_harness_usr;
  raise notice '  harness sponsorships        : %  (want 2)', n_harness_sp;
  raise notice '  harness invoices            : %  (want 1)', n_harness_inv;

  -- ══ ASSERTIONS - roll back rather than half-finish ═════════
  if n_apps      <> 0 then problems := problems || ' applications not empty;'; end if;
  if n_inv_app   <> 0 then problems := problems || ' application invoices remain;'; end if;
  if n_exh       <> 0 then problems := problems || ' exhibitors remain;'; end if;
  if n_booth_asgn<> 0 then problems := problems || ' booths still assigned;'; end if;
  if n_harness_usr <> 1 then problems := problems || ' HARNESS USER LOST;'; end if;
  if n_harness_sp  <> 2 then problems := problems || ' HARNESS SPONSORSHIPS LOST;'; end if;
  if n_harness_inv <> 1 then problems := problems || ' HARNESS INVOICE LOST;'; end if;

  if problems <> '' then
    raise exception 'TEARDOWN FAILED - %  Transaction rolled back, nothing removed.', problems;
  end if;

  raise notice '';
  raise notice '  OK - applications cleared, booths released, harness intact.';
  raise notice '  Remaining invoices are sponsorship-linked or orphaned; see the header.';
  raise notice '';
end $$;

commit;
