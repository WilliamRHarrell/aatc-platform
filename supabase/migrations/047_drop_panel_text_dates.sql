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

-- Restate the view without the deprecated pair, first — a column cannot be
-- dropped while a view depends on it.
create or replace view public.panels_public with (security_invoker = false) as
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

grant select on public.panels_public to anon, authenticated;

alter table panels
  drop column if exists panel_date,
  drop column if exists panel_time;

commit;
