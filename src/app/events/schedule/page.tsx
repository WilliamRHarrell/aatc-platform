import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import PublicNav from '@/components/PublicNav'
import PresentedBy from '@/components/PresentedBy'
import { getSchedule } from '@/lib/schedule-data'
import PageImage from '@/components/PageImage'

/**
 * The 2027 programme. Server-rendered: this is public content with no
 * per-visitor state, and CUTOVER §F wants public pages server-rendered before
 * indexing is requested.
 *
 * Data comes from getSchedule in src/lib/schedule-data.ts, shared with the
 * tickets page so the weekend is typed once.
 *
 * The previous version of this page held the whole schedule in a hardcoded
 * STATIC_SCHEDULE const carrying 2026 content - wrong times, wrong closing
 * times, and events that are not running in 2027. That is why the programme is
 * now a table.
 */

function signupLabel(signupType: string): string {
  switch (signupType) {
    case 'free_registration': return 'Free Registration'
    case 'aatc_invoice': return 'Register & Pay'
    case 'email_host': return 'Contact Host'
    default: return ''
  }
}


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

      {/* Slot 'schedule-hero'. Renders nothing until an admin uploads. */}
      <PageImage slug="schedule-hero" className="mx-auto mt-8 max-w-3xl px-4" />

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
                    {day.preConvention && (
                      <span className="ml-3 rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal" style={{ backgroundColor: 'rgba(196,168,130,0.15)', color: '#C4A882' }}>
                        Before the convention opens
                      </span>
                    )}
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
