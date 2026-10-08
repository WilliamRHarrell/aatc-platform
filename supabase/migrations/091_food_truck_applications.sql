-- Migration 091: public food truck applications (PR 1 of 3).
--
-- Ryan, 2026-10-07 (docs/superpowers/plans/2026-10-07-food-truck-application.md):
-- trucks apply at /apply/food-truck, Ryan approves, waitlists or does not
-- select them in /admin/food-trucks, approval is capped (default 8, counting
-- the 3 imported trucks) and applications open only behind a switch.
--
-- Until now food_trucks had no status: every row was a truck the admin had
-- added (or the Square import), billed at once. This adds:
--   1. food_trucks.status (pending / approved / waitlisted / not_selected /
--      released). EXISTING rows become 'approved' (they are trucks we already
--      took); new rows default to 'pending'. 'released' is used from PR 2.
--   2. Application columns: photos (max 5 storage paths), applied_at,
--      acknowledged_at, and the decision columns decided_at,
--      decision_email_opt_out, decision_email_sent_at.
--   3. events.food_truck_applications_open (default OFF; Ryan opens it after
--      PR 2's deposit rule) and events.food_truck_cap (default 8).
--   4. The cap as a trigger, so admin Add and approval both hit it: a row
--      moving INTO 'approved' locks the event row and refuses past the cap.
--      A truck can be published only while approved.
--   5. Decision columns are admin-only: the 090 staff-column trigger also
--      keeps status and the decision/application columns for content editors
--      and owners; a non-admin INSERT starts pending with no decision.
--   6. One active application per email per event (pending, approved,
--      waitlisted), as a partial unique index. Checked first: an existing
--      duplicate aborts with the names rather than a bare constraint error.
--   7. The food-truck-logos bucket limit goes from 5 MB to 10 MB (applicant
--      photos, Ryan's decision 9). Logos stay limited to 5 MB by the app.
--
-- Existing policies, enumerated before changing (replay of 001-090, `npm run
-- verify:local -- --dump-schema`, 2026-10-07):
--   food_trucks: "Vendors update own food_truck" UPDATE (user_id = auth.uid()),
--                "food_trucks: editorial write" ALL has_role(admin, content_editor),
--                "food_trucks: own read" SELECT (user_id = auth.uid()).
--   events:      "events: admin write" ALL is_admin(), "events: public read" SELECT true.
--   storage.objects (food-truck-logos): unchanged from 090.
-- No policy is added, dropped or changed. Applications are inserted by the
-- server route with the service role; anon still has no access to food_trucks.

begin;

-- ── 1-2. columns ─────────────────────────────────────────────
-- Added with default 'approved' so every existing row is backfilled as
-- approved, then the default becomes 'pending' for new rows.
alter table public.food_trucks
  add column if not exists status text not null default 'approved';
alter table public.food_trucks alter column status set default 'pending';
alter table public.food_trucks drop constraint if exists food_trucks_status_check;
alter table public.food_trucks add constraint food_trucks_status_check
  check (status in ('pending', 'approved', 'waitlisted', 'not_selected', 'released'));

alter table public.food_trucks
  add column if not exists photos text[] not null default '{}',
  add column if not exists applied_at timestamptz,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_email_opt_out boolean not null default false,
  add column if not exists decision_email_sent_at timestamptz;
alter table public.food_trucks drop constraint if exists food_trucks_photos_max;
alter table public.food_trucks add constraint food_trucks_photos_max check (cardinality(photos) <= 5);

comment on column public.food_trucks.status is
  'pending (applied) / approved (selected, counts toward events.food_truck_cap) / waitlisted / not_selected / released (PR 2). Admin only (091).';
comment on column public.food_trucks.applied_at is 'Set by /api/food-truck-apply. NULL for trucks the admin added or imported.';

-- ── 3. the switch and the cap on the event row ──────────────
alter table public.events
  add column if not exists food_truck_applications_open boolean not null default false,
  add column if not exists food_truck_cap int not null default 8;
alter table public.events drop constraint if exists events_food_truck_cap_check;
alter table public.events add constraint events_food_truck_cap_check check (food_truck_cap > 0);
comment on column public.events.food_truck_applications_open is
  '/apply/food-truck shows the form only when true. Edited on /admin/food-trucks (091).';
comment on column public.events.food_truck_cap is
  'Most approved food trucks for the event, imported ones included. Approval past it is refused (091).';

-- ── 4. the cap, and publish only while approved ─────────────
create or replace function public.food_trucks_enforce_cap()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_cap int; v_taken int;
begin
  if new.is_published and new.status <> 'approved' then
    raise exception 'food truck % can be published only while approved (status %)', new.id, new.status
      using errcode = '23514', hint = 'FOOD_TRUCK_NOT_APPROVED';
  end if;
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved' or old.event_id is distinct from new.event_id) then
    -- The event row lock serialises concurrent approvals for one event.
    select food_truck_cap into v_cap from public.events where id = new.event_id for update;
    select count(*) into v_taken from public.food_trucks
     where event_id = new.event_id and status = 'approved' and id <> new.id;
    if v_taken >= v_cap then
      raise exception 'food truck cap reached: % of % selected', v_taken, v_cap
        using errcode = '23514', hint = 'FOOD_TRUCK_CAP';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists food_trucks_zz_enforce_cap_trg on public.food_trucks;
create trigger food_trucks_zz_enforce_cap_trg
  before insert or update on public.food_trucks
  for each row execute function public.food_trucks_enforce_cap();
revoke execute on function public.food_trucks_enforce_cap() from public, anon, authenticated;

-- ── 5. decision columns are admin-only ──────────────────────
-- 090's body, plus: anyone but an admin or a trusted server context keeps
-- status and the application/decision columns. Content editors still edit
-- the profile and publishing; owners still edit the profile only.
create or replace function public.food_trucks_protect_staff_columns()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  new.status                 := old.status;
  new.applied_at             := old.applied_at;
  new.acknowledged_at        := old.acknowledged_at;
  new.decided_at             := old.decided_at;
  new.decision_email_opt_out := old.decision_email_opt_out;
  new.decision_email_sent_at := old.decision_email_sent_at;
  if public.has_role(array['content_editor']) then return new; end if;
  new.event_id       := old.event_id;
  new.user_id        := old.user_id;
  new.email          := old.email;
  new.days           := old.days;
  new.thursday_setup := old.thursday_setup;
  new.is_published   := old.is_published;
  return new;
end $$;
revoke execute on function public.food_trucks_protect_staff_columns() from public, anon, authenticated;

-- A content editor's INSERT ("food_trucks: editorial write") starts pending.
-- Same-event triggers fire in name order: aa_guard_insert, protect_staff_columns,
-- then zz_enforce_cap, so the cap sees the values the guards leave.
create or replace function public.food_trucks_guard_insert()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  new.status                 := 'pending';
  new.is_published           := false;
  new.applied_at             := null;
  new.acknowledged_at        := null;
  new.decided_at             := null;
  new.decision_email_opt_out := false;
  new.decision_email_sent_at := null;
  return new;
end $$;
drop trigger if exists food_trucks_aa_guard_insert_trg on public.food_trucks;
create trigger food_trucks_aa_guard_insert_trg
  before insert on public.food_trucks
  for each row execute function public.food_trucks_guard_insert();
revoke execute on function public.food_trucks_guard_insert() from public, anon, authenticated;

-- ── 6. one active application per email per event ───────────
do $$
declare v_dupes text;
begin
  select string_agg(format('%s (%s rows: %s)', e, n, names), '; ') into v_dupes
    from (select lower(email) e, count(*) n, string_agg(business_name, ', ') names
            from public.food_trucks
           where status in ('pending', 'approved', 'waitlisted') and email <> ''
           group by event_id, lower(email) having count(*) > 1) d;
  if v_dupes is not null then
    raise exception 'ABORT 091: food trucks share an email within an event, fix before applying: %', v_dupes;
  end if;
end $$;
create unique index if not exists food_trucks_one_active_per_email_event
  on public.food_trucks (event_id, lower(email))
  where status in ('pending', 'approved', 'waitlisted') and email <> '';

-- ── 7. photos up to 10 MB ───────────────────────────────────
update storage.buckets set file_size_limit = 10485760 where id = 'food-truck-logos';

commit;
