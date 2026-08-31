-- ============================================================
-- Migration 065: dual-read the presentation credit.
--
-- Step 1 of the three-step sequence agreed for presentation_credits (060):
--
--   1. THIS MIGRATION. Render from a credit if one exists, else from
--      presented_by_fallback.
--   2. Verify /events/schedule, / and /tickets render identically.
--   3. Only then move the four rows into the table and drop the fallback.
--
-- Same discipline as TEAM_FALLBACK and the VIP price: confirm the new source
-- matches the old BEFORE deleting the old.
--
-- PRECEDENCE: sponsorship, then credit, then fallback. Decided 2026-08-31.
--
--   coalesce(sp.sponsor_name, c.buyer_name, s.presented_by_fallback)
--
-- The sponsorship keeps the top slot because it is the ONLY source that also
-- carries website, logo_url and presented_by_linked. Put the credit above it
-- and an item holding both would render the credit's buyer_name hyperlinked to
-- the joined sponsorship's website: a name pointing at a different company's
-- site, with nothing to catch it. That case is not hypothetical. Whole Life
-- Aftercare is due BOTH a sponsorships row and the Tattoo Battle credit.
--
-- A credit therefore renders as PLAIN TEXT, which is the state PresentedBy
-- already documents and already handles. Nothing here widens
-- presentation_credits_public; a negotiated amount still cannot reach a page.
--
-- THIS IS A PROVABLE NO-OP TODAY. presentation_credit_items is empty, so
-- c.buyer_name is null on every row and the coalesce collapses to exactly what
-- it was before. That is what makes step 2 a real test rather than a ritual:
-- any rendered difference means this migration is wrong, not that the data
-- moved. verify_065 block A asserts the emptiness that the claim rests on.
--
-- WHY THE JOIN CANNOT DUPLICATE ROWS. A left join normally risks fanning one
-- schedule row into several. It cannot here: 060 created uq_credit_item_schedule
-- and uq_credit_item_panel, so an item carries at most one credit. The double
-- sale that would break this view is unrepresentable rather than merely
-- unlikely. verify_065 block B asserts both indexes still exist, because this
-- view's correctness now depends on them.
--
-- create or replace, not drop and recreate: the column lists below are
-- UNCHANGED in name, type and position, so the grants survive and no dependent
-- object is destroyed. Only the presented_by EXPRESSION changes.
--
-- Both lists were read from the LIVE DATABASE, not from the migration that last
-- touched each view. The first draft of this file took panels_public's list
-- from 047 and was rejected with 42P16, because 047 has never been applied and
-- the file therefore described a shape that does not exist. A migration file
-- says what someone INTENDED the shape to be; only the database says what it
-- IS. verify_065 block E now pins both lists so this cannot recur silently.
-- ============================================================

begin;

create or replace view public.schedule_items_public with (security_invoker = false) as
select s.id, s.event_id, s.day_date, s.start_time, s.sort_order,
       s.title, s.location, s.note, s.kind,
       coalesce(sp.sponsor_name, c.buyer_name, s.presented_by_fallback) as presented_by,
       sp.website  as presented_by_website,
       sp.logo_url as presented_by_logo_url,
       (sp.id is not null) as presented_by_linked
  from schedule_items s
  left join sponsorships sp
    on sp.id = s.presented_by_sponsorship_id
   and sp.status = 'confirmed'
  left join presentation_credit_items ci
    on ci.schedule_item_id = s.id
  left join presentation_credits c
    on c.id = ci.credit_id
   and c.status = 'confirmed'
 where s.is_published;

-- Same rule on panels. An unconfirmed credit falls through to the fallback for
-- the same reason an unconfirmed sponsorship does: confirming is the sole
-- publish gate everywhere else, and neither table may become a second back
-- door that announces a buyer early.
--
-- ⚠  THIS COLUMN LIST IS 046's, NOT 047's, AND THAT IS DELIBERATE.
--
-- The first draft of this migration copied 047's list, which drops panel_date /
-- panel_time and moves panel_day / panel_start up to positions 5 and 6. Postgres
-- rejected the whole statement:
--
--     42P16: cannot drop columns from view
--
-- because 047 HAS NEVER BEEN APPLIED. It is Phase 2 of the 046 change and was
-- deliberately HELD, gated on a step-3 confirmation that verify_046 returned
-- zero rows. That gate never passed - the backfill 064 has just repaired is
-- exactly what was failing it - so 047 correctly never ran, and the live view is
-- still 046's shape with the deprecated pair present and the real date/time
-- columns APPENDED LAST.
--
-- So this list restores the live shape verbatim and changes only the
-- presented_by EXPRESSION. Nothing here removes or reorders a column, which
-- keeps this a pure `create or replace`: the grants survive and no dependent
-- object is destroyed. The live shape was read from the database, not from a
-- migration file, because a migration file is what was wrong the first time.
--
-- ⚠  WHEN 047 IS EVENTUALLY APPLIED IT WILL SILENTLY REVERT THIS.
-- 047 drops and recreates panels_public from its own body, which still reads
-- `coalesce(sp.sponsor_name, p.presented_by_fallback)` with no credit join. The
-- panels dual-read would disappear with no error and no failing page - a credit
-- would simply stop rendering. Fix 047's body before running it. See HANDOFF.
create or replace view public.panels_public with (security_invoker = false) as
select p.id, p.event_id, p.title, p.description,
       p.panel_date, p.panel_time,          -- deprecated, still live: 047 is HELD
       p.location, p.panelists, p.is_free, p.cost, p.signup_type,
       p.max_capacity, p.image_url,
       case when p.signup_type = 'email_host' then p.host_email end as host_email,
       coalesce(sp.sponsor_name, c.buyer_name, p.presented_by_fallback) as presented_by,
       sp.website  as presented_by_website,
       sp.logo_url as presented_by_logo_url,
       (sp.id is not null) as presented_by_linked,
       -- Appended by 046. Must stay last until 047 drops the deprecated pair.
       p.panel_day, p.panel_start
  from panels p
  left join sponsorships sp
    on sp.id = p.presented_by_sponsorship_id
   and sp.status = 'confirmed'
  left join presentation_credit_items ci
    on ci.panel_id = p.id
  left join presentation_credits c
    on c.id = ci.credit_id
   and c.status = 'confirmed'
 where p.is_published = true;

commit;


-- ── REPORT: read this output ────────────────────────────────
-- Every rendered credit, with the SOURCE it now resolves from. This is the
-- reconciliation for step 3: it names which rows still depend on the fallback,
-- and it is the list that must reach zero before the fallback can be dropped.
-- want today: 4 item rows, every one of them source = 'fallback'.
select 'schedule_items' as tbl, s.title,
       coalesce(sp.sponsor_name, c.buyer_name, s.presented_by_fallback) as credit,
       case when sp.sponsor_name is not null then 'sponsorship'
            when c.buyer_name    is not null then 'credit'
            else 'fallback' end as source
  from schedule_items s
  left join sponsorships sp
    on sp.id = s.presented_by_sponsorship_id and sp.status = 'confirmed'
  left join presentation_credit_items ci on ci.schedule_item_id = s.id
  left join presentation_credits c on c.id = ci.credit_id and c.status = 'confirmed'
 where coalesce(sp.sponsor_name, c.buyer_name, s.presented_by_fallback) is not null
union all
select 'panels', p.title,
       coalesce(sp.sponsor_name, c.buyer_name, p.presented_by_fallback),
       case when sp.sponsor_name is not null then 'sponsorship'
            when c.buyer_name    is not null then 'credit'
            else 'fallback' end
  from panels p
  left join sponsorships sp
    on sp.id = p.presented_by_sponsorship_id and sp.status = 'confirmed'
  left join presentation_credit_items ci on ci.panel_id = p.id
  left join presentation_credits c on c.id = ci.credit_id and c.status = 'confirmed'
 where coalesce(sp.sponsor_name, c.buyer_name, p.presented_by_fallback) is not null;
