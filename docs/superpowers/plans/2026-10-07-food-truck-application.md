# Public food truck application - spec and decisions

Ryan's spec and his answers to decisions 1-10 of the 2026-10-06 report,
recorded 2026-10-07 so they are not lost again. Three PRs, each based on
`develop`, each reported before it is built. Migration 091 is delivered, not
applied (Ryan runs it).

## The spec (Ryan, 2026-10-07)

- Public form at `/apply/food-truck`, linked from `/apply` and the Food Truck
  Rodeo page.
- **Required:** food truck name, contact name, phone, email, type of food,
  days attending (Fri/Sat/Sun), and an acknowledgment checkbox.
  **Optional:** logo, photos, social links, short menu description, permit
  and license uploads.
- **Pricing** from the shared food-truck pricing
  (`src/lib/food-truck-pricing.ts`): $100 for 1 day, $200 for 2, $250 for
  all 3.
- **Requirements shown on the form, covered by the acknowledgment:**
  - No power is provided. Trucks must bring their own (generator).
  - A valid health permit and business license are required. Show them at
    setup or upload them ahead of time. Not required to apply.
  - Trucks are responsible for their own inspection fees.
  - No exclusivity for a food type, but we aim for variety.
  - The Crown Complex is a Pepsi facility: trucks may not sell Coke products
    (Pepsi products or non-soda drinks only), since attendees bring rodeo
    food and drinks inside.
  - The $100 deposit holds your space but does not guarantee it. Full
    payment is due by January 1 to confirm your spot.
- **Payment:** the first payment is $100 (or the full amount if the total is
  $100 or less); balance due January 1. A truck counts as confirmed only
  when paid in full.
- **Flow:** the server route (validation, the same bot trap as the other
  forms, applications-open check) creates a pending, unpublished
  `food_trucks` row and sends a receipt to the applicant and a notice to
  `CONTACT_EMAIL`. Ryan reviews in admin (the list shows food type, days,
  status, payment) and approves. Approval creates the invoice. A truck is
  published on the rodeo page only when Ryan publishes it.
- **Cap:** an admin-editable maximum number of trucks, default 8, counting
  approved trucks including the 3 imported ones. Admin shows "X of 8
  selected".
- **Switch:** "Accepting food truck applications" on/off. When off, the page
  shows an editable "applications are closed" message instead of the form.
- The 3 imported trucks keep their existing invoices and terms.

## Decisions 1-10 (Ryan, 2026-10-07)

1. **California Taco** keeps its Square terms (25% deposit). Imported
   invoices are marked so they stay on 25%.
2. **Not paid in full by January 1:** reminders 30, 14, 7 and 1 days before;
   on January 2, an internal email listing deposit-only trucks; a red "Not
   paid in full" flag in admin; a manual Release button (unpublishes, marks
   released, frees the slot). No automatic cancellation.
3. **Approval sends the portal invite automatically**, in one "you're
   selected, set up your account to pay" email.
4. **Waitlisted and not-selected emails** are sent, with a per-truck "don't
   send" option for when Ryan would rather contact the truck directly. Copy is
   editable in the content editor.
5. **Hard stop at the cap.** Raise the cap to approve more.
6. **Switch and cap live on `/admin/food-trucks`**, stored on the event row;
   wording editable in the content editor.
7. **Food type pick-list:** BBQ, Mexican / Tacos, Burgers & American,
   Southern / Soul, Seafood, Asian, Desserts & Sweets, Coffee & Drinks, plus
   "Other: ___".
8. **Permit and license uploads in the portal:** yes, later, into private
   storage, with an admin "verified" check like artist IDs.
9. **Photos:** up to 5, 10 MB each, JPG/PNG/WebP.
10. **Day changes:** admin edits while unpaid (with #70's re-price guard).
    After payment, Ryan adjusts by hand.

## PR split (from the 2026-10-06 report)

1. **PR 1:** migration 091 + the form, the route, the emails, and admin
   review with the cap and the switch.
2. **PR 2:** the $100 deposit rule and the January 1 handling (decision 2).
3. **PR 3:** optional portal permit/license uploads with the verified check
   (decision 8).

The detailed plan for each PR is added here when it is reported.

## PR 1 plan (reported 2026-10-07, not yet approved)

**Today:** `food_trucks` has no status column and no public insert path
(no anon or owner INSERT policy; anon cannot read the table). Admin "Add"
creates the invoice at once. `events` has no switch or cap. The `/apply` hub
shows a non-link "Opening soon"; the rodeo page's CTA is a mailto.

**Migration 091 (delivered, not applied):**
- `food_trucks.status` text NOT NULL, CHECK in (pending, approved,
  waitlisted, not_selected, released); `released` is used from PR 2.
  Existing rows backfilled to `approved` (the 3 imports and any admin-added
  truck); new rows default `pending`.
- New `food_trucks` columns: `photos` text[] (max 5, storage paths),
  `acknowledged_at`, `applied_at` (NULL for admin-added), `decided_at`,
  `decision_email_opt_out` bool, `decision_email_sent_at`.
- `events.food_truck_applications_open` bool NOT NULL default false and
  `events.food_truck_cap` int NOT NULL default 8, CHECK > 0.
- Cap as a trigger, so admin Add and approval both hit it: a move into
  `approved` locks the event row, counts approved trucks for the event and
  refuses over the cap.
- A truck can be published only while `approved` (same trigger).
- The 090 staff-columns trigger also protects status, the decision columns
  and `applied_at`/`acknowledged_at`.
- `food-truck-logos` bucket limit raised from 5 MB to 10 MB (photos); the
  app still limits logos to 5 MB.
- Policies enumerated from `pg_policies` first and listed in the header;
  none are added or loosened for anon.
- `verify_091.sql`, run with `verify:local` and `--audit` before delivery.

**Public form and route:**
- `/apply/food-truck` (public, no sign-in): the spec's fields, the
  food-type pick-list with "Other", days with the live price from
  `foodTruckPrice`, the requirements list, the acknowledgment, and logo +
  photos. Closed message from the content editor when the switch is off.
- `POST /api/food-truck-apply`: bot trap (`website` honeypot +
  `elapsedMs`), validation in `src/lib/food-truck-submission.ts` (unit
  tested), open check, service-role insert (pending, unpublished, no user),
  receipt to the applicant and notice to `CONTACT_EMAIL`.
- Files go straight to Storage through signed upload URLs that the route
  issues for the new truck's folder. Vercel caps a request body at about
  4.5 MB, so 5 photos of 10 MB cannot pass through the route.
- Links from `/apply` (replacing "Opening soon") and the rodeo page CTA.

**Admin (`/admin/food-trucks`):**
- Switch and cap editor (event row), "X of 8 selected", status column and
  filter, applicant details (photos, acknowledgment, applied date).
- Approve / Waitlist / Not selected through an admin route. Approve creates
  the invoice from `foodTruckPrice` and sends one "you're selected, set up
  your account to pay" email carrying the Invite & link invitation
  (decision 3). Waitlist and Not selected send their email unless the
  per-truck "don't send" box is ticked (decision 4).
- Email copy, form intro, requirements and closed message live in a new
  content-editor page.


## PR 2 decisions (Ryan, 2026-10-08)

1. Trucks added by admin after PR 2 ships use the $100 rule too.
2. The 3 imported trucks get the 30/14/7/1 reminders; their balance is due January 1.
3. Release cancels the invoice. Payments already made stay on record; the
   deposit is not refunded (it holds the space but does not guarantee it).
   A refund is a manual exception.
4. No email on release; Ryan contacts the truck.
5. Reminder wording lives in the content editor, like the decision emails.

Built as migration 092 (`invoices.deposit_rule`, 14/1-day reminder columns,
`events.food_truck_unpaid_report_sent_at`); details in
docs/handoff/sessions/2026-10-08-food-truck-deposit-and-due.md.
