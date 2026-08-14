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
-- DEPLOY ORDERING — there is a window either way, and it is cosmetic.
--   Migration first: code still asks for 'home', gets nothing, /apply shows
--                    registry defaults until the deploy lands.
--   Deploy first:    code asks for 'applyHub', gets nothing, same result.
-- Either way /apply renders correctly-formed default copy, never blank, and it
-- self-corrects the moment both sides are in place. Run them close together.
-- If /admin/content has never been used to edit the Apply Hub there are no rows
-- at all and the window does not exist.
begin;

update page_content
   set page_key = 'applyHub'
 where page_key = 'home';

-- Row count is the whole verification. 0 is a legitimate result — it means the
-- Apply Hub copy was never edited and /apply was always rendering registry
-- defaults. Any other number is how many edits were carried across.
select count(*) as rows_moved
  from page_content
 where page_key = 'applyHub';

-- Must be 0. A surviving 'home' row means the UPDATE was blocked by the
-- (page_key, section_key) unique constraint because an 'applyHub' row with the
-- same section_key already existed — which would only happen if this migration
-- were run twice with edits made in between.
select count(*) as stale_home_rows_want_zero
  from page_content
 where page_key = 'home';

commit;
