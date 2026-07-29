-- ============================================================
-- Migration 027: Homepage sponsor placement
--
-- Adds an explicit "show on the homepage" flag plus a manual ordering
-- column, and widens the public read policy so homepage-flagged sponsors
-- are actually readable by anon visitors.
--
-- NOTE: migration 025 restricted public reads to `featured_footer = true`
-- only. Adding show_on_homepage WITHOUT widening that policy would leave the
-- homepage grid permanently empty — the rows exist but anon cannot select them.
-- ============================================================

alter table sponsorships
  add column if not exists show_on_homepage boolean not null default false;

alter table sponsorships
  add column if not exists homepage_order integer;

comment on column sponsorships.show_on_homepage is
  'Render this sponsor in the homepage sponsor grid.';
comment on column sponsorships.homepage_order is
  'Manual sort order for the homepage grid; nulls sort last, then tier, then name.';

create index if not exists sponsorships_homepage_idx
  on sponsorships (show_on_homepage, homepage_order)
  where show_on_homepage = true;

-- ── Public read policy ──────────────────────────────────────
-- Same paid/confirmed gate as migration 025, but a sponsor qualifies via
-- EITHER placement flag. Still requires status='confirmed' AND a linked
-- invoice with final_paid_at set, so unpaid sponsors never render publicly.
drop policy if exists "Public can read paid featured sponsors" on sponsorships;

create policy "Public can read paid placed sponsors"
  on sponsorships for select
  to anon, authenticated
  using (
    (featured_footer = true or show_on_homepage = true)
    and status = 'confirmed'
    and exists (
      select 1 from invoices i
       where i.sponsorship_id = sponsorships.id
         and i.final_paid_at is not null
    )
  );
