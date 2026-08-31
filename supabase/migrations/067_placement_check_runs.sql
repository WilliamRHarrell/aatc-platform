-- ============================================================
-- Migration 067: placement_check_runs
--
-- Stores the outcome of each placement check so the admin dashboard can tell
-- three states apart that otherwise look identical:
--
--   no findings        the check ran and found nothing
--   never run          the check has not run at all
--   errored            the check ran and failed
--
-- A card rendering "nothing" means all three, and TWO OF THEM MEAN THE CHECK IS
-- NOT WORKING. That is the same shape as every other defect this project has
-- found: a quiet surface that reads as healthy. So the run is recorded whatever
-- happens, and `ran_at` is shown regardless of outcome.
--
-- There is a fourth state the table makes visible and a boolean never could:
-- RAN, BUT NOT RECENTLY. A check that silently stopped running still has a last
-- successful run with zero findings, and would read as "all clear" forever.
-- Comparing ran_at against now is what distinguishes a healthy check from an
-- abandoned one, which is the hold rule applied to the check itself.
--
-- WHY finding_keys SEPARATELY FROM findings. The email must say what CHANGED,
-- not restate the set - "3 findings" when it said "3 findings" last week is
-- ignorable, and a reader who learns to ignore it has lost the channel. Diffing
-- needs a stable identity per finding, independent of wording, ordering or any
-- detail that might be reformatted later. The keys array is that identity;
-- `findings` carries the human text and is free to change shape without
-- breaking the diff.
--
-- NOT PUBLIC. Findings name commercial shortfalls - which sponsor is not
-- receiving what they paid for. No anon grant, and no view over this.
-- ============================================================

begin;

create table if not exists public.placement_check_runs (
  id            uuid primary key default gen_random_uuid(),
  ran_at        timestamptz not null default now(),

  status        text not null check (status in ('ok','error')),

  -- Populated only when status = 'error'. A failed run records WHY, because
  -- "the check errored" without the reason sends the reader to the logs, which
  -- is the channel this whole design exists to avoid depending on.
  error_message text,

  -- Human-readable findings. Shape may evolve; the diff does not depend on it.
  findings      jsonb not null default '[]'::jsonb,

  -- Stable identity per finding, for the what-changed diff.
  finding_keys  text[] not null default '{}',

  created_at    timestamptz not null default now(),

  -- An errored run has not measured anything, so it must not claim an empty
  -- finding set - that would read as "all clear" to the diff and could suppress
  -- an email about findings that are still live.
  constraint placement_check_runs_error_has_message check (
    status <> 'error' or (error_message is not null and length(trim(error_message)) > 0)
  )
);

create index if not exists idx_placement_check_runs_ran_at
  on public.placement_check_runs (ran_at desc);

alter table public.placement_check_runs enable row level security;

-- Admin and sponsorship_manager read. The cron writes as service_role, which
-- bypasses RLS, so no insert policy is granted to anyone else: nothing but the
-- scheduled job should be able to fabricate a run.
drop policy if exists "staff read placement checks" on public.placement_check_runs;
create policy "staff read placement checks" on public.placement_check_runs
  for select to authenticated
  using (public.has_role(array['admin','sponsorship_manager']));

revoke select on public.placement_check_runs from anon;

comment on table public.placement_check_runs is
  'One row per placement check run. Exists so the dashboard can distinguish no-findings from never-ran from errored, and so a check that silently stopped running is visible via a stale ran_at. finding_keys is the stable identity used to email only what CHANGED.';

commit;


-- ── REPORT: read this output ────────────────────────────────
-- want: 0 rows. The first row appears after the next 09:00 sweep.
select ran_at, status, error_message, array_length(finding_keys, 1) as findings
  from public.placement_check_runs
 order by ran_at desc
 limit 5;
