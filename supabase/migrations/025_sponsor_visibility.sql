-- ============================================================
-- Migration 025: Sponsor visibility gated on final_paid_at
-- Replaces the migration 019 policy. Public can read a sponsorship row
-- only when:
--   - featured_footer = true
--   - status = 'confirmed'
--   - at least one linked invoice has final_paid_at IS NOT NULL
-- ============================================================

drop policy if exists "Public can read featured footer sponsors" on sponsorships;

create policy "Public can read paid featured sponsors"
  on sponsorships for select
  to anon, authenticated
  using (
    featured_footer = true
    and status = 'confirmed'
    and exists (
      select 1 from invoices i
       where i.sponsorship_id = sponsorships.id
         and i.final_paid_at is not null
    )
  );
