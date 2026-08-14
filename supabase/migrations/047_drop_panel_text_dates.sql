-- Migration 047: drop the free-text panel_date / panel_time. Phase 2 of 2.
--
-- ════════════════════════════════════════════════════════════
-- HELD UNTIL 2026-08-20. DEFERRED ON PURPOSE — NOT FORGOTTEN.
-- ════════════════════════════════════════════════════════════
--
-- Decision 2026-08-13: leave the text columns in place for a week after the 046
-- deploy before dropping them. This is the only irreversible step in the whole
-- change, the overlap costs nothing, and if any path neither of us checked
-- still reads panel_date, it keeps working instead of throwing 42703 on a
-- public page — and we find out while the columns still exist.
--
-- On 2026-08-20: re-run verify_046.sql, confirm B is still 0 rows, then run
-- this. Afterwards verify_044.sql query D can be deleted — it checks a failure
-- mode that no longer exists.
--
-- DO NOT RUN THIS UNTIL THE DEPLOY THAT READS panel_day IS LIVE AND CONFIRMED.
--
-- Sequence for the whole change:
--   1. run 046           (additive — old code keeps working, no window)
--   2. deploy            (new code reads panel_day / panel_start)
--   3. confirm           /events/schedule and /events/tattoo-panels look right,
--                        and verify_046.sql D returns zero rows
--   4. run 047 (this)    (removes the dead columns)
--
-- Running this BEFORE step 2 breaks three public pages with a 42703, because
-- the deployed code still selects panel_date. Running it before step 3 removes
-- your ability to compare the new values against the old ones if a backfill
-- turns out to be wrong. The columns cost nothing to keep for a day.
--
-- ROLLBACK ON THIS ONE IS NOT FREE. Once these columns are gone the original
-- display strings are gone with them. If the backfill was wrong you rebuild
-- from the seed, not from the table. That is why step 3 exists.
begin;

-- ── The view must be DROPPED, not replaced ─────────────────
-- `create or replace view` compares column lists positionally and may only
-- APPEND. It cannot reorder, rename, or REMOVE — and this migration removes
-- panel_date and panel_time. Replacing in place fails with:
--
--   42P16: cannot drop columns from view
--
-- the mirror of the error 046 hit when it tried to insert columns mid-list.
-- Same rule, opposite direction.
--
-- DROP WITHOUT CASCADE, DELIBERATELY. `cascade` would silently destroy anything
-- that depends on this view — another view, a materialised view, a function
-- with a hard dependency. Plain `drop view` uses RESTRICT and ERRORS instead,
-- which is what you want: a failure here is information, not an obstacle.
--
-- Nothing in this schema depended on panels_public when 047 was written (only
-- app-code reads, which are unaffected by a drop inside a transaction). Run
-- the check below FIRST anyway — it costs nothing and this is the irreversible
-- migration.
--
--   select dependent_ns.nspname as schema, dependent_view.relname as depends_on_panels_public
--     from pg_depend d
--     join pg_rewrite r          on r.oid = d.objid
--     join pg_class dependent_view on dependent_view.oid = r.ev_class
--     join pg_namespace dependent_ns on dependent_ns.oid = dependent_view.relnamespace
--     join pg_class source_table on source_table.oid = d.refobjid
--    where source_table.relname = 'panels_public'
--      and dependent_view.relname <> 'panels_public';
--
-- 0 rows → the drop below is safe. Any rows → recreate them in THIS migration
-- after the view, rather than reaching for cascade.
--
-- The drop also discards the GRANT, which is why it is reissued below. Both
-- statements are inside the transaction, so no window exists where the view is
-- missing from a reader's point of view.
drop view if exists public.panels_public;

create view public.panels_public with (security_invoker = false) as
select p.id, p.event_id, p.title, p.description,
       p.panel_day, p.panel_start,
       p.location, p.panelists, p.is_free, p.cost, p.signup_type,
       p.max_capacity, p.image_url,
       case when p.signup_type = 'email_host' then p.host_email end as host_email,
       coalesce(sp.sponsor_name, p.presented_by_fallback) as presented_by,
       sp.website  as presented_by_website,
       sp.logo_url as presented_by_logo_url,
       (sp.id is not null) as presented_by_linked
  from panels p
  left join sponsorships sp
    on sp.id = p.presented_by_sponsorship_id
   and sp.status = 'confirmed'
 where p.is_published = true;

-- Reissued because the DROP above discarded it. Omitting this is a silent
-- outage: every public page reads this view as anon.
grant select on public.panels_public to anon, authenticated;

alter table panels
  drop column if exists panel_date,
  drop column if exists panel_time;

commit;
