-- Migration 040: contest results schema (schema only — public build is early 2027).
--
-- PHOTO DECISION: photo_url stays the primary/cover shot, photo_urls[] holds
-- additional angles. Not a rename — VotingBoard, /contests and
-- /admin/contests/[id] all read photo_url today, and the voting feature runs
-- live at the show. Adding alongside keeps every one of them working untouched.
--
-- Year comes from contests.event_id -> events, so results are year-scoped with
-- no year column and 2028 needs no migration.
begin;

alter table contest_entries
  add column if not exists placement      smallint,
  add column if not exists placement_note text,
  add column if not exists placed_at      timestamptz,
  add column if not exists photo_urls     text[] not null default '{}';

alter table contest_entries
  drop constraint if exists contest_entries_placement_check;
alter table contest_entries
  add constraint contest_entries_placement_check
  check (placement is null or placement between 1 and 10);

comment on column contest_entries.placement is
  'Finishing position, 1 = first. NULL means entered but did not place.';
comment on column contest_entries.placement_note is
  'Award as announced, e.g. "Best in Show — Color". Free text: the spoken award name does not always match the contest name.';
comment on column contest_entries.photo_urls is
  'Additional angles. photo_url remains the cover shot used by voting and cards.';

create index if not exists contest_entries_placement_idx
  on contest_entries (contest_id, placement)
  where placement is not null;

commit;
