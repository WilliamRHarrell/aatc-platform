import { TATTOO_BATTLE_PRESENTER, ROOMS } from './event-config'
/**
 * Homepage list content that has no table of its own yet.
 *
 * HOME_EVENTS is a curated handful of cards, NOT the programme: the name, the
 * marketing copy and the link are written here by hand. Their DAYS AND TIMES
 * are not (Ryan, 2026-09-28): a card with `scheduleTitle` shows every
 * published schedule_items row whose title matches, as "Fri 6:00 PM · Sat
 * 6:00 PM", via cardWhen(). A missing row shows no time rather than a stale
 * one. So the descriptions below carry no clock times.
 *
 * Source of truth for anything timed: schedule_items (/admin/schedule).
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
  /** Title of the schedule row(s) this card's day and time come from. */
  scheduleTitle?: RegExp
}

/** 'Friday, April 16' -> 'Fri'. */
const shortDay = (label: string) => label.split(',')[0].trim().slice(0, 3)

/**
 * The card's day label: every matching schedule row, in schedule order, or the
 * card's own `day` when it has no `scheduleTitle`. '' when no row matches.
 */
export function cardWhen(ev: HomeEvent, days: { day: string; items: { title: string; time: string }[] }[]): string {
  if (!ev.scheduleTitle) return ev.day
  const re = ev.scheduleTitle
  return days
    .flatMap(d => d.items.filter(i => re.test(i.title.trim())).map(i => `${shortDay(d.day)} ${i.time}`))
    .join(' · ')
}

export const HOME_EVENTS: HomeEvent[] = [
  {
    name: 'Daily Tattoo Contests',
    day: 'All weekend',
    // Registration 1:00 PM; the first category is called at 4:00 PM and the
    // rest follow one at a time (schedule rows; /events/tattoo-contests).
    description:
      'Categories across three days, from Best Military Tattoo to Best in Show. On-site registration opens daily at 1:00 PM.',
    href: '/events/tattoo-contests',
  },
  {
    name: 'The All American Tattoo Battle',
    presentedBy: TATTOO_BATTLE_PRESENTER,
    day: '',
    // The start and the crowning; not "Battle Ends - Voting Opens".
    scheduleTitle: /tattoo battle (begins|champion crowned)/i,
    description:
      'Artists battle live on the main stage, then voting opens and the champion is crowned.',
    href: '/tattoo-battle',
  },
  {
    name: 'Miss All American Pin-Up Contest',
    day: '',
    scheduleTitle: /pin-?up contest/i,
    description:
      'Our most famous event, now in its 10th year - classic Americana on the main stage.',
    href: '/events/pinup-contest',
  },
  {
    name: 'Tattoo Dating Game',
    day: '',
    // Every published row: Friday, and Saturday once that row is published.
    scheduleTitle: /tattoo dating game/i,
    description:
      'Live on the main stage. Exactly what it sounds like, and it gets out of hand every year.',
    href: '/events/dating-game',
  },
  {
    name: 'Strongest at the Sideshow',
    day: '',
    // 2027 CHANGE: team strongman only. Dead-lift and bench press are dropped -
    // do not reinstate them here without checking the schedule spec.
    scheduleTitle: /strongest at the sideshow/i,
    description:
      `Team strongman competition in the ${ROOMS.ballroom}.`,
    href: '/events/strongest-sideshow',
  },
  {
    name: 'Best in Show',
    day: '',
    scheduleTitle: /best (in|of) show/i,
    description:
      'The weekend’s top work, judged on the main stage alongside the final Tattoo of the Day.',
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
