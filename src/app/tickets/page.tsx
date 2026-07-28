import type { Metadata } from 'next'
import { getContent } from '@/content/getContent'
import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'

export const metadata: Metadata = {
  title: 'Buy Tickets | All American Tattoo Convention 2027 | Fayetteville NC',
  description:
    'Tickets for AATC 2027, April 16–18 at the Crown Complex. Single-day, weekend, and VIP passes with military discounts. VIP includes swag bag and artist meet & greet.',
}

const SCHEDULE = [
  {
    day: 'Friday, April 16',
    events: [
      { time: '12:00 PM', title: 'All-Veteran Parachute Team jumps in' },
      { time: '12:30 PM', title: 'Missing Man Table Ceremony — Main Stage' },
      { time: '1:00 PM', title: 'The All American Tattoo Battle begins' },
      { time: '1:00 PM', title: 'Tattoo contest registration opens' },
      { time: '4:00 PM', title: 'Tattoo contests begin — Main Stage' },
      { time: '9:30 PM', title: 'Tattoo of the Day — Main Stage' },
      { time: '10:00 PM', title: 'Show close' },
    ],
  },
  {
    day: 'Saturday, April 17',
    events: [
      { time: '10:00 AM', title: 'Gold Star VIP Meet & Greet — Front Room' },
      { time: '12:00 PM', title: 'Opening ceremonies — Main Stage' },
      { time: '1:00 PM', title: 'Tattoo contest registration opens' },
      { time: '1:30 PM', title: 'Strongest at the Sideshow — Ballroom' },
      { time: '2:00 PM', title: 'Miss All American Pin-Up Contest — Main Stage' },
      { time: '4:00 PM', title: 'Tattoo contests begin — Main Stage' },
      { time: '10:00 PM', title: 'Tattoo of the Day — Main Stage' },
      { time: '11:00 PM', title: 'Show close' },
    ],
  },
  {
    day: 'Sunday, April 18',
    events: [
      { time: '12:00 PM', title: 'Opening ceremonies — Main Stage' },
      { time: '1:00 PM', title: 'Tattoo contest registration opens' },
      { time: '3:00 PM', title: 'Presentation to nonprofit' },
      { time: '4:00 PM', title: 'Tattoo contests begin — Main Stage' },
      { time: '6:00 PM', title: 'All American Tattoo Battle Champion crowned' },
      { time: '7:00 PM', title: 'Tattoo of the Day & Best of Show' },
      { time: '8:00 PM', title: 'Show close' },
    ],
  },
]

const CONTEST_CATEGORIES: Record<string, string[]> = {
  Friday: [
    'Large Color · Small Color',
    'Large Black & Gray · Small Black & Gray',
    'Best Military Tattoo',
    'American Pride Tattoo',
    'Best Geometric/Dotwork',
    'Best Asian Inspired',
    'Best Hand Tattoo',
    'Best Neck/Face Tattoo',
    'Best Cover Up',
    'Tattoo of the Day (Color & B&G)',
  ],
  Saturday: [
    'Large Color · Small Color',
    'Large Black & Gray · Small Black & Gray',
    'Best Lettering',
    'Best American Traditional',
    'Best Neotraditional',
    'Best Watercolor',
    'Best Color & B&G Portraits',
    'Best Back Piece · Arm Sleeve · Leg Sleeve · Chest Piece',
    'Best Ear Curation',
    'Best Overall Male · Best Overall Female',
    'Tattoo of the Day (Color & B&G)',
  ],
  Sunday: [
    'Large Color · Small Color',
    'Large Black & Gray · Small Black & Gray',
    'Best Tattoo by a Veteran',
    'Best Comic/Superhero',
    'Best Anime Tattoo',
    'Best Disney Themed',
    'Most Unusual Tattoo',
    'Best Tattooed Flesh (fake skin)',
    'Best Original Flash',
    'Best Temporary Tattoo (kids)',
    'Best in Show (Color & B&G)',
  ],
}

export default async function TicketsPage() {
  const c = await getContent('tickets')

  const singleDay = [
    { id: 'friday', label: 'Friday Pass', date: 'Friday, April 16', desc: 'Single-day admission for Friday.' },
    { id: 'saturday', label: 'Saturday Pass', date: 'Saturday, April 17', desc: 'Single-day admission for Saturday.' },
    { id: 'sunday', label: 'Sunday Pass', date: 'Sunday, April 18', desc: 'Single-day admission for Sunday.' },
  ]

  const featured = [
    {
      id: 'weekend',
      label: 'Weekend Pass',
      date: 'April 16–18',
      price: c.price_weekend,
      note: c.price_weekend_note,
      desc: 'All three days. Every contest, every event, every artist.',
      vip: false,
    },
    {
      id: 'vip',
      label: 'VIP Weekend Pass',
      date: 'April 16–18',
      price: c.price_vip,
      note: c.price_vip_note,
      desc: '30-minute early admission every day, VIP badge and swag bag, Meet & Greet signature poster and pen, access to the Saturday 10 AM VIP meet & greet with TV tattoo artists, and an official AATC t-shirt.',
      vip: true,
    },
  ]

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">{c.header_eyebrow}</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">{c.header_title}</span>
        </h1>
        <div className="mx-auto mt-3 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">
            <Markdown inline>{c.header_intro}</Markdown>
          </span>
        </div>
      </div>

      {/* Tickets */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">{c.passes_title}</span>
          </h2>

          {c.onsale_notice ? (
            <div
              className="mx-auto mb-8 max-w-2xl rounded-xl px-5 py-4 text-center text-sm"
              style={{ backgroundColor: 'rgba(139,115,85,0.12)', border: '1px solid #8B7355', color: '#C4A882' }}
            >
              <Markdown inline>{c.onsale_notice}</Markdown>
            </div>
          ) : null}

          {/* Featured passes */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            {featured.map(ticket => (
              <div
                key={ticket.id}
                id={ticket.id}
                className={`relative scroll-mt-20 overflow-hidden rounded-2xl bg-[#1a1a1a] p-6 transition-colors duration-200 ${
                  ticket.vip ? 'border-2 border-[#8B7355]' : 'border border-[#2a2a2a]'
                } hover:border-[#C4A882]`}
              >
                {ticket.vip && (
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
                <p className="mt-2 text-sm leading-relaxed" style={{ color: '#999' }}>
                  {ticket.desc}
                </p>
                <div className="mt-5">
                  <span className="font-display text-3xl font-bold" style={{ color: '#C4A882' }}>
                    {ticket.price}
                  </span>
                  <p className="mt-1 text-xs" style={{ color: '#666' }}>
                    {ticket.note}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Single-day passes */}
          <div className="grid gap-4 sm:grid-cols-3">
            {singleDay.map(ticket => (
              <div
                key={ticket.id}
                id={ticket.id}
                className="scroll-mt-20 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 transition-colors duration-200 hover:border-[#8B7355]"
              >
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#666' }}>
                  {ticket.date}
                </p>
                <h3 className="mt-2 text-lg font-bold text-white">{ticket.label}</h3>
                <p className="mt-1 text-sm" style={{ color: '#999' }}>
                  {ticket.desc}
                </p>
                <div className="mt-4">
                  <span className="font-display text-2xl font-bold" style={{ color: '#C4A882' }}>
                    {c.price_single_day}
                  </span>
                  <p className="mt-1 text-xs" style={{ color: '#666' }}>
                    {c.price_single_day_note}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-center text-xs" style={{ color: '#555' }}>
            <span className="text-emboss">
              <Markdown inline>{c.passes_footnote}</Markdown>
            </span>
          </div>
        </div>
      </section>

      {/* Good to Know */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">{c.goodtoknow_title}</span>
          </h2>
          <div className="rounded-2xl p-6 text-sm leading-relaxed" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', color: '#999' }}>
            <Markdown>{c.goodtoknow_body}</Markdown>
          </div>
        </div>
      </section>

      {/* Schedule */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">{c.schedule_title}</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">{c.schedule_subtitle}</span>
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {SCHEDULE.map(day => (
              <div key={day.day} className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                <h3 className="mb-4 text-center text-sm font-bold uppercase tracking-wider text-white">{day.day}</h3>
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
            <span className="text-emboss">{c.categories_title}</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">{c.categories_subtitle}</span>
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {Object.entries(CONTEST_CATEGORIES).map(([day, categories]) => (
              <div key={day} className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                <h3 className="mb-4 text-center text-sm font-bold uppercase tracking-wider text-white">{day}</h3>
                <ul className="space-y-2.5">
                  {categories.map(cat => (
                    <li key={cat} className="flex items-start gap-2 text-xs" style={{ color: '#999' }}>
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
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
          <span className="text-emboss">{c.questions_title}</span>
        </p>
        <div className="text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">
            <Markdown inline>{c.questions_body}</Markdown>
          </span>
        </div>
      </div>
    </div>
  )
}
