-- Migration 042: booth inventory flags. Reconciliation data comes from the
-- floor plan extract — see supabase/verify/verify_042.sql for the queries.
begin;

alter table booths
  add column if not exists is_sellable boolean not null default true,
  add column if not exists house_use   text;

comment on column booths.is_sellable is
  'False = never assignable. Covers house booths (help desk, merch) and numbers that do not exist on the floor.';
comment on column booths.house_use is
  'What a non-sellable booth is used for, or why it does not exist. NULL when sellable.';

-- House booths, per the 2024 plan. Re-confirm against the current plan.
update booths set is_sellable = false, house_use = 'AATC Help Desk'
 where booth_number = '108' and event_id = (select id from events where is_active);
update booths set is_sellable = false, house_use = 'Merch & Contest Registration'
 where booth_number = '241' and event_id = (select id from events where is_active);

-- Numbers printed on the plan that are not real floor positions.
update booths set is_sellable = false, house_use = 'Does not exist on the floor plan'
 where booth_number in ('166', '233') and event_id = (select id from events where is_active);

create index if not exists booths_sellable_idx on booths (event_id, is_sellable) where is_sellable;

commit;
