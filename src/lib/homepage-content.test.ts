import { describe, it, expect } from 'vitest'
import { HOME_EVENTS, cardWhen } from './homepage-content'

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
  it('cards that read the schedule carry no clock time in their copy', () => {
    for (const ev of HOME_EVENTS.filter(e => e.scheduleTitle)) {
      expect(ev.description, ev.name).not.toMatch(/\d{1,2}(:\d{2})?\s?(AM|PM)/i)
    }
  })
})
