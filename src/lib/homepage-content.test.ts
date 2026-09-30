import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HOME_EVENTS, cardWhen, cardText, scheduleSlots, DATING_GAME_TITLE } from './homepage-content'
import { ROOMS } from './event-config'
import { defaultsFor } from '@/content/registry'

const DAYS = [
  { day: 'Friday, April 16', items: [
    { title: 'All American Tattoo Battle Begins', time: '1:00 PM' },
    { title: 'Tattoo Battle Ends - Voting Opens', time: '5:00 PM' },
    { title: 'Tattoo Dating Game', time: '6:00 PM' },
  ] },
  { day: 'Saturday, April 17', items: [
    { title: 'Strongest at the Sideshow', time: '1:00 PM' },
    { title: 'Miss All American Pin-Up Contest', time: '2:00 PM' },
    { title: 'Tattoo Dating Game', time: '6:00 PM' },
  ] },
  { day: 'Sunday, April 18', items: [
    { title: 'All American Tattoo Battle Champion Crowned', time: '6:00 PM' },
    { title: 'Tattoo of the Day & Best in Show', time: '7:00 PM' },
  ] },
]
const card = (name: string) => HOME_EVENTS.find(e => e.name === name)!

describe('homepage cards: days and times from the schedule', () => {
  it('Tattoo Battle: start and crowning, not "Voting Opens"', () => {
    expect(cardWhen(card('The All American Tattoo Battle'), DAYS)).toBe('Fri 1:00 PM · Sun 6:00 PM')
  })
  it('Dating Game: every published row', () => {
    expect(cardWhen(card('Tattoo Dating Game'), DAYS)).toBe('Fri 6:00 PM · Sat 6:00 PM')
  })
  it('Pin-Up, Strongest, Best in Show', () => {
    expect(cardWhen(card('Miss All American Pin-Up Contest'), DAYS)).toBe('Sat 2:00 PM')
    expect(cardWhen(card('Strongest at the Sideshow'), DAYS)).toBe('Sat 1:00 PM')
    expect(cardWhen(card('Best in Show'), DAYS)).toBe('Sun 7:00 PM')
  })
  it('a missing row shows no time, not a stale one', () => {
    expect(cardWhen(card('Tattoo Dating Game'), [])).toBe('')
  })
  it('every card reads its text from the registry, with a default', () => {
    const home = defaultsFor('homepage')
    for (const ev of HOME_EVENTS) expect(cardText(ev, home), ev.name).toBeTruthy()
    expect(cardText(card('The All American Tattoo Battle'), home)).toMatch(/^Kicks off on the main stage Friday/)
  })
  it('{ballroom} is filled from ROOMS (one home for the room name)', () => {
    expect(cardText(card('Strongest at the Sideshow'), defaultsFor('homepage'))).toBe(`Team strongman competition in the ${ROOMS.ballroom}.`)
  })
  it('cards that read the schedule carry no clock time in their registry text', () => {
    const home = defaultsFor('homepage')
    for (const ev of HOME_EVENTS.filter(e => e.scheduleTitle)) {
      expect(cardText(ev, home), ev.name).not.toMatch(/\d{1,2}(:\d{2})?\s?(AM|PM)/i)
    }
  })
})

describe('scheduleSlots (shared by homepage cards and event pages)', () => {
  it('returns every matching row with its full day label, in order', () => {
    const days = [
      { day: 'Friday, April 16', items: [{ title: 'Tattoo Dating Game', time: '6:00 PM' }, { title: 'Other', time: '7:00 PM' }] },
      { day: 'Saturday, April 17', items: [{ title: ' Tattoo Dating Game ', time: '5:30 PM' }] },
    ]
    expect(scheduleSlots(DATING_GAME_TITLE, days)).toEqual([
      { day: 'Friday, April 16', time: '6:00 PM' },
      { day: 'Saturday, April 17', time: '5:30 PM' },
    ])
    expect(scheduleSlots(DATING_GAME_TITLE, [])).toEqual([])
  })
  it('the Dating Game page reads the schedule, and types no day or time', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/events/dating-game/page.tsx'), 'utf8')
    expect(page).toContain('scheduleSlots(DATING_GAME_TITLE')
    expect(page).not.toMatch(/(Friday|Saturday|Sunday),? April|\d:\d\d [AP]M'/)
  })
})
