# Session 2026-09-29: Crown Complex venue policies on /info/policies (branch feat/venue-policies)

Spec: Ryan, 2026-09-29, recorded in `2026-09-29-page-footers-and-venue-policies.md` (on PR #45).

## What changed
- /info/policies is now a server component. A new section at the top, "Crown
  Complex Venue Policies", renders four cards in this order: Clear Bags Only,
  Food and Drinks, Re-Entry and Wristbands, Also at the Crown (weapons,
  smoke-free, service animals). Every heading and body can be edited at
  /admin/content under "Policies (/info/policies)" (registry key `policies`).
  page_content has no rows yet, so the registry defaults are the live copy.
- The text is our own summary. The intro says the Crown sets the rules and can
  change them, and a link after it goes to the Crown's page. That URL is
  `VENUE_POLICIES_URL` in event-config.
- Each rule is now stated once. The General Rules cards Weapons, Re-Entry,
  Pets & Service Animals and Smoking were removed, and the venue section
  states those rules instead. What those cards said was kept where it agreed
  with the Crown's rules: the medieval combat performer exception, and ADA
  service animals only (leashed, no ESAs or pets). One sentence was dropped:
  "Designated outdoor smoking areas are clearly marked near the entrance".
  It sits badly with the Crown's 25-foot smoke-free rule, and nobody has
  confirmed that such areas exist.
- The page's two hand-typed contact addresses now read `CONTACT_EMAIL`.
- `/info/policies` was added to PAGE_ROUTE and the revalidate allow-list, so
  saving in the editor purges the page.

## Checks
`npm run build` passes. `npm test` passes 206/206, including new registry
tests for the keys, the card order, the official link, and that General Rules
no longer repeats these rules. The render check on /info/policies passes
(content, then sponsors, then one footer), and the page was checked at 1280px
and 390px.

## Not done: the short version for /tickets and the ticket email
This covers bags, Pepsi-only drinks and wristband re-entry. The wording was
sent to Ryan for approval (2026-09-29) and will not be added until approved.
