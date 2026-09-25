-- ============================================================
-- Migration 076: aatc_submissions gets a home in the repo; pinup entries can
-- be added by an admin; the last anon write policy goes.
-- Verification: supabase/verify/verify_076.sql
--
-- ⚠  APPLY AFTER PR 1 (feat/sponsor-submission-emails) IS DEPLOYED. Section 3
-- drops the anon INSERT on sponsorships; the old browser insert on
-- /apply/sponsor would break. The route is the only writer from PR 1 on.
--
-- 1. aatc_submissions was created in the dashboard (2026-09-24 audit: no
--    migration creates it). Its LIVE shape and policies were read by Ryan on
--    2026-09-25 from information_schema / pg_constraint / pg_policies and are
--    pinned here EXACTLY (HANDOFF: read the live shape, not a file). The
--    CREATE TABLE IF NOT EXISTS is a no-op live and the record for a fresh
--    database. POLICIES ENUMERATED (all four PUBLIC-scoped live):
--      "admins read all"       SELECT  using EXISTS(profiles ... role = 'admin')
--      "admins update all"     UPDATE  using the same EXISTS, no with_check
--      "exhibitors insert own" INSERT  with check auth.uid() = exhibitor_id
--      "exhibitors read own"   SELECT  using auth.uid() = exhibitor_id
--    Re-created with VERBATIM bodies and `to authenticated`. The two admin
--    policies keep their inline profiles check rather than is_admin() so
--    behaviour is unchanged; see HANDOFF for the equivalence note.
-- 2. pinup_entries: POLICIES ENUMERATED: "admins read pinup entries" SELECT,
--    "admins write pinup entries" UPDATE, "admins delete pinup entries"
--    DELETE (051), all to authenticated using is_admin(); no INSERT policy
--    since 074. NEW: "admins insert pinup entries" so /admin/pinup can add an
--    entry by hand (Ryan, 2026-09-25). The route's service-role path is
--    unchanged; a by-hand entry sets its own status (confirmed / waitlist).
-- 3. sponsorships: "Anyone can submit sponsor application" INSERT to anon,
--    authenticated (013, re-scoped 075) DROPPED. /api/sponsor-apply (service
--    role, PR 1 - this branch is stacked on it so the tree that carries 076
--    also carries the route) is the only writer. After this no policy in
--    public grants anon a write of any kind (verify_076 D asserts it).
-- ============================================================
begin;

-- ── 1. aatc_submissions ──────────────────────────────────────
create table if not exists public.aatc_submissions (
  id               uuid primary key default gen_random_uuid(),
  exhibitor_id     uuid not null references auth.users(id) on delete cascade,
  artist_name      text not null,
  instagram_handle text not null,
  square_paths     text[] not null,
  vertical_paths   text[] not null,
  caption          text not null,
  status           text not null default 'submitted',
  postiz_post_id   text,
  rejection_reason text,
  reviewed_by      uuid references auth.users(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);
alter table public.aatc_submissions enable row level security;

drop policy if exists "admins read all" on public.aatc_submissions;
create policy "admins read all"
  on public.aatc_submissions for select to authenticated
  using (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role));

drop policy if exists "admins update all" on public.aatc_submissions;
create policy "admins update all"
  on public.aatc_submissions for update to authenticated
  using (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role));

drop policy if exists "exhibitors insert own" on public.aatc_submissions;
create policy "exhibitors insert own"
  on public.aatc_submissions for insert to authenticated
  with check (auth.uid() = exhibitor_id);

drop policy if exists "exhibitors read own" on public.aatc_submissions;
create policy "exhibitors read own"
  on public.aatc_submissions for select to authenticated
  using (auth.uid() = exhibitor_id);

comment on table public.aatc_submissions is
  'AATC social graphic submissions from exhibitors (/portal/graphics), reviewed at /admin/aatc-queue and dispatched by /api/aatc/queue-dispatch. Created in the dashboard; shape and policies pinned by migration 076.';

-- ── 2. pinup_entries: admin insert ───────────────────────────
drop policy if exists "admins insert pinup entries" on public.pinup_entries;
create policy "admins insert pinup entries"
  on public.pinup_entries for insert to authenticated
  with check (public.is_admin());

-- Consent timestamps come from the DATABASE clock for every writer (the rule
-- 052/055 set for register_pinup_entry). A by-hand admin insert sends the
-- consent booleans only; this trigger stamps them, so a client clock never
-- becomes the evidence.
create or replace function public.pinup_entries_stamp_consent()
returns trigger language plpgsql
set search_path = public, pg_catalog as $$
begin
  if new.likeness_release and new.likeness_release_at is null then new.likeness_release_at := now(); end if;
  if new.marketing_opt_in and new.marketing_opt_in_at is null then new.marketing_opt_in_at := now(); end if;
  return new;
end $$;
drop trigger if exists pinup_entries_stamp_consent_trg on public.pinup_entries;
create trigger pinup_entries_stamp_consent_trg
  before insert on public.pinup_entries
  for each row execute function public.pinup_entries_stamp_consent();

-- ── 3. sponsorships: no anon write ───────────────────────────
drop policy if exists "Anyone can submit sponsor application" on public.sponsorships;

commit;
