# Session 2026-09-29: Dating Game page times from the schedule (branch fix/dating-game-times)

/events/dating-game typed "Saturday, April 17 at 6:00 PM" by hand. The
published schedule (read 2026-09-29) has two Tattoo Dating Game rows:
Friday 2027-04-16 18:00 (Main Stage) and Saturday 2027-04-17 17:30 (no
location set). So the page's Saturday time was wrong, and Friday was
missing.

- `scheduleSlots(re, schedule)` in src/lib/homepage-content.ts returns every
  matching published row. The homepage cards (`cardWhen`) and this page both
  use it. The title pattern is `DATING_GAME_TITLE`, one constant for both.
- The page is now a server component. The "When" card lists every row
  ("Friday, April 16 at 6:00 PM", "Saturday, April 17 at 5:30 PM"). With no
  published rows the card is not shown, rather than a stale time. The page
  refreshes every 60 s, like the schedule cache.
- The intro said "...to the main stage on Saturday evening". "on Saturday
  evening" is removed, because the schedule now has Friday too.

Left as they were:
- "Where: Main Stage" (the Saturday row has no location).
- The two sign-up lines, "Friday & Saturday starting at 1:00 PM". Sign-up is
  not a schedule row.

Checks: build passes; `npm test` 224/224 (scheduleSlots, plus the page
typing no day or time). Local build: the page shows both rows, the homepage
card still reads "Fri 6:00 PM · Sat 5:30 PM", and the render check passes.
