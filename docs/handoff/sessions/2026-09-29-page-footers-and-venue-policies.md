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

**Build and render-check (2026-09-29, after the disk was cleared):** `npm run
build` passes (prebuild guards included), `npm test` 201/201. Render-check of
every public route on a local `next start` with headless Chrome (39 routes:
every page in the build output except /admin/*, /api/*, /auth/callback,
/robots.txt; /directory/[id] with 13c265d7, /tattoo-battle/entry/1; /admin,
/portal/* and /apply/artist|vendor redirect to /auth/login and were checked
there): every page has exactly one `<footer>` (SiteFooter), the sponsor
section directly before it, nothing visible after it, and no "All rights
reserved" in page content. Three flags, none a footer:
- `/` - "April 16-18, 2027 · Crown Complex Event Center" is the hero line.
- `/directory/[id]` - the sidebar "Event" card. Content, not a footer, but it
  hardcodes the dates and venue (one-home-per-fact follow-up, not this PR).
- `/floorplan` - an empty `<div />` stub since the initial setup, linked from
  nothing; sponsor section and footer render correctly under it.

## Domain
Retracted: an earlier note here said www returned Vercel NOT_FOUND. Ryan
(2026-09-29): it loads in a browser (holding page on aatc-landing); the
NOT_FOUND was this environment. Domains are Ryan's; nothing to do here.

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
