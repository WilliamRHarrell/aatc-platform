# Session 2026-09-29: mobile header (branch fix/mobile-nav)

## Cause
`PublicNav` had no small-screen layout. The wordmark, 2 links, 5 dropdowns
and My AATC sat in one flex row about 618px wide, with no breakpoint. At
360-430px the document measured 618px wide on every page, so the whole page
scrolled sideways, and Events, Event Info, Artists & Vendors and Sponsors
were off screen. The fixed hero background was stretched to 618px as a
result of the same overflow.

## Fix
- Below md (768px) the bar shows the wordmark, My AATC (when signed in) and
  a 44x44 menu toggle with aria-expanded and aria-controls. The menu is a
  full-width panel: Home and Vote, then each dropdown as a group that expands
  in place. The group holding the current page starts expanded. The panel
  scrolls inside itself when it is taller than the screen.
- The menu closes on a new page (it remembers the path it was opened on), on
  a same-page link (/tickets#friday), and on Escape.
- At md and up, the desktop row and its dropdowns are unchanged.
- The active-state rules (linkActive, groupActive) are shared by the desktop
  row and the phone menu.
- Out of scope: the portal header (portal/layout.tsx) wraps onto more lines
  instead of overflowing. The auth pages have no header.

## Checks (local build, headless Chrome with phone emulation)
- Overflow at 360, 390 and 430px on 14 pages (/, /tickets,
  /info/policies, /info/directions, /directory, /directory/artists,
  /events/schedule, /events/tattoo-contests, /events/pinup-contest,
  /tattoo-battle, /sponsors, /sponsors/packages, /apply, /apply/sponsor):
  42/42 with the document as wide as the screen and no header control off
  screen. Before the fix: document 618px on every page.
- Menu driven by touch at 360, 390 and 430px, 13/13 checks at each width:
  toggle opens it, every group expands with no link off screen, the menu
  fits the screen, Escape closes it, a same-page link and a link to another
  page close it, and at 1024px the desktop row shows with no toggle.
- Signed in: a throwaway local build forced the signed-in state (reverted,
  never committed). My AATC stays in the bar and links to /portal; at 360px
  it ends 8px before the toggle, and nothing overflows.
- `npm run build` passes; `npm test` 206/206.
