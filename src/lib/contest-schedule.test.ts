import { describe, it, expect } from 'vitest'
import { contestSchedule, type ScheduleDayLite } from './contest-schedule'

// Titles and times as they are in production schedule_items (2026-09-28).
const DAYS: ScheduleDayLite[] = [
  { day: 'Friday, April 16', dayDate: '2027-04-16', items: [
    { title: 'All American Tattoo Battle Begins', time: '1:00 PM' },
    { title: 'Tattoo Contest Registration Opens', time: '1:00 PM' },
    { title: 'Tattoo Contest Begins', time: '4:00 PM' },
    { title: 'Tattoo Battle Ends - Voting Opens', time: '5:00 PM' },
    { title: 'Tattoo Contest Continues', time: '8:00 PM' },
    { title: 'Tattoo of the Day', time: '9:30 PM' },
  ] },
  { day: 'Saturday, April 17', dayDate: '2027-04-17', items: [
    { title: 'Tattoo Contest Registration Opens', time: '1:00 PM' },
    { title: 'Tattoo Contest Begins', time: '4:00 PM' },
    { title: 'Tattoo Contest Continues', time: '7:00 PM' },
    { title: 'Tattoo of the Day', time: '9:30 PM' },
  ] },
  { day: 'Sunday, April 18', dayDate: '2027-04-18', items: [
    { title: 'Tattoo Contest Registration Opens', time: '1:00 PM' },
    { title: 'Tattoo Contest Begins', time: '4:00 PM' },
    { title: 'All American Tattoo Battle Champion Crowned', time: '6:00 PM' },
    { title: 'Tattoo of the Day & Best of Show', time: '7:00 PM' },
  ] },
]

describe('contestSchedule', () => {
  const s = contestSchedule(DAYS)
  it('per day: registration, first call, and the resume time where there is one', () => {
    expect(s.days).toEqual([
      { day: 'Friday', registration: '1:00 PM', begins: '4:00 PM', resumes: '8:00 PM' },
      { day: 'Saturday', registration: '1:00 PM', begins: '4:00 PM', resumes: '7:00 PM' },
      { day: 'Sunday', registration: '1:00 PM', begins: '4:00 PM', resumes: undefined },
    ])
  })
  it('Tattoo of the Day every day; Best in Show Sunday only (old "Best of Show" title still matched)', () => {
    expect(s.tattooOfTheDay).toEqual([{ day: 'Friday', time: '9:30 PM' }, { day: 'Saturday', time: '9:30 PM' }, { day: 'Sunday', time: '7:00 PM' }])
    expect(s.bestInShow).toEqual([{ day: 'Sunday', time: '7:00 PM' }])
  })
  it('Battle start and champion from their rows; "Battle Ends - Voting Opens" is not the start', () => {
    expect(s.battleStart).toEqual({ day: 'Friday', time: '1:00 PM' })
    expect(s.battleChampion).toEqual({ day: 'Sunday', time: '6:00 PM' })
  })
  it('matches the renamed Sunday row too', () => {
    const renamed = contestSchedule([{ ...DAYS[2], items: [{ title: 'Tattoo of the Day & Best in Show', time: '7:00 PM' }] }])
    expect(renamed.bestInShow).toEqual([{ day: 'Sunday', time: '7:00 PM' }])
  })
  it('a missing row is left out, never filled in', () => {
    const none = contestSchedule([{ day: 'Sunday, April 18', dayDate: '2027-04-18', items: [] }])
    expect(none).toEqual({ days: [], tattooOfTheDay: [], bestInShow: [] })
  })
})
