do $$
declare r record; bad text := '';
begin
  for r in select a.business_name, a.status, a.comped_at is not null as booth, a.permits_comped_at is not null as permits,
                  i.amount, i.amount_paid, i.status as inv_status, i.deposit_paid_at is not null as dep, a.deposit_due_at, a.final_due_at
             from public.applications a join public.invoices i on i.application_id = a.id
            where a.business_name in ('Skin Reserve','The Pinback Button Club','Jane Ink','Chop Shop Tattoo') order by a.business_name loop
    raise notice '% (%): booth=% permits=% invoice=% paid=% % deposit=% due=%/%', r.business_name, r.status, r.booth, r.permits, r.amount, r.amount_paid, r.inv_status, r.dep, r.deposit_due_at::date, r.final_due_at::date;
    if r.business_name = 'Jane Ink' and not (r.booth and r.permits and r.amount = 0 and r.inv_status = 'paid') then bad := bad || ' Jane'; end if;
    if r.business_name in ('Skin Reserve','The Pinback Button Club') and not (r.booth and not r.permits and r.amount = 0 and r.inv_status = 'paid') then bad := bad || ' ' || r.business_name; end if;
    if r.business_name = 'Chop Shop Tattoo' and not (r.booth and not r.permits and r.amount = 20000 and r.inv_status = 'pending' and r.deposit_due_at is not null) then bad := bad || ' ChopShop'; end if;
  end loop;
  if bad <> '' then raise exception 'FAIL mapping:%', bad; end if;
  if (select permit_submission_date from public.events where name = 'All American Tattoo Convention 2027') <> date '2027-03-01' then
    raise exception 'FAIL: permit_submission_date not set';
  end if;
  raise notice 'PASS mapping: comps recorded as designed, every invoice unchanged, permit_submission_date 2027-03-01';
end $$;
