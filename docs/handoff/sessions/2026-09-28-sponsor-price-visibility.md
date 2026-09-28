# Session 2026-09-28: sponsor price visibility (084)

**Delivered.** Branch `feat/sponsor-price-visibility`. Migration **084** and
`verify_084.sql`, delivered, not applied.

**Decisions (Ryan, 2026-09-28):** packages (Title, Platinum, Gold, Silver,
Brass) hide their price by default; items (Collectible Coin, Rafter Banner,
VIP Bag, Collector's Choice, Artist Lounge) show it. An application with a
hidden package lists each selection, the package reads "We'll follow up with
pricing", and there is no total. The Sold badge stays.

- `sponsor_tier_settings` (084): one `show_price` flag per tier. Anyone
  reads; admin and sponsorship_manager update. Seeded with the defaults above
  (`on conflict do nothing`). A tier with no row, or a failed read, is hidden.
- The list prices moved out of `sponsor-tiers.ts` (which the browser loads)
  into `src/lib/sponsor-prices.ts` (server only). Before this, every price was
  in the public JavaScript of /apply/sponsor, /sponsors/packages and
  /admin/sponsorships whether it was displayed or not.
  `sponsor-prices.test.ts` fails if any client component reaches that file.
- /sponsors/packages and /apply/sponsor are server pages that pass the client
  only the shown tiers' prices. Wording in the content editor under "Sponsor
  pricing wording": "Contact us for pricing", "We'll follow up with pricing".
- The application still records the list price as `amount`. The receipt
  email shows only shown prices; the internal notice to CONTACT_EMAIL shows
  the list price. The portal shows an amount only from the invoice.
- /admin/sponsorships: a Price visibility panel (toggle per tier). The page
  gets prices from `/api/admin/sponsor-pricing`.

**Checked:** a production build's browser chunks contain no price table and
no package figure; the rendered /sponsors/packages and /apply/sponsor contain
no dollar figure or amount (084 absent, so every tier read hidden). No
JSON-LD on the site; OG and description text carry no prices;
`sponsors_public` has no amount column; `sponsor_tier_counts` returns counts
only; anon cannot select `sponsorships` (probe, 2026-09-28).

**Order:** apply 084, run verify_084, THEN merge. Merged first, every price
(items too) reads hidden until 084 exists, and the admin panel shows an error.

**Not changed, on purpose:**
- Approving a sponsor creates the invoice from the row's amount and emails
  it. Set the final amount before approving, or the invoice is the list price.
- A sponsor linked to their account can read their own row, amount included,
  through the API. That is their own application's list price. Hiding it
  would mean column-level grants on `sponsorships`, which the admin page also
  reads.
