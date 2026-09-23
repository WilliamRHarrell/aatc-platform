import { EVENT_DATES_LABEL, EVENT_YEAR, TATTOO_BATTLE_PRESENTER, VENUE_CITY, VENUE_STATE } from './event-config'

/**
 * The All American Tattoo Battle. Every value on /tattoo-battle that is not a
 * schedule row or the presenter name lives here. Items marked // CONFIRM were
 * not confirmed by Ryan when written; the page renders them as given.
 *
 * Times: BATTLE_START is asserted equal to the "Tattoo Battle Begins" schedule
 * row by scripts/check-event-dates.mjs at build. The Friday judging moment is
 * derived (start + BATTLE_DURATION_HOURS) and the Sunday crowning comes from
 * the schedule row; neither is typed here. See the spec, §3.3.
 */
export const BATTLE_EDITION = 3
export const BATTLE_START = '2027-04-16T13:00:00-04:00'
export const BATTLE_DURATION_HOURS = 4

/**
 * The start time as people say it, derived from BATTLE_START in Eastern time:
 * hour and period alone when on the hour, hour:minute otherwise. Every sentence
 * that names the start is built from this, so the time has ONE home
 * (src/lib/tattoo-battle-copy.test.ts fails if anyone types it by hand).
 */
export function battleStartLabel(iso: string = BATTLE_START): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const minute = get('minute')
  return minute === '00' ? `${get('hour')} ${get('dayPeriod')}` : `${get('hour')}:${minute} ${get('dayPeriod')}`
}
export const BATTLE_START_LABEL = battleStartLabel()
export const SIGNUP_COPY = `Sign up in person at the main stage on check-in day, any time up until the ${BATTLE_START_LABEL} Friday start.`
export const WINNER_ANNOUNCED = 'Sunday, April 18, 2027'
export const BUCKET_COUNT = 20 // CONFIRM - number of QR codes to print
/** Physical codes must never depend on which host a build ran on. Fixed. */
export const QR_BASE_URL = 'https://www.allamericantattooconvention.com'

export const WHOLELIFE_INSTAGRAM = 'https://instagram.com/wholelife.aftercare'

export const VETERAN_INK = {
  name: 'Veteran Ink',
  url: 'https://veteranink.com',
  donateUrl: 'https://veteranink.com/donation', // CONFIRM - path not yet verified against their site
  description:
    'Veteran Ink is a 501(c)(3) nonprofit that helps veterans heal and tell their military stories through tattoo therapy. Through its Ink Fund Program and a network of partner studios, it sponsors tattoos for veterans.',
} as const

/** When false, copy says only bucket money counts toward the vote. */
export const ONLINE_DONATIONS_COUNT_AS_VOTES = false // CONFIRM
export const BUCKETS_ONLY_COPY = 'Only money in the buckets counts toward the vote.'

export interface Prize { title: string; optional?: boolean }
export const PRIZES: Prize[] = [
  { title: `${TATTOO_BATTLE_PRESENTER} tattoo aftercare package` },
  { title: 'A Bishop tattoo machine' },
  { title: 'The championship belt' },
  { title: `A free booth at the ${EVENT_YEAR + 1} show to defend the title`, optional: true }, // CONFIRM
]

export interface PastChampion { year: number; name: string; shop?: string; instagram?: string; image?: string }
export const PAST_CHAMPIONS: PastChampion[] = [] // Ryan fills in. Empty renders nothing.

export const HERO = {
  title: 'The All American Tattoo Battle',
  tagline: 'The Ultimate Tattoo Showdown',
  kicker: `${BATTLE_EDITION}rd Annual · ${VENUE_CITY} - Fort Bragg, ${VENUE_STATE} · ${EVENT_DATES_LABEL}`,
  ctaBooth: 'Get a Booth',
  ctaHow: 'How It Works',
} as const

export const ELIGIBILITY: string[] = [
  'Professional tattoo artists only. No apprentices.',
  'Must have a booth and be tattooing at the show, with an active tattoo permit for the event.',
  'Station set up, inspected, and approved to tattoo before the show opens Friday.',
  SIGNUP_COPY,
  'No pre-registration.',
]

export interface Rule { title: string; text: string }
export const RULES: Rule[] = [
  { title: 'Surprise design', text: 'The stencil (linework) is revealed when the contest begins.' },
  { title: 'Flash design', text: 'A 6x6-inch standard flash design. Creative liberties are allowed, but the tattoo must stay true to the overall structure.' },
  { title: 'Lower extremity', text: 'The tattoo goes on the lower extremity of a client the artist brings.' },
  { title: `${BATTLE_DURATION_HOURS}-hour limit`, text: `Starts ${BATTLE_START_LABEL} Friday. At the ${BATTLE_DURATION_HOURS}-hour mark, clients come to the stage for photo, video, and judging. Late tattoos are not judged.` },
  { title: 'Breaks', text: 'Unlimited, as long as the artist finishes on time.' },
  { title: 'Supplies', text: 'None provided.' },
]

export const HOW_IT_WORKS = {
  heading: 'How the Winner Is Decided',
  formula: "Final score = judges' score + the people's vote",
  judges: { title: "Judges' score", text: 'Each tattoo is judged on stage when time is up.' },
  people: {
    title: "The People's Vote",
    subtitle: 'Vote With Your Dollars',
    steps: [
      'Friday afternoon after judging, each tattoo gets a numbered Veteran Ink bucket with a QR code.',
      "Scan it to see the tattoo up close, then vote by dropping money in that tattoo's bucket.",
      'Every dollar is a vote, and all bucket money supports Veteran Ink.',
    ],
  },
  sunday: 'Sunday: the buckets are counted, combined with the judges’ score, and the champion is crowned.',
} as const

export const ATTENDEE_TIPS: string[] = [
  'Watch it live Friday afternoon.',
  'Find the buckets and vote all weekend.',
  'Be there Sunday for the crowning.',
]

export interface FaqItem { q: string; a: string }
export const FAQ: FaqItem[] = [
  { q: 'Do I need to pre-register?', a: `No. ${SIGNUP_COPY}` },
  { q: 'Can apprentices enter?', a: 'No. Professional tattoo artists only.' },
  { q: 'Who provides the client?', a: 'The artist brings their own client. The tattoo goes on the lower extremity.' },
  { q: `What if I don't finish in ${BATTLE_DURATION_HOURS} hours?`, a: 'Late tattoos are not judged. Take as many breaks as you like, as long as you finish on time.' },
  { q: 'How is the winner chosen?', a: 'Judges score each tattoo on stage when time is up. Then the people vote with their dollars all weekend. On Sunday the two are combined and the champion is crowned.' },
  { q: 'How do I vote?', a: `Scan the QR code on a bucket to see that tattoo up close, then drop money in the bucket. Every dollar is a vote.${ONLINE_DONATIONS_COUNT_AS_VOTES ? '' : ` ${BUCKETS_ONLY_COPY}`}` },
  { q: 'Where does the money go?', a: `All bucket money supports ${VETERAN_INK.name}.` },
  { q: 'Do I need a booth?', a: 'Yes. You must have a booth and be tattooing at the show, with an active tattoo permit for the event.' },
]
