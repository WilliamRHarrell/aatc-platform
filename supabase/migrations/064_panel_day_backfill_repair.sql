-- ============================================================
-- Migration 064: repair the panel_day / panel_start backfill that 046 missed.
--
-- THE DEFECT. Both panels rows have panel_day IS NULL and panel_start IS NULL
-- in production. /events/schedule merges seminars into the programme with
--
--     panels.filter(p => p.panel_day === iso)
--
-- so a null day matches no day and the seminar is dropped. Both seminars are
-- therefore absent from the schedule page, and with them the NOMADICA
-- PRESENTATION CREDIT. That credit is sold. This is the owed-and-unrendered /
-- sold-and-unrendered defect from the sold side, and nothing throws: the page
-- renders a complete looking schedule with two items quietly missing.
--
-- Blast radius, checked per page in RENDERED output rather than assumed:
--   /events/schedule       both seminars absent, Nomadica credit not rendered
--   /                      both render, but with no day and no time
--   /events/tattoo-panels  renders them client side under a literal 'TBD'
--                          heading. formatPanelDate's regex guard holds, so
--                          this is degraded but not the old 'Invalid Date'.
--
-- HOW IT HAPPENED. 046 backfilled by joining panels.panel_date against day
-- labels built from schedule_items. That join matched nothing when it ran, so
-- both updates affected zero rows. An UPDATE that affects zero rows is not an
-- error, so the migration reported success. verify_046.sql line 49 checks for
-- exactly this condition and would have returned these two rows.
--
-- ── CORRECTION, 2026-08-31, AFTER THIS MIGRATION WAS APPLIED ──
-- This header originally said 047 had dropped panel_date / panel_time and that
-- the database no longer held the source strings. BOTH CLAIMS WERE FALSE, and
-- they were taken from HANDOFF's "applied and verified through 063" rather than
-- from the database. Only this comment has been corrected; no statement below
-- was touched, and the DDL that ran is what is still written here.
--
-- 047 HAS NEVER BEEN APPLIED. It is Phase 2 of the 046 change and was
-- deliberately HELD, gated on a step-3 confirmation that verify_046 returned
-- zero rows. That gate never passed, because the failed backfill repaired below
-- is exactly what was failing it. So the hold worked as designed and nobody
-- noticed it had become permanent.
--
-- Consequently panel_date and panel_time are STILL PRESENT and still hold
-- 'Sunday, April 18' with '1:30 PM' and '3:00 PM'. That is a fourth
-- corroboration of the values written below, and it also pins down why 046's
-- backfill matched nothing: the strings were always correct, so the join had no
-- rows to match against - the panels seed ran AFTER 046, not before it.
--
-- This does not change the repair. It changes the reason 047 must be handled
-- carefully: its stale view body would revert migration 065. See HANDOFF.
--
-- WHERE THE VALUES COME FROM. CONFIRMED WITH THE PRESENTERS DIRECTLY on
-- 2026-08-31. Both said the times are correct and will come back if that
-- changes. That provenance is the point of this paragraph: these values are
-- presenter-confirmed, NOT derived from the documents below.
--
-- Three records also agree, and they are what the values were recovered FROM
-- before the presenters confirmed them:
--   supabase/seeds/panels_2027.sql       'Sunday, April 18' / '1:30 PM', '3:00 PM'
--   docs/aatc-2027-schedule-spec.md:50   Sunday section, 1:30 PM and 3:00 PM
--   docs/CUTOVER.md:465                  'Bookkeeping seminar (Sun 1:30 PM)'
-- 2027-04-18 is confirmed a Sunday, checked independently of the stored label.
--
-- SO IF A PRESENTER MOVES: the correction goes to the DATA - the panels row,
-- via /admin/panels or a new migration - not to whichever of the documents
-- above looks authoritative. Those documents are now the weaker source. A seed
-- file does not re-run against a live database, so editing one to match a new
-- time would leave production unchanged and leave the seed describing a
-- schedule nobody is presenting.
--
-- WHY THE ASSERTIONS. 046's failure mode was a silent no-op, so this migration
-- asserts its POST-CONDITION and aborts if it is not met. The check is stated
-- as an outcome (no published panel lacks a day or a start) rather than as a
-- row count, so it passes whether the repair below did the work or someone had
-- already fixed the rows in /admin/panels, and it still fails loudly if a title
-- has been renamed and the update matched nothing.
--
-- WHY THE CONSTRAINT. Detecting this a second time is not good enough. The
-- constraint makes a published panel with no place in the schedule UNREACHABLE
-- rather than merely reportable, which is the same shape as
-- team_members_published_is_complete in 059: nullable columns so an unpublished
-- draft may be held open empty, and a check that forbids PUBLISHING one.
-- ============================================================

begin;

do $$
declare
  v_event_id    uuid;
  v_bookkeeping int;
  v_toothgem    int;
  v_still_null  int;
begin
  -- `v := (select ...)`, never `select ... into v`: the SQL Editor pre-flight
  -- parses without plpgsql context and reads the latter as CREATE TABLE.
  v_event_id := (select id from public.events where is_active);

  if v_event_id is null then
    raise exception 'ABORT: no active event, so the rows to repair cannot be identified.';
  end if;

  update public.panels
     set panel_day = date '2027-04-18', panel_start = time '13:30'
   where event_id = v_event_id
     and title = 'Bookkeeping for Tattoo Industry Professionals'
     and (panel_day is null or panel_start is null);
  get diagnostics v_bookkeeping = row_count;

  update public.panels
     set panel_day = date '2027-04-18', panel_start = time '15:00'
   where event_id = v_event_id
     and title = 'Tooth Gem Seminar'
     and (panel_day is null or panel_start is null);
  get diagnostics v_toothgem = row_count;

  raise notice 'Repaired: Bookkeeping % row(s), Tooth Gem % row(s). Zero means it was already correct.',
    v_bookkeeping, v_toothgem;

  -- The post-condition. This is the assertion that 046 did not have.
  v_still_null := (select count(*)
                     from public.panels
                    where is_published
                      and (panel_day is null or panel_start is null));

  if v_still_null <> 0 then
    raise exception
      'ABORT: % published panel(s) still have no day or no start time. They would be invisible on /events/schedule. Check whether a title was renamed since this migration was written.', v_still_null;
  end if;
end $$;

-- A published panel must have a place in the programme. Unpublished drafts may
-- be held open with neither, which is how a seminar gets entered before its
-- slot is settled.
alter table public.panels
  drop constraint if exists panels_published_has_schedule;

alter table public.panels
  add constraint panels_published_has_schedule check (
    is_published = false
    or (panel_day is not null and panel_start is not null)
  );

comment on constraint panels_published_has_schedule on public.panels is
  'A published panel with a null panel_day is silently dropped by the /events/schedule merge, taking any presentation credit on it out of the rendered page without error. 046 left both panels in exactly that state and 047 then dropped the text columns the day could have been recovered from. Publishing without a day or start time is now impossible rather than merely detectable.';

commit;


-- ── REPORT: read this output ────────────────────────────────
-- want: 2 rows, both 2027-04-18, at 13:30 and 15:00, both published.
select title, panel_day, panel_start, is_published, presented_by_fallback
  from public.panels
 order by panel_day, panel_start;
