-- ============================================================
-- Migration 055: likeness release on pinup_entries
--
-- The first-place Convention Feature prize is a photo shoot at the show, with
-- the images used in AATC promotional material. That uses a contestant's
-- likeness, so consent is captured at entry.
--
-- REQUIRED TO ENTER, unlike the other two consents on this form. That is a
-- deliberate exception and is enforced in three places so it cannot be
-- sidestepped: the check constraint below, the anon insert policy, and the
-- function. See docs/HANDOFF.md for why it is required rather than optional.
--
-- Three consents, three columns, three checkboxes, none pre-checked:
--   age_confirmed      required   18+
--   likeness_release   required   photography and promotional use
--   marketing_opt_in   OPTIONAL   future events and presales
--
-- Requires 051 and 052.
-- ============================================================

alter table public.pinup_entries
  add column if not exists likeness_release boolean not null default false;

alter table public.pinup_entries
  add column if not exists likeness_release_at timestamptz;

-- Mirrors the marketing constraint. Consent without a timestamp is not evidence
-- of consent, and this is the field that matters if it is ever questioned.
alter table public.pinup_entries
  drop constraint if exists pinup_entries_likeness_has_timestamp;
alter table public.pinup_entries
  add constraint pinup_entries_likeness_has_timestamp
  check (likeness_release = false or likeness_release_at is not null);

comment on column public.pinup_entries.likeness_release is
  'Consent to be photographed at the convention and for AATC to use the images promotionally. REQUIRED to enter, because the first-place Convention Feature prize is a photo shoot and cannot be awarded to someone who has not agreed. Distinct from marketing_opt_in, which is optional and never a condition of entry.';

-- The anon insert policy already refused a self-assigned status and an
-- unconfirmed age. Consent that the route requires but the database does not
-- would be bypassable by posting straight at PostgREST.
drop policy if exists "anon may submit a pinup entry" on public.pinup_entries;
create policy "anon may submit a pinup entry" on public.pinup_entries
  for insert to anon, authenticated
  with check (status = 'pending' and age_confirmed = true and likeness_release = true);

-- ── register_pinup_entry(): carry the release, stamp it server-side ──
-- Drops the 9 argument version rather than leaving it beside the 10. Two
-- overloads make a named-argument call ambiguous at runtime, on the intake
-- path - the same hazard recorded against 051 in docs/HANDOFF.md.
drop function if exists public.register_pinup_entry(uuid,text,text,text,text,text,text,int,boolean);

create or replace function public.register_pinup_entry(
  p_event_id         uuid,
  p_full_name        text,
  p_email            text,
  p_phone            text,
  p_stage_name       text default null,
  p_address          text default null,
  p_notes            text default null,
  p_capacity         int  default 25,
  p_marketing_opt_in boolean default false,
  p_likeness_release boolean default false
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

  -- Required, and refused here as well as in the route. The route is not the
  -- only possible caller.
  if p_likeness_release is not true then
    raise exception 'the likeness release is required to enter'
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('pinup_entry:' || p_event_id::text));

  select count(*) into v_taken
    from public.pinup_entries
   where pinup_entries.event_id = p_event_id
     and pinup_entries.status in ('pending','confirmed');

  v_status := case when v_taken < p_capacity then 'confirmed' else 'waitlist' end;

  insert into public.pinup_entries
    (event_id, full_name, stage_name, email, phone, address, notes, age_confirmed, status,
     marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source,
     likeness_release, likeness_release_at)
  values
    (p_event_id, trim(p_full_name), nullif(trim(coalesce(p_stage_name,'')),''),
     lower(trim(p_email)), trim(p_phone), nullif(trim(coalesce(p_address,'')),''),
     nullif(trim(coalesce(p_notes,'')),''), true, v_status,
     p_marketing_opt_in,
     case when p_marketing_opt_in then now() else null end,
     case when p_marketing_opt_in then 'pinup-entry' else null end,
     true,
     -- Database clock, never the caller's. Same rule as the marketing stamp.
     now())
  returning pinup_entries.id into v_id;

  return query select v_id, v_status, v_taken + 1;
end;
$$;

revoke all on function public.register_pinup_entry(uuid,text,text,text,text,text,text,int,boolean,boolean) from public;
grant execute on function public.register_pinup_entry(uuid,text,text,text,text,text,text,int,boolean,boolean)
  to service_role;
