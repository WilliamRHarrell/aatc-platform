-- ============================================================
-- Migration 075: applications are read publicly through a column-limited VIEW.
-- Verification: supabase/verify/verify_075.sql
--
-- WHY. "applications: public read deposit-paid" (032; to anon, authenticated)
-- is a TABLE policy, so every column of a directory-visible row was readable
-- by anon and by every signed-in user: email, contact_name, notes,
-- total_amount, id_doc_url, veteran_id_url, user_id, comped_by. 074 narrowed
-- anon with a column grant; authenticated non-owners still saw everything.
-- 038 solved the same problem for sponsorships, exhibitors, food_trucks and
-- panels with security_invoker = false views. This does the same here.
--
-- POLICIES ENUMERATED BEFORE WRITING (applications): "applications: own read"
-- SELECT (001, PUBLIC-scoped, auth.uid() = user_id) KEPT; "applications: own
-- insert" INSERT (001) re-scoped; "applications: admin all" ALL (001)
-- re-scoped; "applications: public read deposit-paid" SELECT to anon,
-- authenticated (032) DROPPED; "applications: own update" UPDATE to
-- authenticated (041) KEPT. NEW: "applications: staff read directory rows".
--
-- WHO LOSES WHAT. anon: table access entirely (the view replaces it).
-- authenticated non-owners: the same. content_editor (/admin/print embeds
-- applications from booths) and sponsorship_manager (/admin/invoices embeds
-- applications from invoices) saw approved, roster-complete, deposit-paid
-- rows through the public policy; the staff policy gives those two roles that
-- exact predicate, so their pages do not change. Owners keep "own read".
-- Admins keep "admin all". The service role bypasses RLS.
--
-- The view strips `id_url` from every element of `artists`: those are paths
-- into the private application-docs bucket and the directory never used them.
--
-- PUBLIC-SCOPED WRITE POLICIES (no TO clause = every role, anon included):
-- the 2026-09-24 audit listed 13. Each is re-created below with the SAME body
-- and an explicit TO. Only the sponsor insert keeps anon: /apply/sponsor
-- inserts from the browser without a session (031/049 clamp the row).
-- ============================================================
begin;

-- ── 1. The view ──────────────────────────────────────────────
create or replace view public.applications_public with (security_invoker = false) as
select a.id, a.event_id, a.status, a.exhibitor_type, a.business_name, a.booth_size,
       a.artist_single_qty, a.artist_double_qty, a.vendor_single_qty, a.vendor_double_qty,
       a.corner_count, a.artist_count,
       a.instagram, a.website, a.facebook, a.phone,
       case when a.artists is null then null
            else (select jsonb_agg(el - 'id_url') from jsonb_array_elements(a.artists) el)
       end as artists,
       a.tv_show, a.logo_url, a.portfolio_image_urls
  from public.applications a
 where a.status = 'approved'
   and a.needs_roster = false
   and (public.has_paid_deposit(a.id) or a.directory_override = true);

comment on view public.applications_public is
  'Directory read model (075). Same predicate as the old public policy; 20 columns; artists[].id_url stripped. The ONLY way anon or a non-owner reads applications.';

revoke all on public.applications_public from public, anon, authenticated;
grant select on public.applications_public to anon, authenticated;

-- ── 2. The table: no public read, no anon access ─────────────
drop policy if exists "applications: public read deposit-paid" on public.applications;
revoke select (
  id, event_id, status, needs_roster, directory_override,
  business_name, exhibitor_type, booth_size,
  artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty, corner_count, artist_count,
  instagram, website, facebook, phone, artists, tv_show, logo_url, portfolio_image_urls
) on table public.applications from anon;
revoke all on table public.applications from anon;

-- ── 3. Staff read: exactly what the two roles saw before ─────
drop policy if exists "applications: staff read directory rows" on public.applications;
create policy "applications: staff read directory rows"
  on public.applications for select to authenticated
  using (
    public.has_role(array['content_editor','sponsorship_manager'])
    and status = 'approved'
    and needs_roster = false
    and (public.has_paid_deposit(id) or directory_override = true)
  );

-- ── 4. PUBLIC-scoped write policies get explicit roles (bodies verbatim) ──
drop policy if exists "applications: own insert" on public.applications;
create policy "applications: own insert"
  on public.applications for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "applications: admin all" on public.applications;
create policy "applications: admin all"
  on public.applications for all to authenticated using (is_admin());

drop policy if exists "booths: admin write" on public.booths;
create policy "booths: admin write"
  on public.booths for all to authenticated using (is_admin());

drop policy if exists "events: admin write" on public.events;
create policy "events: admin write"
  on public.events for all to authenticated using (is_admin());

drop policy if exists "exhibitors: admin write" on public.exhibitors;
create policy "exhibitors: admin write"
  on public.exhibitors for all to authenticated using (is_admin());

drop policy if exists "invoices: admin all" on public.invoices;
create policy "invoices: admin all"
  on public.invoices for all to authenticated using (is_admin());

drop policy if exists "profiles: admin update all" on public.profiles;
create policy "profiles: admin update all"
  on public.profiles for update to authenticated using (is_admin());

drop policy if exists "profiles: own update" on public.profiles;
create policy "profiles: own update"
  on public.profiles for update to authenticated using (auth.uid() = id);

drop policy if exists "contest_entries: admin write" on public.contest_entries;
create policy "contest_entries: admin write"
  on public.contest_entries for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "sponsorships: admin write" on public.sponsorships;
create policy "sponsorships: admin write"
  on public.sponsorships for all to authenticated using (is_admin());

drop policy if exists "panel_registrations: admin all" on public.panel_registrations;
create policy "panel_registrations: admin all"
  on public.panel_registrations for all to authenticated using (is_admin());

drop policy if exists "Vendors update own food_truck" on public.food_trucks;
create policy "Vendors update own food_truck"
  on public.food_trucks for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The one anon write that is by design: /apply/sponsor has no session.
drop policy if exists "Anyone can submit sponsor application" on public.sponsorships;
create policy "Anyone can submit sponsor application"
  on public.sponsorships for insert to anon, authenticated with check (status = 'pending');

commit;
