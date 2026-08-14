-- Migration 045: rename the Apply Hub CMS page_key from 'home' to 'applyHub'.
--
-- WHY THIS IS A MIGRATION AND NOT JUST A CODE CHANGE. `page_key` is a stored
-- column with a unique constraint on (page_key, section_key), and getContent()
-- looks rows up by it. Renaming the key in src/content/registry.ts WITHOUT this
-- UPDATE does not error — getContent('applyHub') simply matches nothing and
-- falls back to the registry defaults, so /apply silently reverts to shipped
-- copy and every admin edit is orphaned under the old key. Same silent-success
-- shape as the RLS write problem: nothing fails, the page just quietly stops
-- showing what someone typed.
--
-- WHY RENAME AT ALL. The registry had 'home' (= /apply) sitting directly beside
-- 'homepage' (= /). Two keys one letter apart pointing at different pages, with
-- the wrong one reading as the homepage. That is how someone edits the wrong
-- page's copy at 11pm.
--
-- ════════════════════════════════════════════════════════════
-- DEPLOY ORDER — RUN THIS *AFTER* THE DEPLOY IS LIVE. Not before.
-- ════════════════════════════════════════════════════════════
--
-- STEP 0 — check whether any of this matters. Run this by itself first:
--
--     select count(*) from page_content where page_key = 'home';
--
--   0  → the Apply Hub copy was never edited in /admin/content. There is no
--        data to move and NO WINDOW AT ALL. Run the rest whenever; order is
--        irrelevant. Most likely outcome.
--   >0 → that many edits exist. Continue to step 1.
--
-- STEP 1 — let the deploy land. Wait until Vercel shows Ready AND the domain
--          is serving the new build.
-- STEP 2 — run this migration immediately after.
-- STEP 3 — /apply self-corrects within 60s (getContent caches for 60s).
--
-- WHY THIS ORDER, AND NOT THE REVERSE. Both orders have a window in which
-- /apply renders registry defaults instead of the saved copy. The difference is
-- who controls its length:
--
--   Deploy first, then SQL  → the window runs from the deploy going live until
--                             you paste this in. SECONDS, and you decide when
--                             it ends.
--   SQL first, then deploy  → the window runs from the UPDATE until the build
--                             finishes and propagates. MINUTES, and you cannot
--                             shorten it.
--
-- Neither breaks the page — /apply renders correctly-formed default copy in the
-- window, never blank, and never errors. This is about minimising how long the
-- wrong copy is public, not about avoiding an outage.
--
-- ROLLBACK. If the deploy has to be reverted, put the key back so the old code
-- finds its rows again:
--
--     update page_content set page_key = 'home' where page_key = 'applyHub';
begin;

update page_content
   set page_key = 'applyHub'
 where page_key = 'home';

-- ONE statement, deliberately: the SQL editor shows only the last result, and
-- as two separate selects the rows_moved figure — the actual outcome of this
-- migration — would be invisible behind the stale-row check.
--
-- rows_moved: 0 is a legitimate result. It means the Apply Hub copy was never
--   edited and /apply was always rendering registry defaults. Any other number
--   is how many edits were carried across.
-- stale_home_rows: MUST be 0. A surviving 'home' row means the UPDATE was
--   blocked by the (page_key, section_key) unique constraint because an
--   'applyHub' row with the same section_key already existed — which only
--   happens if this migration is run twice with edits made in between.
select
  (select count(*) from page_content where page_key = 'applyHub') as rows_moved,
  (select count(*) from page_content where page_key = 'home')     as stale_home_rows,
  'stale_home_rows must be 0' as expected;

commit;
