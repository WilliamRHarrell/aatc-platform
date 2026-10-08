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
