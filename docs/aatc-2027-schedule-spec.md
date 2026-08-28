# AATC 2027 - Schedule Content & Spec Update

**Source:** 2026 schedule, carried forward. Day-of-week mapping is 1:1 - both years ran Friday - Sunday, so nothing needed re-ordering, only re-dating.

| 2026 | 2027 |
|---|---|
| Friday, April 17 | **Friday, April 16** |
| Saturday, April 18 | **Saturday, April 17** |
| Sunday, April 19 | **Sunday, April 18** |

**Confirms the countdown target.** Doors open Friday at 12:00 noon, which matches `2027-04-16T12:00:00-04:00` already in `event-config.ts`. No change needed.

---

## Friday, April 16, 2027

| Time | Item |
|---|---|
| 12:00 PM | Doors Open |
| 12:30 PM | Missing Man Table Presentation / Fallen Artists Moment of Silence |
| 1:00 PM | **Tattoo Battle** begins - Main Stage · *presented by Whole Life Aftercare* |
| 1:00 PM | Tattoo Contest registration opens |
| 4:00 PM | Tattoo Contest begins - Main Stage |
| 5:00 PM | Tattoo Battle ends / voting opens - Main Stage |
| 6:00 PM | Tattoo Dating Game |
| 8:00 PM | Tattoo Contest continues |
| 9:30 PM | Tattoo of the Day - Main Stage |
| 10:00 PM | Show closes |

## Saturday, April 17, 2027

| Time | Item |
|---|---|
| 10:00 AM | Gold Star VIP Meet & Greet - Front Room |
| 12:00 PM | Opening Ceremonies - Main Stage |
| 1:00 PM | Tattoo Contest registration opens |
| 1:30 PM | Strongest at the Sideshow - **Team Strongman competition** - Ballroom · *medieval armored combat demonstrations run in the breaks between rounds* |
| 2:00 PM | Miss All American Pin-Up Contest - Main Stage |
| 4:00 PM | Tattoo Contest begins - Main Stage |
| 7:00 PM | Tattoo Contest continues |
| 9:30 PM | Tattoo of the Day - Main Stage |
| 10:00 PM | Show closes |

## Sunday, April 18, 2027

| Time | Item |
|---|---|
| 12:00 PM | Opening Ceremonies - Main Stage |
| 1:00 PM | Tattoo Contest registration opens |
| 1:30 PM | **Bookkeeping for Tattoo Industry Professionals** - seminar · *presented by Nomadica* |
| 3:00 PM | Tooth Gem Seminar |
| 4:00 PM | Tattoo Contest begins - Main Stage |
| 6:00 PM | All American Tattoo Battle Champion crowned |
| 7:00 PM | Tattoo of the Day & Best of Show - Main Stage |
| 8:00 PM | Show closes |

---

## Changes from 2026

1. **Strongest at the Sideshow** is now **team strongman only**. Dead-lift and bench-press are dropped.
   **Medieval armored combat is NOT dropped** - it runs during this block, in the breaks between rounds, rather than as separately-timed demos as in 2026. `/events/medieval-combat` stays, and stays linked from the main nav.
2. **Tattoo Battle** is presented by **Whole Life Aftercare**.
3. **Bookkeeping seminar** is presented by **Nomadica**.
4. **Saturday now closes at 10:00 PM**, matching Friday. Tattoo of the Day moves from 10:00 PM to 9:30 PM and show close from 11:00 PM to 10:00 PM. Friday and Saturday now end identically; Sunday still closes at 8:00 PM.

---

## Spec implications

### Sponsor presentation credit - build it as data, not copy

Two schedule items now carry a "presented by" sponsor, and there will be more. Don't hardcode these into schedule copy.

- Add a nullable `presented_by_sponsorship_id` FK to whatever table backs schedule items (and to `panels`, since the Bookkeeping seminar is a panel).
- Render as the sponsor's name, linked to their site, with logo where the layout allows - pulled from `sponsors_public`, so it inherits the same display-column safety as everywhere else.
- Admin: a sponsor picker on the schedule/panel edit form.

**Why it matters commercially:** presentation credit on a named event is a sellable asset, and right now there's no way to record who bought one. If it lives in prose, it can't be reported on, can't be checked against what was sold, and quietly disappears when someone edits the copy.

### Homepage §5 - Events list

Populate from this schedule. Highlights worth surfacing on the homepage rather than the full list: Tattoo Battle, Miss All American Pin-Up Contest, Team Strongman, Tattoo Dating Game, Best of Show. Link through to the full schedule page.

### Homepage §6 - Seminars & Panels

**Only two seminars exist** - Bookkeeping and Tooth Gem. The homepage spec called for 3-4 cards. Render the two real ones and let the section size to content; do not pad with placeholders now that real entries exist.

### Sub-items: modelled as a note, not a row

Medieval armored combat runs inside the Saturday Strongman block rather than at
a time of its own. It is stored as the `note` on that `schedule_items` row.

`schedule_items` has no parent/child column and everything about the table hangs
off `start_time` - sorting, grouping, rendering. A separate row would have to
assert a start time the event does not have, and would sort as though it
displaced the Strongman entry rather than running within it. The `note` field
renders directly beneath the item title, which is the actual relationship.

**If sub-items become common** - more than two or three across the weekend, or
if one ever needs its own link, price or registration - that is the signal to
add `parent_id uuid references schedule_items(id)` and render them indented.
Not worth it for one.

### Wall of Honor - the in-show tie-in is Friday 12:30

The **Missing Man Table Presentation / Fallen Artists Moment of Silence** is the natural slot for the Wall of Honor presentation route. That's a scheduling fact worth recording in the Wall of Honor scope: the presentation isn't ambient signage, it has a moment in the programme.

Treat the copy around this item with corresponding care. Same for the **Gold Star VIP Meet & Greet** - Gold Star refers to families of fallen service members, and the wording should reflect that rather than reading as a ticket tier.

---

## Open questions

- [ ] **Is "Strongest at the Sideshow" still the event name** now that it's team-only, or does it get renamed?
- [ ] **TruFit Gym** was the strength-event sponsor on the 2024 floor plan when it was dead-lift and bench-press. Still involved?
- [ ] **Are these times confirmed for 2027**, or carried forward as a working draft? Publishing a schedule people book travel around is different from placeholder copy - anything uncertain should be marked "times subject to change" rather than presented as final.
- [ ] **Tattoo Contest categories** - the schedule says "Tattoo Contest" generically. The category list is still outstanding and is what `/admin/contests` needs before 2027.
- [ ] **Panel lineup beyond the two seminars** - is the Sunday seminar block still being filled?
