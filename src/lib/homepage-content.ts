import { TATTOO_BATTLE_PRESENTER, ROOMS } from './event-config'
/**
 * Homepage list content that has no table of its own yet.
 *
 * HOME_EVENTS is a curated handful of cards, NOT the programme: the name and
 * link are written here by hand, the marketing copy in the page-content
 * registry (homepage, "Events: … card text"; editable in /admin/content). Their DAYS AND TIMES
 * are not (Ryan, 2026-09-28): a card with `scheduleTitle` shows every
 * published schedule_items row whose title matches, as "Fri 6:00 PM · Sat
 * 6:00 PM", via cardWhen(). A missing row shows no time rather than a stale
 * one. The card TEXT is in the page-content registry (descriptionKey), and
 * the text of schedule-driven cards carries no clock times.
 *
 * Source of truth for anything timed: schedule_items (/admin/schedule).
 *
 * Panels/seminars are NOT here - they come from the `panels` table so the
 * homepage auto-populates from admin.
 */

export interface HomeEvent {
  name: string
  day: string
  /**
   * The card text lives in the page-content registry (homepage section) under
   * this key, editable in /admin/content. `{ballroom}` in it is filled from
   * ROOMS.ballroom (event-config) at render, so the room name has one home.
   */
  descriptionKey: string
  href: string
  /** Presentation credit, where the item has a presenting sponsor. */
  presentedBy?: string
  /** Title of the schedule row(s) this card's day and time come from. */
  scheduleTitle?: RegExp
}

/** 'Friday, April 16' -> 'Fri'. */
const shortDay = (label: string) => label.split(',')[0].trim().slice(0, 3)

/** Schedule row titles for the events whose own pages also read their times. */
export const DATING_GAME_TITLE = /tattoo dating game/i

type ScheduleDays = { day: string; items: { title: string; time: string }[] }[]

/**
 * Every published schedule row whose title matches, in schedule order, as
 * { day: 'Friday, April 16', time: '6:00 PM' }. [] when none match: show no
 * time rather than a stale one. Homepage cards and event pages both use this.
 */
export function scheduleSlots(re: RegExp, days: ScheduleDays): { day: string; time: string }[] {
  return days.flatMap(d => d.items.filter(i => re.test(i.title.trim())).map(i => ({ day: d.day, time: i.time })))
}

/**
 * The card's day label: every matching schedule row, in schedule order, or the
 * card's own `day` when it has no `scheduleTitle`. '' when no row matches.
 */
export function cardWhen(ev: HomeEvent, days: ScheduleDays): string {
  if (!ev.scheduleTitle) return ev.day
  return scheduleSlots(ev.scheduleTitle, days)
    .map(s => `${shortDay(s.day)} ${s.time}`)
    .join(' · ')
}

export const HOME_EVENTS: HomeEvent[] = [
  {
    name: 'Daily Tattoo Contests',
    day: 'All weekend',
    // Registration 1:00 PM; the first category is called at 4:00 PM and the
    // rest follow one at a time (schedule rows; /events/tattoo-contests).
    descriptionKey: 'event_contests_description',
    href: '/events/tattoo-contests',
  },
  {
    name: 'The All American Tattoo Battle',
    presentedBy: TATTOO_BATTLE_PRESENTER,
    day: '',
    // The start and the crowning; not "Battle Ends - Voting Opens".
    scheduleTitle: /tattoo battle (begins|champion crowned)/i,
    descriptionKey: 'event_battle_description',
    href: '/tattoo-battle',
  },
  {
    name: 'Miss All American Pin-Up Contest',
    day: '',
    scheduleTitle: /pin-?up contest/i,
    descriptionKey: 'event_pinup_description',
    href: '/events/pinup-contest',
  },
  {
    name: 'Tattoo Dating Game',
    day: '',
    // Every published row: Friday, and Saturday once that row is published.
    scheduleTitle: DATING_GAME_TITLE,
    descriptionKey: 'event_dating_description',
    href: '/events/dating-game',
  },
  {
    name: 'Strongest at the Sideshow',
    day: '',
    // 2027 CHANGE: team strongman only. Dead-lift and bench press are dropped -
    // do not reinstate them here without checking the schedule spec.
    scheduleTitle: /strongest at the sideshow/i,
    descriptionKey: 'event_strongest_description',
    href: '/events/strongest-sideshow',
  },
  {
    name: 'Best in Show',
    day: '',
    scheduleTitle: /best (in|of) show/i,
    descriptionKey: 'event_best_in_show_description',
    href: '/events/tattoo-contests',
  },
  {
    name: 'Gold Star VIP Meet & Greet',
    day: 'Saturday',
    // Sat 10:00 AM, Seminar Room - before doors. Gold Star = families of fallen
    // service members. Keep this wording; it is not a ticket tier.
    descriptionKey: 'event_gold_star_description',
    href: '/events/vip-meet-greet',
  },
  {
    name: 'Food Truck Rodeo',
    day: 'All weekend',
    descriptionKey: 'event_food_truck_description',
    href: '/events/food-truck-rodeo',
  },
]

// AFTER_PARTIES and mapsUrl retired with migration 070 (2026-09-23): after
// parties are schedule_items rows with kind 'after_party' joined to `venues`,
// read by src/lib/after-parties-data.ts. mapsUrl lives in src/lib/venues.ts.

/** A card's text: the registry copy with `{ballroom}` filled from ROOMS. */
export function cardText(ev: HomeEvent, content: Record<string, string>): string {
  return (content[ev.descriptionKey] ?? '').replaceAll('{ballroom}', ROOMS.ballroom)
}
