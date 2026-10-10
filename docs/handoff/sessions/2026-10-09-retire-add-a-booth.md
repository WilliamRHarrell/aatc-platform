# 2026-10-09 - Add A Booth retired

Ryan's decision d (plan 2026-10-09-application-editor-and-vip.md), after
the editor live tests passed (PR 2 #100, PR 3 #102, 097 fix #103).

- /admin/booths: the Add A Booth button, modal and insert code are gone.
  The header button is now "New application" (/admin/applications/new).
  A deposit taken in person is recorded in /admin/invoices (Record payment),
  which sets the deposit milestone (paymentUpdate).
- `newInvoicePayment()` (#96, used only by Add A Booth) removed with its
  tests.

No migration. `npm test` 367 passed, `npm run build` passed.
