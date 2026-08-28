import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { formatCurrency } from '@/lib/utils'
import PublicNav from '@/components/PublicNav'
import PresentedBy from '@/components/PresentedBy'
import { dayLabel, timeLabel, timeToMinutes } from '@/lib/schedule-format'

/**
 * The 2027 programme. Server-rendered: this is public content with no
 * per-visitor state, and CUTOVER §F wants public pages server-rendered before
 * indexing is requested.
 *
 * TWO SOURCES, MERGED - and neither duplicates the other:
 *   schedule_items_public  the programme (doors, contests, ceremonies)
 *   panels_public          seminars and workshops, which own registration,
 *                          capacity and payment
 *
 * The previous version of this page held the whole schedule in a hardcoded
 * STATIC_SCHEDULE const carrying 2026 content - wrong times, wrong closing
 * times, and events that are not running in 2027. That is why the programme is
 * now a table.
 */

interface ScheduleRow {
  id: string
  day_date: string
  start_time: string
  sort_order: number
  title: string
  location: string
  note: string
  kind: string
  presented_by: string | null
  presented_by_website: string | null
  presented_by_linked: boolean
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

interface Item {
  key: string
  minutes: number
  time: string
  title: string
  location: string
  note: string
  isPanel: boolean
  panelId?: string
  isFree?: boolean
  cost?: number
  signupType?: string
  presentedBy: string | null
  presentedByWebsite: string | null
  presentedByLinked: boolean
}


function signupLabel(signupType: string): string {
  switch (signupType) {
    case 'free_registration': return 'Free Registration'
    case 'aatc_invoice': return 'Register & Pay'
    case 'email_host': return 'Contact Host'
    default: return ''
  }
}

const getSchedule = unstable_cache(
  async (): Promise<{ day: string; items: Item[] }[]> => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: event } = await supabase.from('events').select('id').eq('is_active', true).single()
    if (!event) return []

    const [{ data: rows, error: schedErr }, { data: panelRows, error: panelErr }] = await Promise.all([
      supabase
        .from('schedule_items_public')
        .select('id, day_date, start_time, sort_order, title, location, note, kind, presented_by, presented_by_website, presented_by_linked')
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
        .map(r => ({
          key: r.id,
          minutes: timeToMinutes(r.start_time) + r.sort_order / 100,
          time: timeLabel(r.start_time),
          title: r.title,
          location: r.location,
          note: r.note,
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
        items: [...programme, ...seminars].sort((a, b) => a.minutes - b.minutes),
      }
    })
  },
  ['schedule-2027'],
  { revalidate: 60, tags: ['schedule'] }
)

export const metadata = {
  title: 'Event Schedule | All American Tattoo Convention 2027',
  description:
    'The full three-day programme for AATC 2027 - tattoo contests, the All American Tattoo Battle, seminars and ceremonies, April 16-18 in Fayetteville, NC.',
}

export default async function SchedulePage() {
  const schedule = await getSchedule()

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Three Days of Ink &amp; Entertainment</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Event Schedule</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">
            From live tattooing and contests to seminars and after parties, there is something
            happening every hour at the All American Tattoo Convention. Plan your weekend with our
            full schedule below.
          </span>
        </p>
      </div>

      {/* Schedule */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">
              Schedule is subject to change. Check back for updates as the event approaches.
            </span>
          </p>

          {schedule.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: '#666' }}>
              The 2027 schedule is being finalised and will be published here shortly.
            </p>
          ) : (
            <div className="space-y-8">
              {schedule.map(day => (
                <div key={day.day}>
                  <h2
                    className="mb-4 rounded-xl px-5 py-3.5 text-center text-base font-bold uppercase tracking-wider"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', color: '#C4A882' }}
                  >
                    {day.day}
                  </h2>

                  <div
                    className="rounded-2xl p-1"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                  >
                    {day.items.map((item, i) => (
                      <div
                        key={item.key}
                        className="flex items-start gap-4 px-5 py-3"
                        style={{ borderBottom: i < day.items.length - 1 ? '1px solid #2a2a2a' : 'none' }}
                      >
                        <span
                          className="w-20 shrink-0 text-right text-xs font-medium"
                          style={{ color: '#C4A882' }}
                        >
                          {item.time}
                        </span>

                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {item.isPanel ? (
                              <Link
                                href={`/events/tattoo-panels${item.panelId ? `?register=${item.panelId}` : ''}`}
                                className="text-xs font-medium transition-opacity hover:opacity-80"
                                style={{ color: '#C4A882' }}
                              >
                                Seminar: {item.title}
                              </Link>
                            ) : (
                              <span className="text-xs font-medium text-white">{item.title}</span>
                            )}

                            {item.location && (
                              <span className="text-[10px]" style={{ color: '#666' }}>
                                {item.location}
                              </span>
                            )}

                            {item.isPanel && (
                              item.isFree ? (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                                  style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                                >
                                  Free
                                </span>
                              ) : (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                                  style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882' }}
                                >
                                  {formatCurrency(item.cost ?? 0)}
                                </span>
                              )
                            )}

                            {item.isPanel && item.signupType && item.signupType !== 'none' && (
                              <span className="text-[10px]" style={{ color: '#666' }}>
                                {signupLabel(item.signupType)}
                              </span>
                            )}
                          </div>

                          {item.note && (
                            <p className="mt-1 text-[11px] leading-relaxed" style={{ color: '#777' }}>
                              {item.note}
                            </p>
                          )}

                          <PresentedBy
                            name={item.presentedBy}
                            website={item.presentedByWebsite}
                            linked={item.presentedByLinked}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
