# Session 2026-09-28: homepage event cards read days and times from the schedule

**Delivered.** Branch `feat/home-card-times`. No migration.

Ryan (2026-09-28): the Tattoo Battle, Pin-Up, Dating Game and Strongest at the
Sideshow cards (and Best in Show, from #40) take their day and time from
schedule_items; the copy stays hand-written. `HomeEvent.scheduleTitle` (a
title pattern) + `cardWhen()` in src/lib/homepage-content.ts: every published
matching row, "Fri 6:00 PM · Sat 6:00 PM"; no row, no time. Clock times
removed from those cards' copy (a test keeps them out).

Battle card = "…Begins" and "…Champion Crowned" rows (not "Voting Opens").

**Seen in production data (local build, 2026-09-28):** the Saturday Tattoo
Dating Game row is published at 5:30 PM; Ryan said 6:00 PM. The card shows
the row as it is.

**Still typed (not in this request):** Daily Tattoo Contests "All weekend",
Gold Star VIP Meet & Greet "Saturday" and "Before doors open Saturday", Food
Truck Rodeo "All weekend".
