# Session 2026-10-03: comp split, permit submission date (branch feat/comp-split)

Ryan's decisions (2026-10-02/03):
- "Comp booth" waives booth fees but still charges artist permit fees;
  "Comp permits" waives the permit fees too. Each is set separately.
- A booth comp that owes permits follows the normal billing rules, gets
  reminders, and is never expired or cancelled.
- Comp booth counts as secured for Assign Booth, the directory and Submit
  Graphics.
- Artist changes are free through Feb 28, 11:59 PM Eastern, and $50 from
  March 1, stored as events.permit_submission_date.

## Delivered, not applied: migration 089 + verify_089
**Apply 089, then run verify_089.sql, before merging.** The 072 functions
remain as wrappers, so the deployed drawer keeps working in between.

- **Columns:** `applications.permits_comped_at/by` (new). `comped_at` keeps
  its column and now means COMP BOOTH. `events.permit_submission_date`, set
  to 2027-03-01 for the 2027 event.
- **Comp columns staff-only** through a separate trigger
  (`applications_protect_comp_columns_trg`), not by copying 079's clamp.
- **`application_permit_fees(app)`** = list price minus the list price with
  no artists, so the permit rule has one home (application_list_price, 088).
- **`set_comp(app, booth, permits)`:** admin only, one transaction, refused
  once anything is paid or with two invoices (072's rules).
  - The invoice becomes (booth comped ? 0 : total − permits) + (permits
    comped ? 0 : permits).
  - A $0 result settles the invoice and clears due dates; a positive result
    is pending with no milestones (the drawer sets due dates if missing).
  - comp_application / uncomp_application now wrap it (everything /
    nothing).
- **Directory:** the `applications_public` view and booth_publicly_visible()
  count `comped_at` as secured. The view also strips
  artists[].id_verified_at / id_verified_by (088), which would otherwise
  have published the verifying admin's user id. No artist was verified yet.
- **Mapping, no invoice changes, status-independent:**

  | Application | Mapped to | Invoice |
  |---|---|---|
  | comped artist rows (Jane Ink) | also permits comped | $0 |
  | comped vendors (Skin Reserve, Pinback) | booth comp only | $0 |
  | Chop Shop | booth comped, only if its invoice still reads $200.00 unpaid | $200 |

**Local runs (verify:local):**
- verify_089 A + B1-B11 pass, and 086/087/088 + the matrix pass on top.
  `--audit` reports 0 missing.
- **Mapping test** (`--before 089` with copies of the 4 real rows, Jane and
  Pinback pending): Jane booth+permits $0, Skin and Pinback booth $0, Chop
  Shop booth $200 pending with its due dates kept, and the event date set.
  Files are in supabase/verify/local/.
- **Negative control:** 089 without the comp clause in the view fails B10.
- New harness option: `--before NNN`.

## App
- **`src/lib/comp.ts`:** `permitFeesFor`, `compInvoiceAmount` (mirrors
  set_comp), `hasAnyComp`, `owesNothing`.
  - approvePayload gives no due dates only when the comp leaves $0.
  - partitionAssignable counts a comped booth as secured.
  - Tested with the real rows' numbers.
- **CompControls:** separate Booth and Artist permits rows (the permits row
  only when there are permit fees), through set_comp. It shows the
  resulting invoice and sets due dates for a positive balance on an
  approved application.
- **Drawer:** "comped" means any comp. A booth comp owing permits with no
  invoice gets one at approval.
- **Cron:** the deposit and final reminder branches (live and dry run) no
  longer exclude comps; fully comped invoices are settled, so they are
  excluded anyway. Expiry and cancellation still exclude every comped booth.
- **Emails:**
  - approval: "comped" only when $0 is owed; a booth comp owing permits gets
    the priced email for the permit fees, without the "booth released"
    sentence;
  - the comp notice has a permits-due version.
- **Directory:** the listing helper and drawer line ("Listed: booth
  comped"), the funnel's no-deposit bucket (override or comp), and the COMP
  badge tooltip.

## Send back to pending and booths (answered, not changed)
SEND_BACK_PAYLOAD changes only the application (status, approved_at, due
dates). Booths stay assigned and reserved, and they are hidden from the
public because approval is required. assign_booths refuses non-approved
applications, including the empty "release all" call, so a pending
application's booths cannot be changed until it is re-approved. No booth was
assigned on 2026-10-03. A fix was proposed to Ryan.

Checks: `npm run build` passes; `npm test` 249/249.
