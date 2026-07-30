-- ============================================================
-- Migration 034: Correct FK delete behaviour + enforce one active event
--
-- From a full audit of all 21 foreign keys in the schema. Two of the four
-- SET NULL relationships were found by accident during teardowns, which is the
-- wrong way to discover them.
--
-- NOT CHANGED, deliberately:
--   booths.application_id -> applications  SET NULL
--     The FK is right: releasing a booth when an application goes away is
--     correct. The bug is in the lifecycle sweep, which clears the link while
--     leaving booths.status as reserved/sold — a code fix, not an FK fix.
--   sponsorships.user_id  -> auth.users    NO ACTION
--     Blocking deletion of a user who still has a sponsorship is defensible;
--     it forces an explicit decision about the sponsorship first.
--   food_trucks.user_id   -> auth.users    SET NULL
--     Correct: the truck outlives the account that registered it.
-- ============================================================

begin;

-- ── 1. invoices.food_truck_id: SET NULL -> CASCADE ──────────
-- An invoice with no parent is meaningless. Migration 033's exactly-one-parent
-- constraint turns the old SET NULL into a hard error on truck deletion, which
-- is safer than orphaning but still wrong — the invoice should simply go with
-- the truck it bills.
alter table invoices
  drop constraint if exists invoices_food_truck_id_fkey;

alter table invoices
  add constraint invoices_food_truck_id_fkey
  foreign key (food_truck_id) references food_trucks(id) on delete cascade;

-- ── 2. invoices.sponsorship_id: NO ACTION -> CASCADE ────────
-- application_id on this same table is already CASCADE. The inconsistency meant
-- deleting a sponsorship errored instead of removing its invoice.
alter table invoices
  drop constraint if exists invoices_sponsorship_id_fkey;

alter table invoices
  add constraint invoices_sponsorship_id_fkey
  foreign key (sponsorship_id) references sponsorships(id) on delete cascade;

-- ── 3. exhibitors.booth_id: SET NULL -> CASCADE ─────────────
-- Judgement call, as invited. CASCADE rather than keeping the link.
--
-- Reasoning: an exhibitor row is derived from an application and is scoped to a
-- single event, so it has no meaning once its booth is gone — and a silent
-- SET NULL leaves a record that looks complete while having lost which booth it
-- occupied, with no trace. Booths are only ever deleted when tearing down an
-- event's floor, at which point the exhibitor rows for that floor should go
-- too. RESTRICT was the alternative, but it would block routine event teardown
-- on rows nobody intends to keep.
alter table exhibitors
  drop constraint if exists exhibitors_booth_id_fkey;

alter table exhibitors
  add constraint exhibitors_booth_id_fkey
  foreign key (booth_id) references booths(id) on delete cascade;

-- ── 4. page_content.updated_by: NO ACTION -> SET NULL ───────
-- Deleting a departed admin should not be blocked by CMS rows they once edited.
-- The audit value is the timestamp and the content, not the identity.
alter table page_content
  drop constraint if exists page_content_updated_by_fkey;

alter table page_content
  add constraint page_content_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

-- ── 5. Exactly one active event ─────────────────────────────
-- 020's idempotency guard keyed on the NEW event name, so it could never
-- recognise the existing 'AATC Fayetteville 2027' row as the same show and
-- inserted a second one. Nothing in the schema prevented two active events;
-- today's single-active state is luck, not enforcement.
--
-- With this index in place, 020 would have failed loudly at the point of
-- duplication instead of silently stranding five panels, two contests, two food
-- trucks and a real sponsor on an orphaned event.
do $$
declare n_active int;
begin
  select count(*) into n_active from events where is_active = true;
  if n_active > 1 then
    raise exception
      'Migration 034 ABORTED: % active events. Deactivate all but one before adding the constraint.', n_active;
  end if;
  if n_active = 0 then
    raise warning 'No active event — the index will be added, but set one active.';
  end if;
end $$;

create unique index if not exists events_one_active_idx
  on events (is_active)
  where is_active = true;

comment on index events_one_active_idx is
  'At most one event may have is_active = true. Partial unique index — inactive rows are unconstrained.';

-- ── Acceptance check ────────────────────────────────────────
do $$
declare
  v_expected text[] := array[
    'exhibitors_booth_id_fkey:c',
    'invoices_food_truck_id_fkey:c',
    'invoices_sponsorship_id_fkey:c',
    'page_content_updated_by_fkey:n'
  ];
  v_actual text[];
begin
  select array_agg(conname || ':' || confdeltype order by conname)
    into v_actual
    from pg_constraint
   where contype = 'f'
     and conname in (
       'invoices_food_truck_id_fkey',
       'invoices_sponsorship_id_fkey',
       'exhibitors_booth_id_fkey',
       'page_content_updated_by_fkey'
     );

  -- confdeltype: c = CASCADE, n = SET NULL, a = NO ACTION, r = RESTRICT
  if v_actual is distinct from (select array_agg(x order by x) from unnest(v_expected) x) then
    raise exception 'Migration 034 FAILED: FK delete rules are %, expected %.', v_actual, v_expected;
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'events_one_active_idx'
  ) then
    raise exception 'Migration 034 FAILED: events_one_active_idx not created.';
  end if;

  raise notice 'Migration 034 OK — 4 FK rules corrected, one-active-event index enforced.';
end $$;

commit;
