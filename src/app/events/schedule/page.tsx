'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import PublicNav from '@/components/PublicNav'

interface ScheduleEvent {
  time: string
  title: string
  location: string
  isPanel?: boolean
  panelId?: string
  isFree?: boolean
  cost?: number
  signupType?: 'none' | 'aatc_invoice' | 'email_host' | 'free_registration'
}

interface Panel {
  id: string
  title: string
  panel_date: string
  panel_time: string
  location: string
  is_free: boolean
  cost: number
  signup_type: 'none' | 'aatc_invoice' | 'email_host' | 'free_registration'
}

const STATIC_SCHEDULE: Record<string, ScheduleEvent[]> = {
  'Friday, April 16': [
    { time: '11:00 AM', title: 'Food Trucks Open', location: 'Outdoor Lot' },
    { time: '2:00 PM', title: 'Doors Open / General Admission', location: 'Main Entrance' },
    { time: '2:30 PM', title: 'Tattooing Begins', location: 'Convention Floor' },
    { time: '4:00 PM', title: 'Live Entertainment', location: 'Main Stage' },
    { time: '4:30 PM', title: 'Medieval Armored Combat Demo', location: 'Arena Area' },
    { time: '5:30 PM', title: 'Sideshow Strength Exhibition', location: 'Sideshow Stage' },
    { time: '6:00 PM', title: 'Tattoo Contest Registration Opens', location: 'Contest Booth' },
    { time: '7:00 PM', title: 'Medieval Armored Combat Demo', location: 'Arena Area' },
    { time: '8:00 PM', title: 'Friday Tattoo Contest Judging', location: 'Main Stage' },
    { time: '9:00 PM', title: 'Awards Ceremony / Live Music', location: 'Main Stage' },
    { time: '10:00 PM', title: 'Convention Floor Closes', location: '' },
    { time: '10:30 PM', title: 'Friday Night After Party', location: 'TBA - Offsite Venue' },
  ],
  'Saturday, April 17': [
    { time: '10:00 AM', title: 'VIP Early Admission & Gold Star Meet & Greet', location: 'VIP Lounge' },
    { time: '10:00 AM', title: 'Food Trucks Open', location: 'Outdoor Lot' },
    { time: '10:30 AM', title: 'General Admission Doors Open', location: 'Main Entrance' },
    { time: '11:00 AM', title: 'Tattooing Begins', location: 'Convention Floor' },
    { time: '12:00 PM', title: 'Medieval Armored Combat Demo', location: 'Arena Area' },
    { time: '1:00 PM', title: 'Live Entertainment', location: 'Main Stage' },
    { time: '2:00 PM', title: 'Strongest at the Sideshow Competitions', location: 'Sideshow Stage' },
    { time: '2:30 PM', title: 'Medieval Armored Combat Demo', location: 'Arena Area' },
    { time: '3:00 PM', title: 'Tattoo Contest Registration Opens', location: 'Contest Booth' },
    { time: '5:00 PM', title: 'Saturday Tattoo Contest Judging', location: 'Main Stage' },
    { time: '6:00 PM', title: 'Tattoo Dating Game', location: 'Main Stage' },
    { time: '7:00 PM', title: 'Miss AATC Pinup Contest', location: 'Main Stage' },
    { time: '8:00 PM', title: 'Special Guest Performances', location: 'Main Stage' },
    { time: '9:00 PM', title: 'Awards Ceremony', location: 'Main Stage' },
    { time: '10:00 PM', title: 'Convention Floor Closes', location: '' },
    { time: '10:30 PM', title: 'Saturday Night After Party', location: 'TBA - Offsite Venue' },
  ],
  'Sunday, April 18': [
    { time: '10:00 AM', title: 'VIP Early Admission', location: 'Main Entrance' },
    { time: '10:00 AM', title: 'Food Trucks Open', location: 'Outdoor Lot' },
    { time: '10:30 AM', title: 'General Admission Doors Open', location: 'Main Entrance' },
    { time: '11:00 AM', title: 'Tattooing Begins', location: 'Convention Floor' },
    { time: '12:00 PM', title: 'Medieval Armored Combat Demo', location: 'Arena Area' },
    { time: '1:00 PM', title: 'Live Entertainment', location: 'Main Stage' },
    { time: '1:30 PM', title: 'Strongest at the Sideshow Finals', location: 'Sideshow Stage' },
    { time: '2:00 PM', title: 'Tattoo Contest Registration Opens', location: 'Contest Booth' },
    { time: '3:00 PM', title: 'Medieval Armored Combat Grand Finale', location: 'Arena Area' },
    { time: '4:00 PM', title: 'Best of Show & Final Contest Judging', location: 'Main Stage' },
    { time: '5:00 PM', title: "People's Choice Voting Closes", location: 'Contest Booth' },
    { time: '5:30 PM', title: 'Final Awards Ceremony / Best of Show', location: 'Main Stage' },
    { time: '6:30 PM', title: 'Closing Remarks', location: 'Main Stage' },
    { time: '7:00 PM', title: 'Convention Closes', location: '' },
    { time: '8:00 PM', title: 'Sunday Closing Night Party', location: 'TBA - Offsite Venue' },
  ],
}

const DAY_ORDER = ['Friday, April 16', 'Saturday, April 17', 'Sunday, April 18']

function parseTime(timeStr: string): number {
  // Parse "2:00 PM" or "2:00 PM - 3:30 PM" (use start time)
  const part = timeStr.split('-')[0].trim()
  const match = part.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return 0
  let hours = parseInt(match[1])
  const minutes = parseInt(match[2])
  const ampm = match[3].toUpperCase()
  if (ampm === 'PM' && hours !== 12) hours += 12
  if (ampm === 'AM' && hours === 12) hours = 0
  return hours * 60 + minutes
}

function signupLabel(signupType: string): string {
  switch (signupType) {
    case 'free_registration': return 'Free Registration'
    case 'aatc_invoice': return 'Register & Pay'
    case 'email_host': return 'Contact Host'
    case 'none': return 'No Registration'
    default: return ''
  }
}

export default function SchedulePage() {
  const [schedule, setSchedule] = useState<{ day: string; events: ScheduleEvent[] }[]>(
    DAY_ORDER.map(day => ({ day, events: STATIC_SCHEDULE[day] }))
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadPanels() {
      const supabase = createClient()

      const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .single()

      if (!event) {
        setLoading(false)
        return
      }

      const { data: panels } = await supabase
        .from('panels_public')
        .select('id, title, panel_date, panel_time, location, is_free, cost, signup_type')
        .eq('event_id', event.id)
        

      if (panels && panels.length > 0) {
        const merged = DAY_ORDER.map(day => {
          const staticEvents = [...STATIC_SCHEDULE[day]]

          // Find panels for this day
          const dayPanels = (panels as Panel[]).filter(p => p.panel_date === day)

          // Convert panels to schedule events
          const panelEvents: ScheduleEvent[] = dayPanels.map(p => {
            // Extract the start time from panel_time (e.g. "2:00 PM - 3:30 PM" → "2:00 PM")
            const startTime = p.panel_time ? p.panel_time.split('-')[0].trim() : ''

            return {
              time: startTime || p.panel_time,
              title: p.title,
              location: p.location,
              isPanel: true,
              panelId: p.id,
              isFree: p.is_free,
              cost: p.cost,
              signupType: p.signup_type,
            }
          })

          // Merge and sort by time
          const allEvents = [...staticEvents, ...panelEvents]
          allEvents.sort((a, b) => parseTime(a.time) - parseTime(b.time))

          return { day, events: allEvents }
        })

        setSchedule(merged)
      }

      setLoading(false)
    }

    loadPanels()
  }, [])

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Three Days of Ink & Entertainment</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Event Schedule</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">From live tattooing and contests to medieval combat and after parties, there is something happening every hour at the All American Tattoo Convention. Plan your weekend with our full schedule below.</span>
        </p>
      </div>

      {/* Schedule Grid */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Schedule is subject to change. Check back for updates as the event approaches.</span>
          </p>

          {loading ? (
            <div className="flex justify-center py-12">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }}
              />
            </div>
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
                    {day.events.map((event, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-4 px-5 py-3"
                        style={{
                          borderBottom: i < day.events.length - 1 ? '1px solid #2a2a2a' : 'none',
                        }}
                      >
                        <span className="w-20 shrink-0 text-right text-xs font-medium" style={{ color: '#C4A882' }}>
                          {event.time}
                        </span>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {event.isPanel ? (
                              <Link
                                href={`/events/tattoo-panels${event.panelId ? `?register=${event.panelId}` : ''}`}
                                className="text-xs font-medium transition-opacity hover:opacity-80"
                                style={{ color: '#C4A882' }}
                              >
                                Panel: {event.title}
                              </Link>
                            ) : (
                              <span className="text-xs font-medium text-white">{event.title}</span>
                            )}

                            {event.location && (
                              <span className="text-[10px]" style={{ color: '#666' }}>
                                {event.location}
                              </span>
                            )}

                            {/* Price badge for panels */}
                            {event.isPanel && (
                              event.isFree ? (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                                  style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                                >
                                  Free
                                </span>
                              ) : event.cost && event.cost > 0 ? (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                                  style={{ backgroundColor: 'rgba(139,115,85,0.2)', color: '#C4A882' }}
                                >
                                  {formatCurrency(event.cost)}
                                </span>
                              ) : null
                            )}

                            {/* Registration action for panels */}
                            {event.isPanel && event.signupType && event.signupType !== 'none' && (
                              <Link
                                href={`/events/tattoo-panels${event.panelId ? `?register=${event.panelId}` : ''}`}
                                className="rounded-full px-2 py-0.5 text-[9px] font-bold transition-opacity hover:opacity-80"
                                style={{ backgroundColor: '#8B7355', color: '#fff' }}
                              >
                                {signupLabel(event.signupType)}
                              </Link>
                            )}

                            {event.isPanel && event.signupType === 'none' && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                                style={{ backgroundColor: '#2a2a2a', color: '#555' }}
                              >
                                No Registration
                              </span>
                            )}
                          </div>
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

      {/* Venue Info */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Venue Information</span>
          </h2>
          <div
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <a
              href="https://share.google/vRhsv0xqNzDRTPtGC"
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-bold transition-opacity hover:opacity-80"
              style={{ color: '#C4A882' }}
            >
              Crown Complex Event Center
            </a>
            <p className="mt-1 text-sm" style={{ color: '#999' }}>
              <a
                href="https://share.google/vRhsv0xqNzDRTPtGC"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-80"
                style={{ color: '#999' }}
              >
                1960 Coliseum Drive, Fayetteville, NC 28306
              </a>
            </p>
            <p className="mt-3 text-xs leading-relaxed" style={{ color: '#666' }}>
              Free parking available on-site. Food trucks located in the outdoor lot adjacent to the main entrance. The venue is fully accessible.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Need help planning your visit?</span>
        </p>
        <p className="text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Contact us at{' '}
          <a href="mailto:info@allamericantattooconvention.com" style={{ color: '#C4A882' }}>
            info@allamericantattooconvention.com
          </a></span>
        </p>
      </div>
    </div>
  )
}
