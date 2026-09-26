-- ============================================================
-- The three 2027 sponsors, 2026-09-26: WholeLife to $7,500, one invoice each
-- with the Square money recorded, and every exclusivity grant and
-- presentation credit linked to its sponsorship by id.
--
-- SUPERSEDES three_sponsors_invoices_exclusivity.sql (never run; it would now
-- insert a second grant per category, which uq_exclusivity_category_per_event
-- refuses, and abort on WholeLife's amount).
--
-- LIVE STATE THIS WAS WRITTEN AGAINST (read-only, 2026-09-26):
--   sponsorships  Nomadica 750000, All American Tattoo Supply 500000,
--                 WholeLife Aftercare 500000 (Ryan: correct is 750000, Gold,
--                 off-tier); all confirmed, none linked to an account
--   invoices      none for any of the three
--   grants        one per sponsor by buyer_name, sponsorship_id NULL
--   credits       Nomadica 750000, WholeLife 500000, sponsorship_id NULL;
--                 none for AATS
--
-- ONE DO BLOCK = ONE TRANSACTION. Every precondition is checked before the
-- first write, every write checks its row count, and the totals are asserted
-- at the end; any failure raises and nothing lands. A second run ABORTS at the
-- "invoices already exist" check.
--
-- INVOICES mirror what /admin/invoices "Record payment" does for a first
-- payment: status stays 'pending' (a balance remains), payment_method
-- 'square', payment_reference NULL (the Square ids are not known here; do not
-- invent one), deposit_paid_at set only when the payment reaches the 25%
-- first-payment minimum (pricing.ts DEPOSIT_PERCENT). So:
--   Nomadica  $7,500 paid $1,875 (25%)  deposit_paid_at set  balance $5,625
--   AATS      $5,000 paid $2,500 (50%)  deposit_paid_at set  balance $2,500
--   WholeLife $7,500 paid   $750 (10%)  deposit_paid_at NULL balance $6,750
-- WholeLife's NULL deposit means the portal will ask for at least $1,875 (25%
-- of $7,500) as its next payment. deposit_paid_at records NOW, the time the
-- payment was recorded, not the Square payment date, which is not known here.
--
-- presentation_credits.invoice_id is left NULL (only sponsorship_id is linked).
-- ============================================================

do $$
declare
  v_event uuid;
  v_nom uuid; v_aats uuid; v_wla uuid;
  n int;
  r record;
begin
  v_event := (select id from public.events where is_active);
  if v_event is null then raise exception 'ABORT: no active event'; end if;

  -- ── Preconditions (no writes above this line) ─────────────
  for r in select * from (values ('Nomadica'), ('All American Tattoo Supply'), ('WholeLife Aftercare')) v(name) loop
    n := (select count(*) from public.sponsorships where event_id = v_event and sponsor_name = r.name);
    if n <> 1 then raise exception 'ABORT: expected exactly 1 sponsorship named "%" on the active event, found %', r.name, n; end if;
  end loop;
  v_nom  := (select id from public.sponsorships where event_id = v_event and sponsor_name = 'Nomadica');
  v_aats := (select id from public.sponsorships where event_id = v_event and sponsor_name = 'All American Tattoo Supply');
  v_wla  := (select id from public.sponsorships where event_id = v_event and sponsor_name = 'WholeLife Aftercare');

  if (select amount from public.sponsorships where id = v_nom)  <> 750000 then raise exception 'ABORT: Nomadica amount is not 750000'; end if;
  if (select amount from public.sponsorships where id = v_aats) <> 500000 then raise exception 'ABORT: AATS amount is not 500000'; end if;
  if (select amount from public.sponsorships where id = v_wla) not in (500000, 750000) then raise exception 'ABORT: WholeLife amount is neither 500000 (before) nor 750000 (after)'; end if;
  if exists (select 1 from public.sponsorships where id in (v_nom, v_aats, v_wla) and status <> 'confirmed') then raise exception 'ABORT: one of the three is not confirmed'; end if;

  n := (select count(*) from public.invoices where sponsorship_id in (v_nom, v_aats, v_wla));
  if n <> 0 then raise exception 'ABORT: % invoice(s) already exist for these sponsors - this has run already, or they were invoiced by hand. Creating more would bill them twice.', n; end if;

  for r in select * from (values ('Nomadica', 'accounting_presentation'), ('All American Tattoo Supply', 'on_site_supplier'), ('WholeLife Aftercare', 'tattoo_battle')) v(name, category) loop
    n := (select count(*) from public.exclusivity_grants where event_id = v_event and category = r.category and buyer_name = r.name and sponsorship_id is null);
    if n <> 1 then raise exception 'ABORT: expected 1 unlinked % grant for "%", found %', r.category, r.name, n; end if;
  end loop;

  n := (select count(*) from public.presentation_credits where event_id = v_event and buyer_name = 'Nomadica' and sponsorship_id is null);
  if n <> 1 then raise exception 'ABORT: expected 1 unlinked Nomadica credit, found %', n; end if;
  n := (select count(*) from public.presentation_credits where event_id = v_event and buyer_name = 'WholeLife Aftercare' and sponsorship_id is null);
  if n <> 1 then raise exception 'ABORT: expected 1 unlinked WholeLife credit, found %', n; end if;
  if (select amount from public.presentation_credits where event_id = v_event and buyer_name = 'WholeLife Aftercare') not in (500000, 750000) then
    raise exception 'ABORT: WholeLife credit amount is neither 500000 nor 750000';
  end if;

  -- ── 1. WholeLife to $7,500 ────────────────────────────────
  update public.sponsorships set amount = 750000 where id = v_wla and amount = 500000;
  update public.presentation_credits set amount = 750000
   where event_id = v_event and buyer_name = 'WholeLife Aftercare' and amount = 500000;
  if (select amount from public.sponsorships where id = v_wla) <> 750000 then raise exception 'FAIL: WholeLife sponsorship amount did not land'; end if;
  if (select amount from public.presentation_credits where event_id = v_event and buyer_name = 'WholeLife Aftercare') <> 750000 then raise exception 'FAIL: WholeLife credit amount did not land'; end if;

  -- ── 2. Invoices, Square money recorded ────────────────────
  insert into public.invoices (sponsorship_id, amount, amount_paid, status, payment_method, deposit_paid_at)
  select s.id, s.amount, v.paid, 'pending', 'square',
         case when v.paid >= ceil(s.amount * 0.25) then now() end
    from (values (v_nom, 187500), (v_aats, 250000), (v_wla, 75000)) v(sid, paid)
    join public.sponsorships s on s.id = v.sid;
  get diagnostics n = row_count;
  if n <> 3 then raise exception 'FAIL: expected 3 invoices inserted, got %', n; end if;

  -- ── 3. Link grants and credits by id ──────────────────────
  update public.exclusivity_grants g set sponsorship_id = v.sid
    from (values (v_nom, 'Nomadica', 'accounting_presentation'), (v_aats, 'All American Tattoo Supply', 'on_site_supplier'), (v_wla, 'WholeLife Aftercare', 'tattoo_battle')) v(sid, name, category)
   where g.event_id = v_event and g.category = v.category and g.buyer_name = v.name and g.sponsorship_id is null;
  get diagnostics n = row_count;
  if n <> 3 then raise exception 'FAIL: expected 3 grants linked, got %', n; end if;

  update public.presentation_credits c set sponsorship_id = v.sid
    from (values (v_nom, 'Nomadica'), (v_wla, 'WholeLife Aftercare')) v(sid, name)
   where c.event_id = v_event and c.buyer_name = v.name and c.sponsorship_id is null;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'FAIL: expected 2 credits linked, got %', n; end if;

  -- ── After: assert the values, not just the counts ─────────
  if (select string_agg(s.sponsor_name || '=' || (i.amount - i.amount_paid) || '/' || (i.deposit_paid_at is not null), ',' order by s.sponsor_name)
        from public.invoices i join public.sponsorships s on s.id = i.sponsorship_id
       where i.sponsorship_id in (v_nom, v_aats, v_wla))
     <> 'All American Tattoo Supply=250000/true,Nomadica=562500/true,WholeLife Aftercare=675000/false' then
    raise exception 'FAIL: balances or deposit milestones are not as intended';
  end if;
  raise notice 'DONE: WholeLife 750000; 3 invoices (balances 5625.00 / 2500.00 / 6750.00); 3 grants and 2 credits linked';
end $$;

-- ── REPORT (results grid): what the portal will offer once each sponsor is linked to an account
select s.sponsor_name, s.amount / 100.0 as deal, i.amount / 100.0 as invoiced, i.amount_paid / 100.0 as paid_square,
       (i.amount - i.amount_paid) / 100.0 as balance_due, i.payment_method, i.status, i.deposit_paid_at is not null as deposit_milestone,
       g.category as exclusivity, c.amount / 100.0 as credit, s.user_id is not null as linked_to_account
  from public.sponsorships s
  join public.invoices i on i.sponsorship_id = s.id
  left join public.exclusivity_grants g on g.sponsorship_id = s.id
  left join public.presentation_credits c on c.sponsorship_id = s.id
 where s.event_id = (select id from public.events where is_active)
   and s.sponsor_name in ('Nomadica', 'All American Tattoo Supply', 'WholeLife Aftercare')
 order by s.sponsor_name;
