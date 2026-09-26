# Session 2026-09-26: panel capacity (migration 080)

**Delivered, NOT APPLIED.** Branch `feat/panel-capacity-cap`.

- Decision (Ryan, 2026-09-26): option A (paid panels capped with a row lock
  and Stripe-expiry seat holds) plus a per-panel **hard cap** that enforces
  capacity on free panels too. Full = refused, not waitlisted. Free panels
  without hard cap stay ungated. Recorded in CUTOVER "Panel capacity".
- 080: `panels.hard_cap` (+ check: needs max_capacity; max_capacity > 0),
  `panel_registrations.hold_expires_at`, `panel_seats_taken()` (the one
  counting rule), `panel_seats_remaining()` (anon; NULL unless enforced),
  `register_panel_seat()` (service role; locks the panel row, NULL = full).
- `/api/panel-register` uses it for both types. Paid: Checkout expires at 31
  minutes, hold at 36; a failed Stripe call releases the seat at once.
- /admin/panels: hard-cap checkbox (free panels), "X of Y seats taken ·
  CAPPED" for enforced panels. Public page: "N spots left" / "Full" / "Sold
  out" on enforced panels only.
- verify_073's anon allow-list gains `panel_seats_remaining`.

**Order:** merge, apply 080, paste verify_080.sql, re-run verify_073.sql.

**Tooth Gem, after that (Ryan, in /admin/panels):** price $400, signup type
"AATC invoice", room seats 50. A paid panel with a size is capped
automatically; the hard-cap checkbox is only for free panels.

**Not done:** the Stripe webhook still marks a registration paid even if its
hold had expired and the seat was resold (possible only if payment completes
in the last seconds and the webhook is more than 5 minutes late); it pays
and logs nothing extra. `function-grants.test.ts` only reads files named
`NNN_*.sql`, so a `079b_`-style name is invisible to it.
