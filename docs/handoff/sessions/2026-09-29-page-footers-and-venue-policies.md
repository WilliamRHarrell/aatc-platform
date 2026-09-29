# Session 2026-09-29: leftover page footers; Crown venue policies (queued)

## 1. "New footer missing on /directory" - found and fixed (branch fix/page-level-footers)

The new footer WAS on /directory and /directory/artists (production DOM,
headless Chrome, 2026-09-29: sponsor section, then the site footer at the
bottom). But four pages still had their own pre-#37 page-level `<footer>`
INSIDE the page content, above the sponsor section: "ALL AMERICAN TATTOO
CONVENTION / Crown Complex Event Center · Fayetteville, NC" (/apply also had
"© 2027 ... All rights reserved"). The directory page content fills at least
a screen, so that block sits where a page normally ends and reads as the
footer; the real one is below the sponsors.

Removed from: /apply, /contests, /directory, /directory/artists. Also removed
the /apply registry keys footer_name, footer_location (no page_content rows,
checked 2026-09-29). `git grep "<footer" src/app` now finds none.

**Not yet done (disk full, 154 MB free):** local build and the render-check of
every public route (order: content -> sponsor section -> site footer, exactly
one <footer>, nothing footer-like in page content). The draft PR's Vercel
preview build is the build check. Next session: run the render-check
(scratchpad cdp-probe2.mjs pattern: list every <footer> with its text and
whether it follows the sponsor section) on the preview or a local build.

## Domain
www.allamericantattooconvention.com returns Vercel NOT_FOUND on every path
(apex 308s to it); the site answers at aatc-platform.vercel.app. Expected if
the domain cutover is still pending (docs/CUTOVER.md); otherwise the domain is
not attached to this Vercel project.

## 2. QUEUED: /info/policies "Crown Complex Venue Policies" (Ryan, 2026-09-29)

Editable in the page-content registry. Our own words (do not copy the Crown's
text); link https://www.crowncomplexnc.com/visit/venue-policies as the official
source and say the Crown's rules can change. Order: bags, drinks, re-entry
first.
- Clear bags (in effect for AATC: we use the whole Expo Center, including the
  ballroom and the Artist Lounge on the upper deck overlooking the Coliseum).
  Allowed: clear plastic/vinyl/PVC bags up to 12" x 6" x 12"; one-gallon clear
  freezer bags; small clutches up to about 4.5" x 6.5"; medically necessary
  items after inspection. Not allowed: backpacks, fanny packs, drawstring
  bags, purses larger than a clutch, briefcases, luggage, laptop and camera
  bags. All bags may be searched.
- Food and drinks: the Crown normally bans outside food, but AATC holds the
  food truck rights, so Food Truck Rodeo food may come inside. Pepsi facility:
  no Coke or other non-Pepsi drinks inside, even if bought at the rodeo.
- Re-entry: in and out all day with that day's wristband; another day needs
  that day's wristband, or a weekend or VIP wristband. Wristbands are not
  replaced if broken, damaged or removed.
- Also: no weapons of any kind (including pocketknives); smoke- and
  tobacco-free, including within 25 feet of entrances; service animals only.

Then PROPOSE (show Ryan the wording before adding) a short version (bags,
Pepsi-only drinks, wristband re-entry) for /tickets and the ticket
confirmation email.
