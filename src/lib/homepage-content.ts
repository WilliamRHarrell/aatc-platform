import { TATTOO_BATTLE_PRESENTER } from './event-config'
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
    href: '/events/tattoo-contests',
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
      'Team strongman competition in the Crown Ballroom, Saturday at 1:00 PM.',
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
    // Sat 10:00 AM, Front Room - before doors. Gold Star = families of fallen
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

export interface AfterParty {
  night: string
  /** Calendar date, so travel planning does not depend on knowing the weekday. */
  date: string
  /** True for nights that fall BEFORE the convention opens. */
  preConvention: boolean
  /** page_images slug for this night. Renders nothing until an image is uploaded. */
  imageSlug: string
  venue: string | null
  address: string | null
}

/**
 * Three nights, always all three rendered. A "Venue TBA" card communicates that
 * something happens every night - dropping the card loses that.
 *
 * NO TIME FIELD, DELIBERATELY. The venues are already open when the show lets
 * out, so any stated start time would be inaccurate - people arrive when they
 * arrive. Venue, address and a map link are the whole card. Do not add a time
 * back without checking, and do not render an empty slot in its place.
 */
export const AFTER_PARTIES: AfterParty[] = [
  // THURSDAY IS PRE-CONVENTION. The show runs Friday to Sunday, April 16-18, so
  // the Thursday night is a kickoff before the doors ever open. Someone booking
  // travel around the show dates would otherwise arrive a day after it. That is
  // why the flag exists rather than the nights being listed flat.
  { night: 'Thursday', date: 'April 15', preConvention: true,  imageSlug: 'after-party-thursday', venue: null, address: null },
  { night: 'Friday',   date: 'April 16', preConvention: false, imageSlug: 'after-party-friday',   venue: null, address: null },
  { night: 'Saturday', date: 'April 17', preConvention: false, imageSlug: 'after-party-saturday', venue: null, address: null },
  // NO SUNDAY NIGHT. The convention's last day is Sunday; there is no after
  // party for it. An earlier version of /events/after-parties listed
  // Friday/Saturday/Sunday with invented venues - all of it removed.
]

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
