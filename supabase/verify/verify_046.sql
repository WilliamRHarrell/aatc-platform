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
-- VERIFY 046 — run after 046 and BEFORE 047. Nothing mutates.
--
-- 046 gave panels a real `panel_day date` and `panel_start time`, replacing
-- free-text display strings. Query D is the gate for running 047.
--
-- Query A: the new columns exist with the right types.
-- Query B: the backfill is complete.                          ← GATE FOR 047
-- Query C: old and new agree, side by side.                   ← eyeball this
-- Query D: every seminar now lands on a real schedule day.
-- Query E: what verify_044 D used to check is now structural.
-- ============================================================


-- ── A. Columns and types ────────────────────────────────────
-- want: panel_day = date, panel_start = time without time zone, both nullable.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'panels'
   and column_name in ('panel_day','panel_start','panel_date','panel_time')
 order by column_name;


-- ── B. GATE FOR 047 — backfill complete ─────────────────────
-- want: 0 rows. Anything here has a panel_date that matched no schedule day, or
-- a panel_time this could not parse. **Do not run 047 while this returns rows**
-- — dropping the text columns discards the only record of what those panels
-- were meant to say. Fix them in /admin/panels first.
select id, title, panel_date, panel_time, panel_day, panel_start
  from panels
 where panel_day is null
    or panel_start is null;


-- ── C. EYEBALL THIS — old and new side by side ──────────────
-- The backfill is the one irreversible part of this change. Read every row and
-- confirm the date and time actually correspond before running 047.
-- want: 2 rows today (Bookkeeping 2027-04-18 13:30, Tooth Gem 2027-04-18 15:00).
select title,
       panel_date                        as was_text_date,
       panel_day                         as now_real_date,
       to_char(panel_day, 'FMDay, FMMonth FMDD') as renders_as,
       panel_time                        as was_text_time,
       panel_start                       as now_real_time
  from panels
 where event_id = (select id from events where is_active)
 order by panel_day, panel_start;


-- ── D. Seminars land on real schedule days ──────────────────
-- want: every row matches_a_schedule_day = true.
-- This is now a genuine date equality rather than a string comparison, so a
-- false here means the panel is on a day with no programme at all — a real
-- content question, not a formatting mismatch.
select p.title, p.panel_day,
       exists (select 1 from schedule_items s
                where s.day_date = p.panel_day
                  and s.event_id = p.event_id) as matches_a_schedule_day
  from panels p
 where p.event_id = (select id from events where is_active)
 order by p.panel_day, p.panel_start;


-- ── E. What this migration retired ──────────────────────────
-- verify_044.sql query D existed solely because the schedule joined panels to
-- the programme by matching a free-text display string against a generated
-- label. A mismatch did not error — the seminar was silently absent from the
-- schedule and nothing reported it.
--
-- That join is now `panels.panel_day = schedule_items.day_date`: a date
-- equality between two date columns. The failure mode is not fixed, it is
-- structurally impossible — there is no string to mistype, and a wrong date is
-- visible in query C rather than invisible on the public page.
--
-- Once 047 has run, verify_044 query D can be deleted. It is left in place
-- until then because until 047 the text columns still exist.
-- (No query here — this block is a note. Deliberately not a `select 'note'`:
-- as the file's LAST statement that would be the only thing displayed if
-- anyone ran the file whole, hiding every real check above it.)
