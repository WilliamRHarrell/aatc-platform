-- ============================================================
-- Migration 052: contest category columns + marketing consent
--
-- REQUIRES 051 to have been applied first - the second half alters
-- pinup_entries, which 051 creates. If this fails on that table, run 051.
--
-- Two unrelated changes in one migration because they were specified together
-- and both are additive column adds. Neither backfills anything.
-- ============================================================

-- ── contests: category flags ────────────────────────────────
-- No contest_day column, deliberately. The day is already derivable from
-- scheduled_time, and a second representation of the same fact is a thing that
-- can disagree with itself.
--
-- "order" is the existing int column from migration 001. It is a reserved word
-- and must stay quoted. No sort_order is added.
alter table public.contests
  add column if not exists is_kids_category boolean not null default false;

alter table public.contests
  add column if not exists active boolean not null default true;

comment on column public.contests.is_kids_category is
  'True only for the kids temporary tattoo category. The 18+ rule that applies to every other contest does not apply to it.';

comment on column public.contests.active is
  'False hides a category without deleting it. Deleting would cascade to contest_entries and contest_votes.';

-- ── pinup_entries: marketing consent ────────────────────────
-- CAN-SPAM baseline, opt-in by default. Three columns rather than one because
-- a bare boolean cannot answer the two questions that actually get asked:
-- when did they agree, and what were they doing at the time.
--
-- The same three columns go on vote registration when that is built. One shape,
-- both places.
alter table public.pinup_entries
  add column if not exists marketing_opt_in boolean not null default false;

alter table public.pinup_entries
  add column if not exists marketing_opt_in_at timestamptz;

alter table public.pinup_entries
  add column if not exists marketing_opt_in_source text;

-- Consent without a timestamp is not evidence of consent, so the two are tied
-- together rather than left to the application to remember. The reverse is
-- allowed: a withdrawn opt-in keeps its original timestamp as a record.
alter table public.pinup_entries
  drop constraint if exists pinup_entries_opt_in_has_timestamp;
alter table public.pinup_entries
  add constraint pinup_entries_opt_in_has_timestamp
  check (marketing_opt_in = false or marketing_opt_in_at is not null);

comment on column public.pinup_entries.marketing_opt_in is
  'Explicit, separate, unticked-by-default consent to MARKETING email. Never a condition of entry. Contest emails (confirmation, schedule changes, check-in) are transactional and are sent regardless - do not route marketing through that path.';

comment on column public.pinup_entries.marketing_opt_in_source is
  'Where consent was given: pinup-entry | vote-registration. Recorded so a contact can be traced back to the moment they agreed.';

-- ── register_pinup_entry(): carry consent, stamp it server-side ──
-- The 8 argument version from 051 is DROPPED rather than left in place. With
-- both present, a call using named arguments could match either and Postgres
-- would raise an ambiguity error at runtime - on the intake path, in front of a
-- contestant. Dropping is safe here: nothing but this route calls it.
drop function if exists public.register_pinup_entry(uuid,text,text,text,text,text,text,int);

create or replace function public.register_pinup_entry(
  p_event_id         uuid,
  p_full_name        text,
  p_email            text,
  p_phone            text,
  p_stage_name       text default null,
  p_address          text default null,
  p_notes            text default null,
  p_capacity         int  default 25,
  p_marketing_opt_in boolean default false
)
returns table (id uuid, status text, queue_position int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_taken int;
  v_status text;
  v_id uuid;
begin
  if p_full_name is null or length(trim(p_full_name)) = 0
     or p_email is null or length(trim(p_email)) = 0
     or p_phone is null or length(trim(p_phone)) = 0 then
    raise exception 'full_name, email and phone are required'
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('pinup_entry:' || p_event_id::text));

  -- pinup_entries.status is QUALIFIED, and must stay qualified. RETURNS TABLE
  -- puts `status` in scope as an OUT variable, so a bare `status` here is
  -- ambiguous between the variable and the column. plpgsql's default
  -- variable_conflict is `error`, so this raises at RUNTIME - on the first
  -- registration, after the form is live - rather than at CREATE FUNCTION time.
  -- The same trap applies to `id`; every reference to it below is qualified too.
  select count(*) into v_taken
    from public.pinup_entries
   where pinup_entries.event_id = p_event_id
     and pinup_entries.status in ('pending','confirmed');

  v_status := case when v_taken < p_capacity then 'confirmed' else 'waitlist' end;

  insert into public.pinup_entries
    (event_id, full_name, stage_name, email, phone, address, notes, age_confirmed, status,
     marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source)
  values
    (p_event_id, trim(p_full_name), nullif(trim(coalesce(p_stage_name,'')),''),
     lower(trim(p_email)), trim(p_phone), nullif(trim(coalesce(p_address,'')),''),
     nullif(trim(coalesce(p_notes,'')),''), true, v_status,
     p_marketing_opt_in,
     -- Stamped HERE, from the database clock. The caller never supplies it:
     -- a self-reported consent time is not evidence, and this is the exact
     -- field that would be looked at if the consent were ever challenged.
     case when p_marketing_opt_in then now() else null end,
     case when p_marketing_opt_in then 'pinup-entry' else null end)
  returning pinup_entries.id into v_id;

  return query select v_id, v_status, v_taken + 1;
end;
$$;

revoke all on function public.register_pinup_entry(uuid,text,text,text,text,text,text,int,boolean) from public;
grant execute on function public.register_pinup_entry(uuid,text,text,text,text,text,text,int,boolean)
  to service_role;
