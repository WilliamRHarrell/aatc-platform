import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { dayLabel, timeLabel, timeToMinutes } from './schedule-format'
import { isPreConvention } from './venues'

/**
 * The 2027 programme, read from Supabase. ONE loader for every page that
 * shows the schedule - /events/schedule (the full programme) and /tickets
 * (the weekend at a glance). Until 2026-09-13 the tickets page carried its own
 * hand-typed copy of the whole weekend, which had drifted on the strongman
 * time and Saturday's closing time. A second dataset is not a presentation
 * choice; render this one differently instead.
 *
 * TWO SOURCES, MERGED - and neither duplicates the other:
 *   schedule_items_public  the programme (doors, contests, ceremonies)
 *   panels_public          seminars and workshops, which own registration,
 *                          capacity and payment
 */

interface ScheduleRow {
  id: string
  day_date: string
  /** Nullable since 070, but only UNPUBLISHED rows may be null and the public view carries published rows only. */
  start_time: string | null
  sort_order: number
  title: string
  location: string
  note: string
  kind: string
  presented_by: string | null
  presented_by_website: string | null
  presented_by_linked: boolean
  venue_id: string | null
}

interface PanelRow {
  id: string
  /** Real date (migration 046). Replaced the free-text panel_date this page
   *  used to string-match against a generated label. */
  panel_day: string | null
  panel_start: string | null
  location: string
  title: string
  is_free: boolean
  cost: number
  signup_type: string
  presented_by: string | null
  presented_by_website: string | null
  presented_by_linked: boolean
}

export interface Item {
  key: string
  minutes: number
  time: string
  title: string
  location: string
  note: string
  /** schedule_items.kind ('programme', 'contest', ..., 'after_party'); 'seminar' for panels. */
  kind: string
  /** ISO day the item belongs to; the day label is display only. */
  dayDate: string
  venueId: string | null
  isPanel: boolean
  panelId?: string
  isFree?: boolean
  cost?: number
  signupType?: string
  presentedBy: string | null
  presentedByWebsite: string | null
  presentedByLinked: boolean
}


export const getSchedule = unstable_cache(
  async (): Promise<{ day: string; dayDate: string; preConvention: boolean; items: Item[] }[]> => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: event } = await supabase.from('events').select('id, start_date').eq('is_active', true).single()
    if (!event) return []

    const [{ data: rows, error: schedErr }, { data: panelRows, error: panelErr }] = await Promise.all([
      supabase
        .from('schedule_items_public')
        .select('id, day_date, start_time, sort_order, title, location, note, kind, presented_by, presented_by_website, presented_by_linked, venue_id')
        .eq('event_id', event.id)
        .order('day_date')
        .order('start_time')
        .order('sort_order'),
      supabase
        .from('panels_public')
        .select('id, title, panel_day, panel_start, location, is_free, cost, signup_type, presented_by, presented_by_website, presented_by_linked')
        .eq('event_id', event.id),
    ])

    // Degrade to an empty page rather than throwing, but say so in the logs -
    // a silently empty schedule is indistinguishable from an unseeded one.
    // 42P01 here means migration 044 has not been applied.
    if (schedErr) {
      console.error(
        `[schedule] schedule_items_public query failed (${schedErr.code}): ${schedErr.message} - ` +
        'page will render empty. If 42P01, migration 044 has not been applied.'
      )
    }
    if (panelErr) {
      console.error(`[schedule] panels_public query failed (${panelErr.code}): ${panelErr.message}`)
    }

    const scheduleRows = (rows as ScheduleRow[] | null) ?? []
    const panels = (panelRows as PanelRow[] | null) ?? []

    // Days come from the data, not a hardcoded list - a schedule that gains a
    // Thursday should not need a code change to show it.
    const dayOrder = [...new Set(scheduleRows.map(r => r.day_date))].sort()

    return dayOrder.map(iso => {
      const label = dayLabel(iso)  // display only - no longer a join key

      const programme: Item[] = scheduleRows
        .filter(r => r.day_date === iso)
        // A published row always has a time (070 check); the guard is for the type only.
        .filter(r => r.start_time !== null)
        .map(r => ({
          key: r.id,
          minutes: timeToMinutes(r.start_time as string) + r.sort_order / 100,
          time: timeLabel(r.start_time as string),
          title: r.title,
          location: r.location,
          note: r.note,
          kind: r.kind,
          dayDate: r.day_date,
          venueId: r.venue_id,
          isPanel: false,
          presentedBy: r.presented_by,
          presentedByWebsite: r.presented_by_website,
          presentedByLinked: r.presented_by_linked,
        }))

      // A REAL EQUALITY ON A REAL DATE (migration 046). This used to compare
      // panels.panel_date - free text - against the generated `label`, so a
      // seminar whose string did not match exactly was silently absent from the
      // programme with nothing reporting it. That is the entire reason
      // verify_044.sql query D existed.
      const seminars: Item[] = panels
        .filter(p => p.panel_day === iso)
        .map(p => ({
          key: p.id,
          minutes: timeToMinutes(p.panel_start ?? '00:00:00'),
          time: timeLabel(p.panel_start ?? '00:00:00'),
          title: p.title,
          location: p.location,
          note: '',
          kind: 'seminar',
          dayDate: iso,
          venueId: null,
          isPanel: true,
          panelId: p.id,
          isFree: p.is_free,
          cost: p.cost,
          signupType: p.signup_type,
          presentedBy: p.presented_by,
          presentedByWebsite: p.presented_by_website,
          presentedByLinked: p.presented_by_linked,
        }))

      return {
        day: label,
        dayDate: iso,
        // Thursday's kickoff is the night BEFORE doors: derived from the date,
        // never from a weekday name, so a Wednesday kickoff would be right too.
        preConvention: isPreConvention(iso, event.start_date),
        items: [...programme, ...seminars].sort((a, b) => a.minutes - b.minutes),
      }
    })
  },
  ['schedule-2027'],
  { revalidate: 60, tags: ['schedule', 'after-parties'] }
)

export type ScheduleDay = { day: string; dayDate: string; preConvention: boolean; items: Item[] }
