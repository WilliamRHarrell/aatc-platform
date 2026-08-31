-- ============================================================
-- RECONCILIATION: approved applications with no invoice
--
-- READ ONLY. Changes nothing. Safe to run at any time, and worth running
-- periodically rather than once - this is the shape of problem that accumulates
-- quietly.
--
-- WHY IT EXISTS: the invoice insert on the approve path in
-- /admin/applications was unguarded until 723aa82. A silently failed insert
-- left an application APPROVED with no invoice - not flagged anywhere, not in
-- any queue, simply never billed. At $500 to $1,200 a booth that is real money
-- with nothing surfacing it.
--
-- ⚠  READ BLOCK A BEFORE BELIEVING BLOCK B.
--
-- Why this file leads with a control when a verify script could get away with
-- an ordinary assertion: THIS QUERY WILL BE RUN AGAIN, next year, against a
-- full table, by someone who reads the result as fact and acts on it. A verify
-- script that goes vacuous is caught by the next developer to read it. A
-- reconciliation that goes vacuous produces a NUMBER, and a number gets
-- believed. Leading with the control keeps it honest at both points in time.
-- On 2026-08-31 this returned ZERO - but `applications` was EMPTY, cleared by
-- the pre-cutover teardown. Zero out of zero is not a clean bill of health, it
-- is an absence of evidence, and the two are easy to confuse in a report that
-- says only '0 rows'. Block A is the control.
-- ============================================================

-- ── A. CONTROL: is there anything to reconcile?
--    want: approved > 0. If approved = 0, block B is VACUOUS - it will return
--    no rows whether the bug exists or not, and proves nothing either way.
select
  count(*)                                            as applications_total,
  count(*) filter (where status = 'approved')         as approved,
  count(*) filter (where status = 'pending')          as pending,
  (select count(*) from public.invoices)              as invoices_total
from public.applications;

-- ── B. THE RECONCILIATION
--    want: 0 rows, PROVIDED block A showed approved > 0.
--    Each row here is an approved exhibitor who was never invoiced.
select a.id            as application_id,
       a.business_name,
       a.email,
       a.exhibitor_type,
       a.total_amount  as owed_cents,
       a.approved_at
  from public.applications a
  left join public.invoices i on i.application_id = a.id
 where a.status = 'approved'
   and i.id is null
 order by a.approved_at nulls last;

-- ── C. The mirror: invoices with no application AND no sponsorship
--    want: 0 rows. An invoice attached to nothing cannot be chased or reported.
--    Invoices legitimately attach to EITHER an application or a sponsorship, so
--    both must be null for a row to be genuinely orphaned.
select i.id, i.amount, i.status, i.created_at
  from public.invoices i
 where i.application_id is null
   and i.sponsorship_id is null
 order by i.created_at;

-- ── D. Sponsorship invoices, for context rather than as a check
--    Confirmed sponsorships with no invoice are the same failure on the other
--    side of the house. Not necessarily wrong - an in-kind or trade sponsor has
--    nothing to bill - so this one is READ, not asserted.
select s.id, s.sponsor_name, s.tier, s.status, s.amount, s.is_in_kind,
       (i.id is not null) as has_invoice
  from public.sponsorships s
  left join public.invoices i on i.sponsorship_id = s.id
 where s.status = 'confirmed'
 order by s.sponsor_name;

-- ============================================================
-- PART 2: the other three insert-never-happened paths, plus what can and
-- cannot be known about payments.
--
-- Added after the invoices guard pass. Blocks E through G are the same shape as
-- B - a write that could silently not happen, with a financial consequence and
-- nothing surfacing it. Same control-first structure: read the population
-- before believing the finding.
-- ============================================================

-- ── E. CONTROL for F and G: population of the food truck side
--    want: food_trucks > 0. If it is 0, F and G are vacuous.
select
  (select count(*) from public.food_trucks)                                as food_trucks_total,
  (select count(*) from public.food_trucks where is_published)             as published,
  (select count(*) from public.invoices where food_truck_id is not null)   as food_truck_invoices;

-- ── F. Food trucks with no invoice
--    want: 0 rows, PROVIDED E showed food_trucks > 0.
--    Same gap as the approve path and the bulk booth create: the truck exists,
--    was never invoiced, and appears in no queue.
select t.id, t.business_name, t.email, t.days, t.created_at
  from public.food_trucks t
  left join public.invoices i on i.food_truck_id = t.id
 where i.id is null
 order by t.created_at;

-- ── G. Food truck invoices whose amount disagrees with the day count
--    want: 0 rows.
--    THE ONE WORTH HAVING. The other checks find a MISSING row, which is at
--    least a visible absence. This finds a WRONG NUMBER on a row that exists
--    and looks entirely normal - the truck changed from 2 days to 3, the
--    invoice update silently affected zero rows, and it is billed for 2. No
--    other query surfaces it and nobody notices until the money is short.
--
--    ⚠  The mapping below duplicates PRICING in
--    src/app/admin/food-trucks/page.tsx. If the prices change there, change
--    them here. This is a known duplication, called out rather than hidden.
--
--    AND KNOW HOW IT FAILS: if PRICING changes and this does not, block G does
--    not go quiet - it goes CONFIDENTLY WRONG. Every correctly-priced truck
--    starts reporting as a mismatch, and the query that exists to find billing
--    errors becomes the thing generating them. A reconciliation nobody trusts
--    gets ignored, which is worse than not having one.
select t.id,
       t.business_name,
       array_length(t.days, 1)          as day_count,
       i.amount                         as invoiced_cents,
       case array_length(t.days, 1)
         when 1 then 6000
         when 2 then 12000
         when 3 then 16000
       end                              as expected_cents,
       i.status,
       i.amount_paid
  from public.food_trucks t
  join public.invoices i on i.food_truck_id = t.id
 where i.amount is distinct from (
         case array_length(t.days, 1)
           when 1 then 6000
           when 2 then 12000
           when 3 then 16000
         end)
 order by t.business_name;

-- ── H. Invoice rows that contradict themselves
--    want: 0 rows. These do not prove a payment was mis-recorded, but each is a
--    state no correct sequence of operations produces.
select id,
       amount, amount_paid, status, paid_at,
       case
         when status = 'paid' and amount_paid < amount        then 'marked paid but underpaid'
         when status <> 'paid' and amount_paid >= amount and amount > 0
                                                              then 'fully paid but not marked paid'
         when paid_at is not null and status <> 'paid'        then 'has paid_at but is not paid'
         when amount_paid > amount                            then 'overpaid'
       end as problem
  from public.invoices
 where (status = 'paid' and amount_paid < amount)
    or (status <> 'paid' and amount_paid >= amount and amount > 0)
    or (paid_at is not null and status <> 'paid')
    or (amount_paid > amount)
 order by id;

-- ── I. WHAT CANNOT BE CHECKED, stated so nobody assumes otherwise
--
-- There is NO payments table. Not missing from this file - it does not exist in
-- the schema. `invoices.amount_paid` is a running total mutated in place by
-- /admin/invoices, so a payment is not an event that was recorded, it is an
-- increment that was applied.
--
-- The consequence: A MANUAL PAYMENT THAT FAILED TO RECORD IS UNDETECTABLE HERE.
-- If recordPayment silently affected zero rows, amount_paid was never
-- incremented and there is no row, log or column anywhere saying a payment was
-- attempted. Block H finds invoices that contradict THEMSELVES; it cannot find
-- an invoice that is simply, quietly, short. The only record of that payment is
-- the cash in the box and whatever the exhibitor remembers.
--
-- What CAN be reconciled externally: Stripe payments. Those carry
-- stripe_payment_intent_id, so the rows below can be checked against the Stripe
-- dashboard. Cash and card-at-the-booth payments cannot.
--
-- want: read, not asserted. Every paid invoice either has a Stripe id (check it
-- against Stripe) or does not (manual - unverifiable after the fact).
select id, amount, amount_paid, status, paid_at,
       (stripe_payment_intent_id is not null) as stripe_backed,
       case when stripe_payment_intent_id is null then 'manual - no external record'
            else 'reconcilable against Stripe' end as verifiability
  from public.invoices
 where amount_paid > 0 or status = 'paid'
 order by paid_at nulls last;
