-- ============================================================
-- Sponsor payment terms, 2026-09-26: the Square payments get their real
-- dates, and each invoice gets its negotiated due date.
--
--   sponsor                     paid (Square)       balance   due
--   WholeLife Aftercare          $750  2026-04-23   $6,750    2027-01-31
--   Nomadica                   $1,875  2026-05-05   $5,625    2027-01-01
--   All American Tattoo Supply $2,500  2026-05-05   $2,500    2027-01-01
--
-- deposit_paid_at is the only per-payment date an invoice has, so it carries
-- the Square date. It is set for WholeLife too: sponsors have NO deposit
-- requirement, and a NULL deposit_paid_at is what makes the portal demand 25%
-- ($1,875) as the next payment. Times are noon Eastern so the date reads the
-- same in any US time zone.
--
-- Runs after three_sponsors_2026_09_26.sql. One DO block: preconditions
-- first, every write row-counted, values asserted at the end; a failure
-- raises and nothing lands. A second run ABORTS (due_date already set).
-- ============================================================

do $$
declare
  v_event uuid;
  n int;
  r record;
begin
  v_event := (select id from public.events where is_active);
  if v_event is null then raise exception 'ABORT: no active event'; end if;

  for r in select * from (values
      ('WholeLife Aftercare',         75000, 750000),
      ('Nomadica',                   187500, 750000),
      ('All American Tattoo Supply', 250000, 500000)
    ) v(name, paid, amount) loop
    n := (select count(*) from public.invoices i join public.sponsorships s on s.id = i.sponsorship_id
           where s.event_id = v_event and s.sponsor_name = r.name);
    if n <> 1 then raise exception 'ABORT: expected 1 invoice for %, found %', r.name, n; end if;
    if not exists (select 1 from public.invoices i join public.sponsorships s on s.id = i.sponsorship_id
                    where s.event_id = v_event and s.sponsor_name = r.name
                      and i.amount = r.amount and i.amount_paid = r.paid and i.payment_method = 'square'
                      and i.status = 'pending' and i.due_date is null and i.final_paid_at is null) then
      raise exception 'ABORT: % invoice is not the one three_sponsors_2026_09_26.sql created (amount %, paid %, square, pending, no due date) - already run, or changed since', r.name, r.amount, r.paid;
    end if;
  end loop;

  update public.invoices i
     set deposit_paid_at = v.paid_on, due_date = v.due
    from public.sponsorships s,
         (values ('WholeLife Aftercare',        timestamptz '2026-04-23 12:00 America/New_York', date '2027-01-31'),
                 ('Nomadica',                   timestamptz '2026-05-05 12:00 America/New_York', date '2027-01-01'),
                 ('All American Tattoo Supply', timestamptz '2026-05-05 12:00 America/New_York', date '2027-01-01')) v(name, paid_on, due)
   where s.id = i.sponsorship_id and s.event_id = v_event and s.sponsor_name = v.name
     and i.due_date is null;
  get diagnostics n = row_count;
  if n <> 3 then raise exception 'FAIL: expected 3 invoices updated, got %', n; end if;

  if (select string_agg(s.sponsor_name || '=' || to_char(i.deposit_paid_at at time zone 'America/New_York', 'YYYY-MM-DD') || '/' || i.due_date::text || '/' || (i.amount - i.amount_paid), ',' order by s.sponsor_name)
        from public.invoices i join public.sponsorships s on s.id = i.sponsorship_id
       where s.event_id = v_event and s.sponsor_name in ('WholeLife Aftercare', 'Nomadica', 'All American Tattoo Supply'))
     <> 'All American Tattoo Supply=2026-05-05/2027-01-01/250000,Nomadica=2026-05-05/2027-01-01/562500,WholeLife Aftercare=2026-04-23/2027-01-31/675000' then
    raise exception 'FAIL: dates or balances are not as intended';
  end if;
  raise notice 'DONE: Square dates and due dates set on all three sponsor invoices';
end $$;

-- ── REPORT (results grid)
select s.sponsor_name, i.amount_paid / 100.0 as paid, (i.deposit_paid_at at time zone 'America/New_York')::date as paid_on,
       (i.amount - i.amount_paid) / 100.0 as balance, i.due_date, i.payment_method, i.status
  from public.invoices i join public.sponsorships s on s.id = i.sponsorship_id
 where s.event_id = (select id from public.events where is_active)
   and s.sponsor_name in ('WholeLife Aftercare', 'Nomadica', 'All American Tattoo Supply')
 order by s.sponsor_name;
