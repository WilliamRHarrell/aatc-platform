-- ============================================================
-- Migration 024: Tighten public read policies — only show
-- applications and booths whose invoice deposit milestone has
-- fired AND who have completed their roster (needs_roster=false).
-- Replaces the simpler "status='approved'" policy from 007.
-- ============================================================

-- Drop the existing public-read policies from migration 007.
drop policy if exists "applications: public read approved" on applications;
drop policy if exists "booths: public read assigned" on booths;

-- Re-create with deposit + roster conditions.
create policy "applications: public read deposit-paid"
  on applications for select
  to anon, authenticated
  using (
    status = 'approved'
    and needs_roster = false
    and exists (
      select 1 from invoices i
       where i.application_id = applications.id
         and i.deposit_paid_at is not null
    )
  );

create policy "booths: public read deposit-paid"
  on booths for select
  to anon, authenticated
  using (
    application_id is not null
    and exists (
      select 1 from applications a
        join invoices i on i.application_id = a.id
       where a.id = booths.application_id
         and a.status = 'approved'
         and a.needs_roster = false
         and i.deposit_paid_at is not null
    )
  );
