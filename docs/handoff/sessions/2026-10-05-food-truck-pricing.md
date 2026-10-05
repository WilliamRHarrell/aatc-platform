# Session 2026-10-05: food truck pricing (branch feat/food-truck-pricing)

Ryan, 2026-10-05: food trucks are $100 for 1 day, $200 for 2 days, $250 for
the full weekend. They were $60 / $120 / $160.

- **One home:** `src/lib/food-truck-pricing.ts` (`FOOD_TRUCK_PRICE_BY_DAYS`,
  `foodTruckPrice`). The admin food-trucks page had its own map, and now
  reads this one for the new-truck invoice, the day-change re-price and the
  form's price line. The price line shows "select days" with none selected
  instead of throwing.
- **Reconcile block G** repeats the prices in SQL. Both case expressions are
  now $100/$200/$250, and `food-truck-pricing.test.ts` fails if they differ
  from the TS map.
- **Existing invoices are not changed.** The three Square-imported trucks
  keep $250 and are skipped by block G and the re-price guard (#70).
- **Where the price lives, checked 2026-10-05:** only the admin page (now
  the shared file) and block G. There is no food truck application form, no
  database price check and no public copy with a price; the Stripe checkout
  names the item only.

Checks: build passes; `npm test` 261/261.
