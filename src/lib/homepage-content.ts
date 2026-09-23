import { TATTOO_BATTLE_PRESENTER, ROOMS } from './event-config'
/**
 * Homepage list content that has no table of its own yet.
 *
 * HOME_EVENTS is deliberately NOT read from `schedule_items`. The schedule is
 * the programme - 25 timed rows, several of them repeats ("Tattoo Contest
 * Continues") that mean nothing to someone deciding whether to buy a ticket.
 * These cards are editorial: a curated handful with marketing copy and a link
 * to a detail page, neither of which lives on a schedule row. They must stay
 * CONSISTENT with the schedule, which is why the day/time claims below are
 * annotated with their source rows - but they are not generated from it.
 *
 * Source of truth for anything timed: docs/aatc-2027-schedule-spec.md, seeded
 * by supabase/seeds/schedule_2027.sql.
 *
 * Panels/seminars are NOT here - they come from the `panels` table so the
 * homepage auto-populates from admin.
 */

export interface HomeEvent {
  name: string
  day: string
  description: string
  href: string
  /** Presentation credit, where the item has a presenting sponsor. */
  presentedBy?: string
}

export const HOME_EVENTS: HomeEvent[] = [
  {
    name: 'Daily Tattoo Contests',
    day: 'All weekend',
    // Registration opens 1:00 PM all three days; judging begins 4:00 PM.
    description:
      'Categories across three days, from Best Military Tattoo to Best in Show. On-site registration opens daily at 1:00 PM.',
    href: '/events/tattoo-contests',
  },
  {
    name: 'The All American Tattoo Battle',
    presentedBy: TATTOO_BATTLE_PRESENTER,
    day: 'Fri - Sun',
    // Fri 1:00 PM start, 5:00 PM voting opens; champion crowned Sun 6:00 PM.
    description:
      'Artists battle live on the main stage from Friday afternoon. Voting opens Friday evening and the champion is crowned Sunday at 6:00 PM.',
    href: '/tattoo-battle',
  },
  {
    name: 'Miss All American Pin-Up Contest',
    day: 'Saturday',
    // Sat 2:00 PM, Main Stage.
    description:
      'Our most famous event, now in its 10th year - classic Americana on the main stage Saturday at 2:00 PM.',
    href: '/events/pinup-contest',
  },
  {
    name: 'Tattoo Dating Game',
    day: 'Friday',
    // Fri 6:00 PM, Main Stage.
    description:
      'Friday night on the main stage at 6:00 PM. Exactly what it sounds like, and it gets out of hand every year.',
    href: '/events/dating-game',
  },
  {
    name: 'Strongest at the Sideshow',
    day: 'Saturday',
    // 2027 CHANGE: team strongman only. Dead-lift and bench press are dropped -
    // do not reinstate them here without checking the schedule spec.
    description:
      `Team strongman competition in the ${ROOMS.ballroom}, Saturday at 1:00 PM.`,
    href: '/events/strongest-sideshow',
  },
  {
    name: 'Best of Show',
    day: 'Sunday',
    // Sun 7:00 PM - "Tattoo of the Day & Best of Show", Main Stage.
    description:
      'The weekend’s top work judged on the main stage Sunday at 7:00 PM, alongside the final Tattoo of the Day.',
    href: '/events/tattoo-contests',
  },
  {
    name: 'Gold Star VIP Meet & Greet',
    day: 'Saturday',
    // Sat 10:00 AM, Seminar Room - before doors. Gold Star = families of fallen
    // service members. Keep this wording; it is not a ticket tier.
    description:
      'Before doors open Saturday, we host Gold Star families for a private meet & greet with our featured artists.',
    href: '/events/vip-meet-greet',
  },
  {
    name: 'Food Truck Rodeo',
    day: 'All weekend',
    description:
      'Fayetteville’s largest food truck rodeo, right out front. Free and open to the public - no ticket required.',
    href: '/events/food-truck-rodeo',
  },
]

// AFTER_PARTIES and mapsUrl retired with migration 070 (2026-09-23): after
// parties are schedule_items rows with kind 'after_party' joined to `venues`,
// read by src/lib/after-parties-data.ts. mapsUrl lives in src/lib/venues.ts.
