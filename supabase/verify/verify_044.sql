-- ============================================================
-- ⚠  RUN ONE LETTERED BLOCK AT A TIME — DO NOT RUN THIS FILE WHOLE.
--
-- The Supabase SQL Editor displays only the LAST statement's result. Running
-- the whole file returns the final query and silently discards every check
-- above it, which looks exactly like a file that only ever had one check in
-- it. Nothing errors; the other results simply never appear.
--
-- Select from a block's `-- ── X.` header down to its semicolon, run that,
-- read the result, then move to the next. The expected result is stated in
-- each block, usually as a `want:` comment or an `expected` column.
--
-- A few blocks are marked `(2 queries)` and contain a second statement labelled
-- `X2 of 2`. Run those separately too — the same last-statement-wins rule
-- applies inside a block.
-- ============================================================

-- ============================================================
-- VERIFY 044 — run after the migration AND both seeds. Nothing mutates.
--
-- Order: 044 → seeds/schedule_2027.sql → seeds/panels_2027.sql → this file.
--
-- Query A: schedule_items exists with the credit columns.
-- Query B: both public views are SECURITY DEFINER.
-- Query C: anon cannot reach the base table.
-- Query D: THE JOIN KEY — panels appear in the programme.     ← silent failure
-- Query E: the announce gate — no unconfirmed sponsor is published.
-- Query F: credits still carried as plain text.                ← the to-do list
-- Query G: programme sanity — 25 items, three days.
-- ============================================================


-- ── A. Table and credit columns ─────────────────────────────
-- want: presented_by_sponsorship_id uuid NULL, presented_by_fallback text NULL
-- on BOTH schedule_items and panels.
select table_name, column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'schedule_items'
         and column_name in ('presented_by_sponsorship_id','presented_by_fallback',
                             'day_date','start_time','sort_order','kind','is_published'))
     or (table_name = 'panels'
         and column_name in ('presented_by_sponsorship_id','presented_by_fallback')))
 order by table_name, column_name;


-- ── B. Views are definer, not invoker ───────────────────────
-- security_invoker = true would make the sponsor join run as the CALLER, and
-- anon has no read on sponsorships — every credit would silently resolve to
-- the fallback even where a real sponsorship is linked.
-- want: 2 rows, security_invoker = false on both.
select c.relname as view_name,
       coalesce(
         (select option_value from pg_options_to_table(c.reloptions)
           where option_name = 'security_invoker'), 'false') as security_invoker,
       'want false' as expected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'v'
   and c.relname in ('schedule_items_public','panels_public')
 order by 1;


-- ── C. Base table closed to anon ────────────────────────────
-- want: 0 rows. Public reads go through the view; the base table carries only
-- the admin policy.
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name   = 'schedule_items'
   and grantee      = 'anon';


-- ── D. THE JOIN KEY — the silent failure ──────────── (2 queries) ─
-- The schedule page groups panels by matching `panels.panel_date` (free text)
-- against a day label it GENERATES from schedule_items.day_date, formatted as
-- 'Friday, April 16'. A panel whose panel_date does not match one of those
-- strings exactly does not error and does not appear — it is simply absent
-- from the programme, and nothing anywhere reports it.
--
-- want: every row matches = true. A false means that seminar is invisible on
-- /events/schedule right now.
with day_labels as (
  select distinct to_char(day_date, 'FMDay, FMMonth FMDD') as label
    from schedule_items
   where event_id = (select id from events where is_active)
)
select p.title, p.panel_date, p.panel_time,
       p.panel_date in (select label from day_labels) as matches_a_schedule_day,
       'want true' as expected
  from panels p
 where p.event_id = (select id from events where is_active)
 order by p.panel_time;

-- D2 of 2 — run separately. The labels themselves, for eyeballing against
-- panel_date above.
select distinct to_char(day_date, 'FMDay, FMMonth FMDD') as day_label
  from schedule_items
 where event_id = (select id from events where is_active)
 order by 1;


-- ── E. The announce gate ────────────────────────────────────
-- Both views join sponsorships with `status = 'confirmed'`. Confirming is the
-- sole publish gate everywhere else on the site; the schedule must not become
-- a second back door that announces a sponsor early.
--
-- want: 0 rows. A row here is a schedule item or panel whose FK points at a
-- sponsorship that is NOT confirmed — the credit correctly falls back to plain
-- text, but it means someone linked a sponsor who is not announceable yet.
select 'schedule_items' as source, s.title, sp.sponsor_name, sp.status
  from schedule_items s
  join sponsorships sp on sp.id = s.presented_by_sponsorship_id
 where sp.status <> 'confirmed'
union all
select 'panels', p.title, sp.sponsor_name, sp.status
  from panels p
  join sponsorships sp on sp.id = p.presented_by_sponsorship_id
 where sp.status <> 'confirmed';


-- ── F. Credits still carried as plain text — the to-do list ─
-- Expected today: 'Whole Life Aftercare' (Tattoo Battle, schedule_items) and
-- 'Nomadica' (Bookkeeping seminar, panels). Both render as unlinked text until
-- a confirmed sponsorship row exists and is linked.
--
-- This query IS the reconciliation the spec asked for: a presentation credit
-- that lives only as a fallback string cannot be reported on or checked
-- against what was sold. Drive it to 0 rows.
select 'schedule_items' as source, s.title, s.presented_by_fallback as credit
  from schedule_items s
 where s.presented_by_fallback is not null
   and s.presented_by_sponsorship_id is null
union all
select 'panels', p.title, p.presented_by_fallback
  from panels p
 where p.presented_by_fallback is not null
   and p.presented_by_sponsorship_id is null;


-- ── G. Programme sanity ─────────────────────────────────────
-- want: 3 rows — 2027-04-16 (10), 2027-04-17 (9), 2027-04-18 (6). Total 25.
-- The two seminars are NOT counted here; they are panels rows by design.
select day_date, count(*) as items,
       min(start_time) as first_item, max(start_time) as last_item
  from schedule_items
 where event_id = (select id from events where is_active)
 group by day_date
 order by day_date;


-- ============================================================
-- STILL UNVERIFIED AFTER THIS FILE.
--
-- 1. NO ADMIN WRITE PATH EXISTS YET. schedule_items is seeded by SQL and has
--    only an `is_admin()` policy — there is no /admin/schedule. Until that
--    lands, a schedule change means editing the seed and re-running it. That
--    was the accepted tradeoff for shipping the pages now; it is not a
--    permanent state, and it means the RLS policy on schedule_items has never
--    been exercised by a real write.
--
-- 2. THE PANELS WRITE PATHS ARE NEWLY GUARDED BUT UNTESTED. /admin/panels had
--    three unguarded writes (update, delete, image_url update) that reported
--    success on zero rows; all now use guardedWrite(). Confirm by editing a
--    panel as a NON-admin role — a content_editor hits `is_admin()` and must
--    now see a real error rather than a success toast. Nobody has run that.
-- ============================================================
