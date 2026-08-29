-- ============================================================
-- Migration 053: tie a vote to an account, one vote per contest per DAY
--
-- MUST BE APPLIED BEFORE seeding contests. Today the only thing preventing
-- anonymous vote stuffing is that contest_entries is empty: the insert policy
-- on contest_votes is `with check (true)`, verified live with the anon key,
-- which returned 23503 (foreign key) rather than 42501 (RLS). The seed creates
-- contests, entries follow, and at that moment the write path is open to
-- anyone posting at PostgREST with the UI bypassed.
--
-- Identity was a voter_token: a crypto.randomUUID() in localStorage. For a
-- one-vote-per-day rule that is one vote per day per browser profile, which a
-- private window defeats in seconds. For a contest deciding a free booth, with
-- artists actively driving their own audiences to vote, that is the attack.
--
-- Safe to make these columns NOT NULL: contest_votes currently holds 0 rows.
-- ============================================================

-- ── identity ────────────────────────────────────────────────
alter table public.contest_votes
  add column if not exists voter_id uuid references auth.users(id) on delete cascade;

-- The defeated mechanism is REMOVED, not left beside the new one. A vestigial
-- identity column is an invitation to use it again, and any code still writing
-- it would look like it was working.
alter table public.contest_votes drop constraint if exists contest_votes_contest_id_voter_token_key;
alter table public.contest_votes drop column if exists voter_token;

alter table public.contest_votes alter column voter_id set not null;

-- ── one vote per contest per day ────────────────────────────
-- vote_date is a stored column set by a trigger, NOT a generated column and NOT
-- an expression index. Both were tried first and neither is possible:
-- `created_at at time zone 'America/New_York'` is STABLE, not IMMUTABLE,
-- because the timezone database can change underneath it, and Postgres refuses
-- it in an index or a generated column. A trigger evaluates it at write time,
-- which is exactly when the answer is knowable.
--
-- America/New_York rather than UTC deliberately: a voter's day has to end at
-- their midnight, not at 8pm local, or the rule reads as arbitrary to them.
alter table public.contest_votes
  add column if not exists vote_date date;

create or replace function public.set_vote_date() returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.vote_date := (now() at time zone 'America/New_York')::date;
  return new;
end;
$$;

drop trigger if exists contest_votes_set_vote_date on public.contest_votes;
create trigger contest_votes_set_vote_date
  before insert on public.contest_votes
  for each row execute function public.set_vote_date();

update public.contest_votes
   set vote_date = (created_at at time zone 'America/New_York')::date
 where vote_date is null;

alter table public.contest_votes alter column vote_date set not null;

alter table public.contest_votes drop constraint if exists contest_votes_one_per_day;
alter table public.contest_votes
  add constraint contest_votes_one_per_day unique (contest_id, voter_id, vote_date);

-- ── policies ────────────────────────────────────────────────
-- The old policy was `to anon, authenticated with check (true)`. Without this
-- replacement voter_id is decorative: anyone could post any other person's id.
drop policy if exists "contest_votes: public insert" on public.contest_votes;
create policy "contest_votes: own insert" on public.contest_votes
  for insert to authenticated
  with check (voter_id = auth.uid());

-- Needed for the UI to work at all. VotingBoard used to read its own past votes
-- from localStorage; with identity server-side it has to read them back, and it
-- may only ever see its own.
drop policy if exists "contest_votes: own read" on public.contest_votes;
create policy "contest_votes: own read" on public.contest_votes
  for select to authenticated
  using (voter_id = auth.uid());

create index if not exists contest_votes_voter_idx
  on public.contest_votes (voter_id, contest_id, vote_date);

-- ── marketing consent, same three columns as pinup_entries ──
-- Vote registration is an account, so consent lives on profiles. One shape in
-- both places: a contact captured by voting and a contact captured by entering
-- the pinup contest must be answerable by the same query.
alter table public.profiles
  add column if not exists marketing_opt_in boolean not null default false;
alter table public.profiles
  add column if not exists marketing_opt_in_at timestamptz;
alter table public.profiles
  add column if not exists marketing_opt_in_source text;

alter table public.profiles drop constraint if exists profiles_opt_in_has_timestamp;
alter table public.profiles
  add constraint profiles_opt_in_has_timestamp
  check (marketing_opt_in = false or marketing_opt_in_at is not null);

comment on column public.profiles.marketing_opt_in_source is
  'Where consent was given: pinup-entry | vote-registration. Same values as pinup_entries.marketing_opt_in_source.';
