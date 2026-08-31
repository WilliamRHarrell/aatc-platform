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
