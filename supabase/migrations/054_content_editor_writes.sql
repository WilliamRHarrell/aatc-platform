-- ============================================================
-- Migration 054: content_editor may write editorial content
--
-- Migration 039 added the content_editor role and its description names
-- contests, panels and site copy explicitly. proxy.ts admits it to those admin
-- pages. But every write policy still required role = 'admin', so the INTENDED
-- grant and the ENFORCED grant disagreed - and the disagreement was silent on
-- update and delete, because a policy that filters a row out returns zero rows
-- and no error. The UI reported success and the row did not change.
--
-- This migration makes the enforced grant match the intended one. The silent
-- half was fixed first, in the commit before this: every editorial write in the
-- admin UI now goes through guardedWrite(), so if any gap remains it fails
-- loudly instead of quietly.
--
-- MECHANISM: has_role(array['admin','content_editor']) from migration 039,
-- everywhere, with no per-table variation. has_role compares role::text and has
-- a pinned search_path, same rule as is_admin().
--
-- WITH CHECK is stated explicitly on every policy below, even where it repeats
-- USING. Several of the originals omitted it and relied on Postgres falling
-- back to the USING expression. That fallback is correct but invisible, and
-- contest_entries is a live example of a table whose insert behaviour is only
-- explicable once you know the rule.
-- ============================================================

-- ── editorial: contests (the CATEGORIES, structure of the show) ──
drop policy if exists "contests: admin write" on public.contests;
create policy "contests: editorial write" on public.contests
  for all to authenticated
  using (public.has_role(array['admin','content_editor']))
  with check (public.has_role(array['admin','content_editor']));

-- ── editorial: panels ───────────────────────────────────────
drop policy if exists "panels: admin all" on public.panels;
create policy "panels: editorial write" on public.panels
  for all to authenticated
  using (public.has_role(array['admin','content_editor']))
  with check (public.has_role(array['admin','content_editor']));

-- ── editorial: schedule_items ───────────────────────────────
drop policy if exists "schedule_items: admin all" on public.schedule_items;
create policy "schedule_items: editorial write" on public.schedule_items
  for all to authenticated
  using (public.has_role(array['admin','content_editor']))
  with check (public.has_role(array['admin','content_editor']));

-- ── editorial: food_trucks ──────────────────────────────────
-- The original inlined `(select role from profiles where id = auth.uid())`,
-- which re-enters profiles from inside a policy - the shape behind the 42P17
-- recursion fixed in 027/028. has_role is SECURITY DEFINER and does not.
drop policy if exists "Admin full access on food_trucks" on public.food_trucks;
create policy "food_trucks: editorial write" on public.food_trucks
  for all to authenticated
  using (public.has_role(array['admin','content_editor']))
  with check (public.has_role(array['admin','content_editor']));

-- ── editorial: page_content ─────────────────────────────────
drop policy if exists "admins write content" on public.page_content;
create policy "page_content: editorial write" on public.page_content
  for all to authenticated
  using (public.has_role(array['admin','content_editor']))
  with check (public.has_role(array['admin','content_editor']));

-- ── editorial: page_images (050 built it admin-only pending this) ──
drop policy if exists "admins write page images" on public.page_images;
create policy "page_images: editorial write" on public.page_images
  for all to authenticated
  using (public.has_role(array['admin','content_editor']))
  with check (public.has_role(array['admin','content_editor']));

-- Storage objects follow the table. An editor who may set image_path but not
-- upload the file it names can only produce a broken image.
drop policy if exists "Admin can insert page images" on storage.objects;
create policy "Editorial can insert page images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'page-images' and public.has_role(array['admin','content_editor']));

drop policy if exists "Admin can update page images" on storage.objects;
create policy "Editorial can update page images"
  on storage.objects for update to authenticated
  using (bucket_id = 'page-images' and public.has_role(array['admin','content_editor']));

drop policy if exists "Admin can delete page images" on storage.objects;
create policy "Editorial can delete page images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'page-images' and public.has_role(array['admin','content_editor']));

-- ── NOT widened, deliberately ───────────────────────────────
-- contest_entries stays ADMIN ONLY. Once the seed lands and entries exist these
-- are competition records - who entered, in which category, and after migration
-- 040 their placement. Deleting one changes a contest result, not site copy.
-- Granting it as a side effect of a copy role would be the wrong reason; if
-- content_editor should manage entries at the show, that is its own decision.
--
-- Also unchanged and admin-only: sponsorships, invoices, applications,
-- exhibitors (identity documents), booths (assignment drives invoicing),
-- profiles, pinup_entries. contest_votes keeps the policies from 053 - voters
-- write their own rows and no admin role writes it.

comment on table public.contests is
  'Contest CATEGORIES. Editorial: admin or content_editor may write. Entries are contest_entries and are admin-only, being competition records.';
