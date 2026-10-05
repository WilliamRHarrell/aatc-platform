# Session 2026-10-05: Square invoice import generator, food-truck re-price guard (branch feat/square-import-generator)

Import of the 2027 exhibitors invoiced in Square. **The data never enters the
repo.** The sheet stays in ~/Downloads; the overrides and the generated SQL
live in `supabase/.imports/` (gitignored by this PR).

## Generator: scripts/import-square-2027.mjs (no customer data)
`node scripts/import-square-2027.mjs <csv> <overrides.json>` writes
square-2027-import.sql, square-2027-teardown.sql and square-2027-dry-run.txt.

- **Input:** header on line 4; only rows marked "import"; the totals row is
  ignored.
- **Refuses to generate** when a name is still unresolved ("?", "(...)",
  "confirm"), an email is missing or repeated, paid + balance != invoiced,
  the payments do not add up to Paid, an add-on is unknown, or permits
  exceed 2 per single / 4 per double.
- **Ryan's answers (2026-10-05) are in the gitignored overrides:** names
  (Nine Toes, Henna Warrior, Wes Flanary, Dubee Tattoos +
  @doubious_tattooer), business name as contact for Simply Coffee and
  Orebro, veterans (Henna Warrior, Rhino's), Prodigy's 20% deposit honoured
  on 2026-04-27, booth 126 assigned to Palacios.
- **Records:**
  - applications: admin-created (user_id null), approved (approved_at =
    issue date), total = invoiced (grandfathered), needs_roster = true,
    add-ons mapped to our kinds, Prodigy as one application with an artist
    single and a vendor single;
  - food trucks: all three days, unpublished;
  - one invoice each: payment_method 'square' when paid, and
    payment_reference "Square #N · every payment (date, method, amount)".
- **Milestones** use the existing rule (deposit at 25% rounded up, final at
  100%), dated by the actual payments.
- **Due dates:** unpaid deposits due 2026-11-01; every balance due
  2027-01-01 (invoice due_date; application final_due_at =
  FINAL_DUE_AT). The sweep treats them normally from there.
- **The import** is one transaction. It aborts if any email already exists
  (application, food truck, sponsorship), an invoice for these Square
  numbers exists, booth 126 is not free, or the totals do not match.
  It sends no email.
- **The teardown** deletes exactly the generated ids. It refuses if a
  payment or amount changed, a portal account was linked, or a comp was set.

**Dry run of the real sheet (2026-10-05):** 15 rows (12 applications, 3
food trucks), invoiced $10,230.00, paid $2,382.50, matching the sheet's
totals row. No duplicates by email or name against production. Booth 126
was unassigned.

**verify:local on the real generated files:**
- the import passes, and every check passes: totals, milestones, booth 126,
  veterans, add-ons, and the sweep as of today (nothing would expire or
  cancel; the 5 unpaid applications are due 2026-11-01);
- a second import aborts (already on the site);
- the teardown refuses after a recorded payment, then tears down exactly
  the 15 rows and releases booth 126, leaving other rows untouched.

Generator unit tests use a made-up sheet (src/lib/import-square.test.ts).

## Food-truck re-price guard
- admin/food-trucks re-priced a pending invoice to the day-based PRICING
  whenever days changed. It now does so only when the invoice is pending,
  has nothing paid, and is not a Square import (`truckInvoiceRepriceable`,
  tested); otherwise it says why the amount stayed.
- reconcile_approved_without_invoice.sql block G skips Square imports
  ($250 grandfathered).

## Follow-ups (Ryan)
- Food-truck pricing: $250 for the full weekend. Report sent; 1-day and
  2-day prices to be decided. Separate PR.
- Food-truck portal access: Invite & link supports applications and
  sponsorships only. Small PR after the import.
- Before inviting: cancel the open Square invoices. Portal Pay works as
  normal.

Checks: build passes; `npm test` 258/258; `--audit` 0 missing.
