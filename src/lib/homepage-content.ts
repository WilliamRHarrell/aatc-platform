/**
 * Homepage list content that has no table of its own yet.
 *
 * TODO: move to CMS. The events list mirrors the signature events described in
 * docs/site-copy-v1.md; the after-party nights are placeholders until venues
 * are booked. Panels/seminars are NOT here — they come from the `panels` table
 * so the homepage auto-populates from admin.
 */

export interface HomeEvent {
  name: string
  day: string
  description: string
  href: string
}

export const HOME_EVENTS: HomeEvent[] = [
  {
    name: 'Daily Tattoo Contests',
    day: 'All weekend',
    description: '40+ categories across three days, from Best Military Tattoo to Best in Show. On-site registration daily at 1:00 PM.',
    href: '/events/tattoo-contests',
  },
  {
    name: 'The All American Tattoo Battle',
    day: 'Fri – Sun',
    description: 'Artists battle live on the main stage. Voting runs all weekend and the champion is crowned Sunday.',
    href: '/events/tattoo-contests',
  },
  {
    name: 'Miss All American Pin-Up Contest',
    day: 'Saturday',
    description: 'Our most famous event, now in its 10th year — classic Americana on the main stage Saturday afternoon.',
    href: '/events/pinup-contest',
  },
  {
    name: 'Food Truck Rodeo',
    day: 'All weekend',
    description: 'Fayetteville’s largest food truck rodeo, right out front. Free and open to the public — no ticket required.',
    href: '/events/food-truck-rodeo',
  },
  {
    name: 'Gold Star VIP Meet & Greet',
    day: 'Saturday',
    description: 'Before doors open, we host Gold Star families for a private meet & greet with our featured artists.',
    href: '/events/vip-meet-greet',
  },
  {
    name: 'Strongest at the Sideshow',
    day: 'Saturday',
    description: 'Deadlift, bench press and team strongman competition in the Ballroom.',
    href: '/events/strongest-sideshow',
  },
]

export interface AfterParty {
  night: string
  venue: string | null
  address: string | null
  time: string | null
}

/**
 * Three nights, always all three rendered. A "Venue TBA" card communicates that
 * something happens every night — dropping the card loses that.
 */
export const AFTER_PARTIES: AfterParty[] = [
  { night: 'Thursday', venue: null, address: null, time: null },
  { night: 'Friday', venue: null, address: null, time: null },
  { night: 'Saturday', venue: null, address: null, time: null },
]

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
