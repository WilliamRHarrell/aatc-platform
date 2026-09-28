/**
 * The contest times shown on /events/tattoo-contests and the homepage, taken
 * from the schedule (schedule_items via getSchedule) - one home per time.
 *
 * How contests run (Ryan, 2026-09-28): sign-up opens at the "Tattoo Contest
 * Registration Opens" row; the first category is called at "Tattoo Contest
 * Begins"; each category is judged as it is called and its winner announced
 * before the next is called; in the early evening judging breaks so the
 * judges can rest, and it resumes at that day's "Tattoo Contest Continues"
 * row (Friday and Saturday only). Tattoo of the Day is every day, Best in Show
 * Sunday only, and the Tattoo Battle has its own timed rows. The times
 * themselves live only in those rows.
 *
 * Rows are matched by TITLE, like lib/tattoo-battle.ts. A renamed or deleted
 * row makes its line disappear rather than show a stale time.
 */
export interface ScheduleItemLite { title: string; time: string }
export interface ScheduleDayLite { day: string; dayDate: string; items: ScheduleItemLite[] }

export interface DayTime { day: string; time: string }
export interface ContestDay { day: string; registration?: string; begins?: string; resumes?: string }
export interface ContestSchedule {
  days: ContestDay[]
  tattooOfTheDay: DayTime[]
  bestInShow: DayTime[]
  battleStart?: DayTime
  battleChampion?: DayTime
}

const RE = {
  registration: /^tattoo contest registration opens$/i,
  begins: /^tattoo contest begins$/i,
  resumes: /^tattoo contest continues$/i,
  tattooOfTheDay: /tattoo of the day/i,
  // "Best of Show" matched too until the Sunday row is renamed (seed
  // best_in_show_2026_09_28.sql); displayed as "Best in Show" either way.
  bestInShow: /best (in|of) show/i,
  battleStart: /tattoo battle begins/i,
  battleChampion: /tattoo battle champion crowned/i,
}

/** 'Friday, April 16' -> 'Friday'. */
const weekday = (label: string) => label.split(',')[0].trim()

export function contestSchedule(days: ScheduleDayLite[]): ContestSchedule {
  const out: ContestSchedule = { days: [], tattooOfTheDay: [], bestInShow: [] }
  for (const d of days) {
    const day = weekday(d.day)
    const find = (re: RegExp) => d.items.find(i => re.test(i.title.trim()))?.time
    const cd: ContestDay = { day, registration: find(RE.registration), begins: find(RE.begins), resumes: find(RE.resumes) }
    if (cd.registration || cd.begins) out.days.push(cd)

    const totd = find(RE.tattooOfTheDay)
    if (totd) out.tattooOfTheDay.push({ day, time: totd })
    const bis = find(RE.bestInShow)
    if (bis) out.bestInShow.push({ day, time: bis })
    const bs = find(RE.battleStart)
    if (bs && !out.battleStart) out.battleStart = { day, time: bs }
    const bc = find(RE.battleChampion)
    if (bc && !out.battleChampion) out.battleChampion = { day, time: bc }
  }
  return out
}
