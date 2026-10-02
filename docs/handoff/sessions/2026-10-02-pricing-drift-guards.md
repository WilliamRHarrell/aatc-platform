# Session 2026-10-02: pricing drift guards (branch fix/pricing-drift-guards)

Context: a permit-fee increase to $75 was reported and then **cancelled**
(Ryan, 2026-10-02): the permit stays **$50**, because the increase does not
apply to temporary permits. No migration, and PERMIT_FEE_PER_ARTIST is
unchanged. The audit for it found drift risks; this PR fixes them.

- **ArtistApplyForm:** the per-artist permit line multiplied by a typed
  `5000` next to a label read from PERMIT_FEE_PER_ARTIST. It now uses the
  constant.
- **`legacyPriceFor()` deleted:** 2026 prices, no callers.
- **Drift guard (pricing-matrix.test.ts):** it reads the **latest migration
  that defines application_list_price** and compares every constant
  (booths, corner, permit, veteran) and every add-on price with the exports
  of pricing.ts. Before, it compared 079 with typed numbers. ADDON_PRICES is
  now exported for this.
- **New `apply-form-prices.test.ts`:** fails if any price appears in an apply
  form as a typed cents value or a "$NN" string.
- **List-price refusal:** when the database refuses a total because it is not
  the list price (079), both forms now say "Prices changed since this page
  was opened. Reload the page..." instead of the generic retry message, which
  could never succeed from the same tab.
- **Negative controls:** putting the typed 5000 back fails the form test; a
  temporary migration with c_permit 7500 fails the drift guard.

Checks: `npm run build` passes; `npm test` 233/233. No SQL changed; the
verify_079 matrix is unchanged.
