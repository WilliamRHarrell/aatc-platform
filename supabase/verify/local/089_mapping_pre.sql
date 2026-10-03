-- Copies of the four real rows as read 2026-10-03 (ids kept), before 089.
do $$
declare e uuid := (select id from public.events where is_active);
begin
  insert into public.applications (id, event_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, corner_count, artist_count, comped_at, approved_at)
  values ('13c265d7-04e4-4142-a673-721201ded275', e, 'vendor', 'Skin Reserve', 'S', 's@example.com', 60000, 'approved', 1, 1, 0, '2026-09-24', '2026-09-24');
  insert into public.applications (id, event_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count, comped_at)
  values ('44c185e8-0000-4000-8000-000000000001', e, 'vendor', 'The Pinback Button Club', 'P', 'p@example.com', 55000, 'pending', 1, 0, '2026-09-24');
  insert into public.applications (id, event_id, exhibitor_type, business_name, contact_name, email, total_amount, status, artist_single_qty, artist_count, comped_at)
  values ('657cc8cf-0000-4000-8000-000000000001', e, 'artist', 'Jane Ink', 'J', 'j@example.com', 85000, 'pending', 1, 1, '2026-09-30');
  insert into public.applications (id, event_id, exhibitor_type, business_name, contact_name, email, total_amount, status, artist_double_qty, corner_count, artist_count, is_veteran, approved_at, deposit_due_at, final_due_at)
  values ('c6cfee7f-0cdf-45d6-abaf-897dd2ed3f67', e, 'artist', 'Chop Shop Tattoo', 'C', 'c@example.com', 265000, 'approved', 2, 2, 4, true, '2026-10-02', '2026-11-01', '2027-01-01');
  -- The insert clamp (072/079) always clears comped_at; comps are set afterwards, as in production.
  update public.applications set comped_at = '2026-09-24' where business_name in ('Skin Reserve', 'The Pinback Button Club');
  update public.applications set comped_at = '2026-09-30' where business_name = 'Jane Ink';
  insert into public.invoices (application_id, amount, amount_paid, status, paid_at, deposit_paid_at, final_paid_at) values
    ('13c265d7-04e4-4142-a673-721201ded275', 0, 0, 'paid', now(), now(), now()),
    ('44c185e8-0000-4000-8000-000000000001', 0, 0, 'paid', now(), now(), now()),
    ('657cc8cf-0000-4000-8000-000000000001', 0, 0, 'paid', now(), now(), now());
  insert into public.invoices (application_id, amount, amount_paid, status) values ('c6cfee7f-0cdf-45d6-abaf-897dd2ed3f67', 20000, 0, 'pending');
end $$;
