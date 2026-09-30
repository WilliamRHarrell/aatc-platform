# Session 2026-09-29: /directory/[id] Event card from event-config (branch fix/directory-event-card)

The sidebar "Event" card on each exhibitor page typed the show name, year,
dates and venue by hand ("All American Tattoo Convention 2027", "April 16-18,
2027 · Crown Complex Event Center · Fayetteville, NC"). Found by the #45
render-check. It now reads EVENT_NAME, EVENT_YEAR, EVENT_DATES_LABEL,
VENUE_NAME, VENUE_CITY and VENUE_STATE, the same way the homepage builds
that line (src/app/page.tsx).

The rendered text is unchanged: read from a local build on 2026-09-29 for
13c265d7. `src/lib/directory-event-card.test.ts` fails on the old file and
passes on the new one; it fails if a year, date or venue is typed into the
page again. `npm run build` passes; `npm test` passes 208/208.
