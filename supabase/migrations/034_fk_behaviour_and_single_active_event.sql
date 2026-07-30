-- Migration 034: FK delete rules + one active event.
-- Rationale and verification: supabase/verify/verify_034.sql
begin;

alter table invoices drop constraint if exists invoices_food_truck_id_fkey;
alter table invoices add constraint invoices_food_truck_id_fkey
  foreign key (food_truck_id) references food_trucks(id) on delete cascade;

alter table invoices drop constraint if exists invoices_sponsorship_id_fkey;
alter table invoices add constraint invoices_sponsorship_id_fkey
  foreign key (sponsorship_id) references sponsorships(id) on delete cascade;

alter table exhibitors drop constraint if exists exhibitors_booth_id_fkey;
alter table exhibitors add constraint exhibitors_booth_id_fkey
  foreign key (booth_id) references booths(id) on delete cascade;

alter table page_content drop constraint if exists page_content_updated_by_fkey;
alter table page_content add constraint page_content_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

create unique index if not exists events_one_active_idx
  on events (is_active) where is_active = true;

commit;
