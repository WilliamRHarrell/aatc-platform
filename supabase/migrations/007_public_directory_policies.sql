-- 007_public_directory_policies.sql
-- Allow unauthenticated visitors to read approved applications and their booth assignments
-- for the public exhibitor directory. Sensitive columns (email, phone, total_amount, etc.)
-- are not included in directory queries but this policy allows the anon role to read
-- the row. Column-level discipline is enforced in the application layer.

create policy "applications: public read approved"
  on applications for select
  to anon, authenticated
  using (status = 'approved');

-- Allow public read of booths that have an assigned application (directory floor plan)
create policy "booths: public read assigned"
  on booths for select
  to anon, authenticated
  using (application_id is not null);
