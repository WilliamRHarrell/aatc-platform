'use client'

import PublicNav from '@/components/PublicNav'

const TICKETS = [
  {
    id: 'friday',
    label: 'Friday Pass',
    date: 'Friday, April 16',
    price: '$25',
    desc: 'Single-day admission for Friday.',
    href: '#', // Replace with Ticketmaster link
  },
  {
    id: 'saturday',
    label: 'Saturday Pass',
    date: 'Saturday, April 17',
    price: '$30',
    desc: 'Single-day admission for Saturday.',
    href: '#',
  },
  {
    id: 'sunday',
    label: 'Sunday Pass',
    date: 'Sunday, April 18',
    price: '$25',
    desc: 'Single-day admission for Sunday.',
    href: '#',
  },
  {
    id: 'weekend',
    label: '3-Day Weekend Pass',
    date: 'April 16–18',
    price: '$50',
    desc: 'Full access to all three days of the convention. Best value for the full experience.',
    href: '#',
    featured: true,
  },
  {
    id: 'vip',
    label: 'VIP 3-Day Pass',
    date: 'April 16–18',
    price: '$70',
    desc: 'Special badge, swag bag, meet & greet poster, T-shirt, 30-minute early daily admission, and VIP meet & greet with TV tattoo artists on Saturday.',
    href: '#',
    featured: true,
  },
]

const SCHEDULE = [
  {
    day: 'Friday, April 16',
    events: [
      { time: '2:00 PM', title: 'Doors Open' },
      { time: '2:30 PM', title: 'Tattooing Begins' },
      { time: '4:00 PM', title: 'Live Entertainment' },
      { time: '6:00 PM', title: 'Tattoo Contest Registration Opens' },
      { time: '8:00 PM', title: 'Friday Tattoo Contest Judging' },
      { time: '10:00 PM', title: 'Doors Close' },
    ],
  },
  {
    day: 'Saturday, April 17',
    events: [
      { time: '10:00 AM', title: 'VIP Early Admission & Meet & Greet' },
      { time: '10:30 AM', title: 'General Admission Doors Open' },
      { time: '11:00 AM', title: 'Tattooing Begins' },
      { time: '1:00 PM', title: 'Live Entertainment' },
      { time: '3:00 PM', title: 'Tattoo Contest Registration Opens' },
      { time: '5:00 PM', title: 'Saturday Tattoo Contest Judging' },
      { time: '7:00 PM', title: 'Special Performances' },
      { time: '10:00 PM', title: 'Doors Close' },
    ],
  },
  {
    day: 'Sunday, April 18',
    events: [
      { time: '10:00 AM', title: 'VIP Early Admission' },
      { time: '10:30 AM', title: 'General Admission Doors Open' },
      { time: '11:00 AM', title: 'Tattooing Begins' },
      { time: '1:00 PM', title: 'Live Entertainment' },
      { time: '2:00 PM', title: 'Tattoo Contest Registration Opens' },
      { time: '4:00 PM', title: 'Best of Show & Final Contest Judging' },
      { time: '6:00 PM', title: 'Awards Ceremony' },
      { time: '7:00 PM', title: 'Convention Closes' },
    ],
  },
]

const CONTEST_CATEGORIES: Record<string, string[]> = {
  'Friday': [
    'Best Black & Grey',
    'Best Color',
    'Best Traditional',
    'Best Neo-Traditional',
    'Best Realism',
    'Best Small Tattoo',
  ],
  'Saturday': [
    'Best Portrait',
    'Best Japanese',
    'Best Lettering / Script',
    'Best Biomechanical',
    'Best Watercolor',
    'Best Cover-Up',
  ],
  'Sunday': [
    'Best Sleeve',
    'Best Back Piece',
    'Best Leg Piece',
    'Best of Day (Friday & Saturday Winners)',
    'Best of Show',
    'Peoples Choice',
  ],
}

export default function TicketsPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">April 16–18, 2027 · Fayetteville, NC</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Buy Tickets</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Secure your spot at the All American Tattoo Convention. Active military and veterans receive a $5 discount at the door with valid ID.</span>
        </p>
      </div>

      {/* Tickets */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Admission Passes</span>
          </h2>

          {/* Single Day Passes */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {TICKETS.filter(t => !t.featured).map(ticket => (
              <a
                key={ticket.id}
                id={ticket.id}
                href={ticket.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group scroll-mt-20 rounded-2xl p-6 transition-all duration-200"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLElement).style.borderColor = '#8B7355'
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLElement).style.borderColor = '#2a2a2a'
                }}
              >
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#666' }}>
                  {ticket.date}
                </p>
                <h3 className="mt-2 text-lg font-bold text-white">{ticket.label}</h3>
                <p className="mt-1 text-sm" style={{ color: '#999' }}>{ticket.desc}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-display text-2xl font-bold" style={{ color: '#C4A882' }}>
                    {ticket.price}
                  </span>
                  <span
                    className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors"
                    style={{ backgroundColor: '#8B7355' }}
                  >
                    Buy Now
                  </span>
                </div>
              </a>
            ))}
          </div>

          {/* Featured Passes */}
          <div className="grid gap-4 sm:grid-cols-2">
            {TICKETS.filter(t => t.featured).map(ticket => (
              <a
                key={ticket.id}
                id={ticket.id}
                href={ticket.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative scroll-mt-20 overflow-hidden rounded-2xl p-6 transition-all duration-200"
                style={{
                  backgroundColor: '#1a1a1a',
                  border: ticket.id === 'vip' ? '2px solid #8B7355' : '1px solid #2a2a2a',
                }}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLElement).style.borderColor = '#C4A882'
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLElement).style.borderColor = ticket.id === 'vip' ? '#8B7355' : '#2a2a2a'
                }}
              >
                {ticket.id === 'vip' && (
                  <div
                    className="absolute right-4 top-4 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: '#8B7355', color: '#fff' }}
                  >
                    Best Experience
                  </div>
                )}
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#666' }}>
                  {ticket.date}
                </p>
                <h3 className="mt-2 text-xl font-bold text-white">{ticket.label}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: '#999' }}>{ticket.desc}</p>
                <div className="mt-5 flex items-center justify-between">
                  <span className="font-display text-3xl font-bold" style={{ color: '#C4A882' }}>
                    {ticket.price}
                  </span>
                  <span
                    className="rounded-lg px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors"
                    style={{ backgroundColor: '#8B7355' }}
                  >
                    Buy Now
                  </span>
                </div>
              </a>
            ))}
          </div>

          <p className="mt-6 text-center text-xs" style={{ color: '#555' }}>
            <span className="text-emboss">Online purchases are subject to Ticketmaster service fees. To avoid fees, tickets may be purchased in person at the on-base Ft Bragg ticket office or the Crown Complex box office.</span>
          </p>
        </div>
      </section>

      {/* Schedule */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Schedule of Events</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Schedule is subject to change. Check back for updates.</span>
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {SCHEDULE.map(day => (
              <div
                key={day.day}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <h3 className="mb-4 text-center text-sm font-bold uppercase tracking-wider text-white">
                  {day.day}
                </h3>
                <div className="space-y-3">
                  {day.events.map((event, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="w-20 shrink-0 text-right text-xs font-medium" style={{ color: '#C4A882' }}>
                        {event.time}
                      </span>
                      <span className="text-xs" style={{ color: '#999' }}>
                        {event.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tattoo Contest Categories */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Tattoo Contest Categories</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Categories are subject to change. Final categories will be announced closer to the event.</span>
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {Object.entries(CONTEST_CATEGORIES).map(([day, categories]) => (
              <div
                key={day}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <h3 className="mb-4 text-center text-sm font-bold uppercase tracking-wider text-white">
                  {day}
                </h3>
                <ul className="space-y-2.5">
                  {categories.map(cat => (
                    <li key={cat} className="flex items-center gap-2 text-xs" style={{ color: '#999' }}>
                      <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                      {cat}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Questions about tickets?</span>
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
