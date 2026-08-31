-- ============================================================
-- The three 2027 sponsors: INVOICES and EXCLUSIVITY GRANTS.
--
-- RUN THIS AFTER the three `sponsorships` rows exist, and after migration 068.
-- Ryan creates the sponsorships himself in /admin/sponsorships; this file adds
-- the two rows each one needs that the admin screen does not create.
--
-- ⚠  WHAT IS DELIBERATELY NOT HERE: Whole Life Aftercare's Tattoo Battle
-- presentation credit. That is the first real `presentation_credits` row and the
-- first time migration 065's coalesce takes its credit branch on live data. It
-- is kept separate so that if anything goes wrong there, the failure is
-- unambiguous rather than tangled up with three invoices and three grants.
--
-- IDS ARE LOOKED UP BY NAME, not hardcoded. The rows do not exist yet, so their
-- ids cannot be known when this is written. Every lookup aborts loudly if it
-- finds nothing.
--
-- ASSERTS BEFORE AND AFTER. These are money rows: a duplicate invoice is a
-- sponsor billed twice, and an UPDATE or INSERT that quietly matches nothing is
-- the failure mode this project has hit repeatedly. Running it a second time
-- ABORTS rather than inserting again.
--
-- THE AMOUNTS ARE CROSS-CHECKED against what was entered on the sponsorship. If
-- the sponsorship says something other than the figure below, this stops and
-- says so, rather than creating an invoice that disagrees with the deal.
--
--   sponsor                      invoiced   paid via Square   balance left
--   Nomadica                     $7,500     $1,875            $5,625
--   All American Tattoo Supply   $5,000     $2,500            $2,500
--   Whole Life Aftercare         $7,500       $750            $6,750
--
-- The balance is not stored. `create-checkout` computes amount - amount_paid, so
-- recording the Square money is what leaves the portal offering the remainder.
-- ============================================================

do $$
declare
  v_event uuid;
  r       record;
  v_id    uuid;
  v_spon  uuid;
  v_amt   int;
  v_status text;
  v_before int;
  v_after  int;
begin
  v_event := (select id from public.events where is_active);
  if v_event is null then
    raise exception 'ABORT: no active event.';
  end if;

  v_before := (select count(*) from public.invoices i
                 join public.sponsorships s on s.id = i.sponsorship_id
                where s.event_id = v_event
                  and s.sponsor_name in ('Nomadica','All American Tattoo Supply','Whole Life Aftercare'));
  if v_before <> 0 then
    raise exception
      'ABORT: % invoice(s) already exist for these three sponsors. This file has already been run, or they were invoiced by hand. Creating more would bill them twice.', v_before;
  end if;

  for r in
    select * from (values
      ('Nomadica',                   750000, 187500, 'accounting_presentation'),
      ('All American Tattoo Supply', 500000, 250000, 'on_site_supplier'),
      ('Whole Life Aftercare',       750000,  75000, 'tattoo_battle')
    ) as v(sponsor_name, amount, paid, category)
  loop
    v_spon := (select id from public.sponsorships
                where event_id = v_event and sponsor_name = r.sponsor_name);
    if v_spon is null then
      raise exception
        'ABORT: no sponsorship named "%" on the active event. Create the three sponsorships in /admin/sponsorships first, with the names spelled exactly as in this file.', r.sponsor_name;
    end if;

    -- Cross-check the deal against what was entered. An invoice that disagrees
    -- with its sponsorship is a discrepancy nobody would see until someone
    -- compared two screens.
    v_amt := (select amount from public.sponsorships where id = v_spon);
    if v_amt <> r.amount then
      raise exception
        'ABORT: % is entered at % cents but this file invoices % cents. Fix one of them before continuing - do not let the invoice and the sponsorship disagree.', r.sponsor_name, v_amt, r.amount;
    end if;

    v_status := (select status from public.sponsorships where id = v_spon);
    if v_status <> 'confirmed' then
      raise notice
        'NOTE: % is status "%", not confirmed. Invoicing is fine, but placements only apply to CONFIRMED sponsorships, so it will not appear on /sponsors or the footer until it is.', r.sponsor_name, v_status;
    end if;

    -- status stays 'pending': the Square money is a DEPOSIT, not settlement.
    -- 'paid' would mean the balance is zero, and it is not.
    -- payment_reference is left NULL on purpose - the Square transaction ids are
    -- not known here, and inventing one would put a fabricated audit trail on a
    -- money row. Fill it in when the references are to hand.
    insert into public.invoices
           (sponsorship_id, amount, amount_paid, status, payment_method)
         values (v_spon, r.amount, r.paid, 'pending', 'square')
      returning id into v_id;

    insert into public.exclusivity_grants (event_id, category, buyer_name, sponsorship_id)
         values (v_event, r.category, r.sponsor_name, v_spon);

    raise notice 'Created: % invoice % cents, % paid, exclusivity %', r.sponsor_name, r.amount, r.paid, r.category;
  end loop;

  v_after := (select count(*) from public.invoices i
                join public.sponsorships s on s.id = i.sponsorship_id
               where s.event_id = v_event
                 and s.sponsor_name in ('Nomadica','All American Tattoo Supply','Whole Life Aftercare'));
  if v_after <> 3 then
    raise exception 'ABORT: expected 3 invoices after this run, found %.', v_after;
  end if;

  v_after := (select count(*) from public.exclusivity_grants
               where event_id = v_event
                 and category in ('accounting_presentation','on_site_supplier','tattoo_battle'));
  if v_after <> 3 then
    raise exception 'ABORT: expected 3 exclusivity grants after this run, found %.', v_after;
  end if;

  raise notice 'DONE: 3 invoices, 3 exclusivity grants.';
end $$;


-- ── REPORT: read this output ────────────────────────────────
-- want: 3 rows. balance_due should read 5625.00, 2500.00, 6750.00 - these are
-- the figures the sponsor portal will offer, and they are what proves the Square
-- money did not double-count.
select s.sponsor_name,
       s.status                        as sponsorship_status,
       s.tier,
       s.is_custom,
       i.amount      / 100.0           as invoiced,
       i.amount_paid / 100.0           as paid_square,
       (i.amount - i.amount_paid) / 100.0 as balance_due,
       i.payment_method,
       g.category                      as exclusivity
  from public.sponsorships s
  join public.invoices i           on i.sponsorship_id = s.id
  left join public.exclusivity_grants g on g.sponsorship_id = s.id
 where s.event_id = (select id from public.events where is_active)
   and s.sponsor_name in ('Nomadica','All American Tattoo Supply','Whole Life Aftercare')
 order by s.sponsor_name;
