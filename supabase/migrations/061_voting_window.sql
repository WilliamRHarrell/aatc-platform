-- ============================================================
-- Migration 061: a voting window that can be opened and closed
--
-- COLUMNS ONLY. The dates are DATA and go in via the SQL editor - see
-- supabase/seeds/voting_window_2027.sql.
--
-- THE PROBLEM. The 30-day voting window is stated publicly and sold as a
-- Collector's Choice perk ('30 days of online voting after the show'), and
-- nothing enforced it. The board appeared the moment an entry existed and never
-- stopped. Two consequences: uploading trophy winners on Sunday made voting
-- live during the show, defeating the after-the-weekend artist-mobilisation the
-- feature exists for; and nothing ever closed it, leaving a prize-bearing vote
-- running indefinitely.
--
-- THE CONTROL IS TIME, NOT ENTRIES. That separation is the point. Ryan uploads
-- winners Sunday evening through Tuesday while the photos are fresh, and voting
-- stays shut until Wednesday noon regardless.
--
-- WHY COLUMNS ON events RATHER THAN A CONSTANT. event-config.ts holds
-- DOORS_OPEN_ISO and FINAL_DUE_AT, so a constant would have precedent - but
-- PINUP_REGISTRATION_OPEN is flipped once by hand after a check, whereas this
-- fires on a date and may need moving if the show overruns, as it did in 2026.
-- A deploy to open voting is the wrong mechanism. events already carries
-- registration_open_date, so an event-scoped date column is the established
-- pattern here; this uses timestamptz rather than date because a noon boundary
-- needs a time of day.
--
-- Year-scoped through event_id, so 2028 needs no migration.
-- ============================================================

alter table public.events
  add column if not exists voting_opens_at  timestamptz,
  add column if not exists voting_closes_at timestamptz;

comment on column public.events.voting_opens_at is
  'Collector''s Choice voting opens. NULL means voting has never been scheduled and is CLOSED - the absence of a window is not an open one.';
comment on column public.events.voting_closes_at is
  'Collector''s Choice voting closes, INCLUSIVE. The stored value is the last instant a vote is accepted, so the check is <= rather than <.';

-- Both set, and open before close. A half-configured window is the state that
-- would silently leave voting open forever.
alter table public.events drop constraint if exists events_voting_window_ordered;
alter table public.events
  add constraint events_voting_window_ordered
  check (
    (voting_opens_at is null and voting_closes_at is null)
    or (voting_opens_at is not null and voting_closes_at is not null
        and voting_closes_at > voting_opens_at)
  );

-- ── enforcement, server-side ────────────────────────────────
-- The UI hiding the board does NOT close voting. 053's policy accepts a vote
-- from any authenticated user whenever an entry exists, so a closed board with
-- an open policy is the same mistake as gating the pinup form while leaving
-- POST /api/pinup-entry answering - which is why that flag closes the route too.
--
-- NULL is treated as CLOSED, deliberately. An event with no window configured
-- must refuse votes rather than accept them, because the failure of forgetting
-- to set the dates should be 'nobody can vote yet', not 'everyone voted early'.
drop policy if exists "contest_votes: own insert" on public.contest_votes;
create policy "contest_votes: own insert" on public.contest_votes
  for insert to authenticated
  with check (
    voter_id = auth.uid()
    and exists (
      select 1
        from public.contest_entries ce
        join public.contests c on c.id = ce.contest_id
        join public.events e   on e.id = c.event_id
       where ce.id = contest_votes.entry_id
         and e.voting_opens_at  is not null
         and e.voting_closes_at is not null
         and now() >= e.voting_opens_at
         and now() <= e.voting_closes_at
    )
  );

-- Read-only helper so a page can ask the state without duplicating the
-- comparison in TypeScript, where it would drift.
create or replace function public.voting_state(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select case
    when e.voting_opens_at is null or e.voting_closes_at is null then 'unscheduled'
    when now() <  e.voting_opens_at  then 'before'
    when now() <= e.voting_closes_at then 'open'
    else 'closed'
  end
  from public.events e where e.id = p_event_id;
$$;

revoke all on function public.voting_state(uuid) from public;
grant execute on function public.voting_state(uuid) to anon, authenticated, service_role;
