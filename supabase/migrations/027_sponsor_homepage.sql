-- ============================================================
-- Migration 027: Homepage sponsor placement + break the invoices RLS cycle
--
-- Adds show_on_homepage / homepage_order / is_in_kind, and rewrites the
-- public sponsorship read policy so it NO LONGER subqueries `invoices`.
--
-- WHY THE POLICY CHANGES SHAPE
-- The live database currently throws on ANY anon read of sponsorships:
--     42P17 infinite recursion detected in policy for relation "invoices"
-- Migration 025's policy did `exists (select 1 from invoices ...)`, and
-- evaluating that subquery triggers the invoices policies, which recurse.
-- Result: /sponsors, the site footer logos and the homepage grid all return
-- nothing for anonymous visitors — paying sponsors are invisible today.
--
-- Cross-table policy dependencies are what created the cycle, so public
-- visibility is now decided purely by columns ON sponsorships. Payment is
-- enforced at the admin layer (an admin ticks the placement box) rather than
-- in RLS. That also fixes trade / in-kind sponsors — Title tier, host-hotel
-- arrangements — which have no invoice row and could never satisfy the old
-- paid-invoice gate no matter what an admin ticked.
-- ============================================================

alter table sponsorships
  add column if not exists show_on_homepage boolean not null default false;

alter table sponsorships
  add column if not exists homepage_order integer;

-- Trade / in-kind sponsors: no invoice will ever exist for these.
alter table sponsorships
  add column if not exists is_in_kind boolean not null default false;

comment on column sponsorships.show_on_homepage is
  'Render this sponsor in the homepage sponsor grid.';
comment on column sponsorships.homepage_order is
  'Manual sort order for the homepage grid; nulls sort last, then tier, then name.';
comment on column sponsorships.is_in_kind is
  'Trade/in-kind sponsor with no invoice (e.g. Title tier, host hotel). Recorded so unpaid-but-intentional placements are diagnosable.';

create index if not exists sponsorships_homepage_idx
  on sponsorships (show_on_homepage, homepage_order)
  where show_on_homepage = true;

-- ── Public read policy ──────────────────────────────────────
-- Confirmed sponsors that an admin has explicitly placed somewhere public.
-- No subquery into invoices, so no recursion is possible.
drop policy if exists "Public can read paid featured sponsors" on sponsorships;
drop policy if exists "Public can read paid placed sponsors" on sponsorships;
drop policy if exists "Public can read featured footer sponsors" on sponsorships;

create policy "Public can read placed sponsors"
  on sponsorships for select
  to anon, authenticated
  using (
    (featured_footer = true or show_on_homepage = true)
    and status = 'confirmed'
  );

-- Defence in depth: migration 001 left a blanket `using (true)` read policy on
-- sponsorships. RLS combines permissive policies with OR, so that baseline
-- makes every stricter policy above cosmetic — anon can read every row,
-- including pending sponsors and their contact details.
drop policy if exists "sponsorships: public read" on sponsorships;
