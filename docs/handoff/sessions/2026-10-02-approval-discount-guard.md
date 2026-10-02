# Session 2026-10-02: approval discount safeguard (branch feat/approval-discount-guard)

Chop Shop Tattoo (c6cfee7f) was approved with a $2,425 discount on a $2,650
list price, leaving a $225 invoice. Ryan confirmed it was intended
(2026-10-02) and asked for a safeguard.

- The approval drawer now always shows **"Invoice on approval"** above the
  buttons: the invoice amount, plus list price − discount and the % off when
  a discount is entered. Before, the total showed only while the discount box
  was ticked.
- **A discount over 50% of the list price** needs a second click. The first
  click shows "This discount is N% of the list price: the invoice will be $X
  instead of $Y", and the button becomes "Approve at $X (N% off)". The
  acknowledgement is tied to that exact amount, so editing the discount asks
  again.
- When the discount reaches the list price ($0 invoice), the warning points at
  Comp.
- `discountSummary()` and `LARGE_DISCOUNT_SHARE` in src/lib/comp.ts, tested
  (Chop Shop's numbers, the 50% boundary, no discount, a discount over the
  list price).

Checks: build passes; `npm test` passes. Not clicked through in the browser:
the drawer needs an admin session against the production database.
