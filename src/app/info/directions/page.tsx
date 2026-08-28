'use client'

import PublicNav from '@/components/PublicNav'
import { VENUE_NAME, VENUE_STREET, VENUE_CITY, VENUE_STATE, VENUE_POSTAL } from '@/lib/event-config'

const DRIVING_DIRECTIONS = [
  {
    from: 'From I-95 (North or South)',
    steps: [
      'Take Exit 49B onto US-301 South / I-95 Business toward Fayetteville.',
      'Merge onto NC-24 West / Bragg Blvd.',
      'Continue on Bragg Blvd for approximately 5 miles.',
      'Turn left onto Coliseum Dr. The Crown Complex will be on your right.',
    ],
  },
  {
    from: 'From I-40 (East or West)',
    steps: [
      'Take I-40 to I-95 South (Exit 319).',
      'Follow I-95 South to Exit 49B onto US-301 South toward Fayetteville.',
      'Merge onto NC-24 West / Bragg Blvd.',
      'Continue on Bragg Blvd for approximately 5 miles.',
      'Turn left onto Coliseum Dr. The Crown Complex will be on your right.',
    ],
  },
]

const AIRPORT_INFO = [
  {
    name: 'Raleigh-Durham International Airport (RDU)',
    distance: 'Approximately 1 hour south via I-40 and I-95',
    details: 'RDU is the nearest major airport with extensive domestic and international flights. Rental cars, shuttles, and rideshare services are available for the drive south to Fayetteville.',
  },
  {
    name: 'Fayetteville Regional Airport (FAY)',
    distance: 'Approximately 15 minutes from the venue',
    details: 'FAY offers daily flights through American Airlines with connections via Charlotte (CLT) and Dallas-Fort Worth (DFW). The airport is the most convenient option for direct access to the convention.',
  },
]

export default function DirectionsPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Find Your Way</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Directions</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">The All American Tattoo Convention takes place at the Crown Complex Event Center in Fayetteville, North Carolina. Here is everything you need to get here.</span>
        </p>
      </div>

      {/* Venue Info */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">The Venue</span>
          </h2>
          <div
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            {/* ── §2.1 Venue photo ──────────────────────────────
                Renders nothing until public/images/venue/crown-complex.jpg
                exists - no broken-image icon, no reserved space (§0.8).
                Responsive and uncropped: the point is recognising the building
                on approach, so it must not be letterboxed on mobile. */}
            <img
              src="/images/venue/crown-complex.jpg"
              alt="Crown Complex, 1960 Coliseum Drive, Fayetteville, NC - home of the All American Tattoo Convention"
              width={1200}
              height={675}
              loading="lazy"
              className="mx-auto mb-6 h-auto w-full max-w-3xl rounded-xl object-contain"
              onError={e => { e.currentTarget.style.display = 'none' }}
            />

            <h3 className="text-xl font-bold text-white">{VENUE_NAME}</h3>
            {/* Address settled 2026-08-27: 1960 Coliseum Drive is the official Crown
                Complex / Expo Center address and what maps resolve. East Mountain
                Drive is an entrance, not an address - see the note in
                event-config.ts. Sourced from event-config so the site cannot
                disagree with itself; the turn-by-turn below already routed to
                Coliseum Dr and was correct. */}
            <p className="mt-2 text-sm" style={{ color: '#C4A882' }}>
              {VENUE_STREET}, {VENUE_CITY}, {VENUE_STATE} {VENUE_POSTAL}
            </p>
            <p className="mt-3 text-sm" style={{ color: '#999' }}>
              Located just minutes from Fort Bragg, the Crown Complex is one of the premier event venues in the Fayetteville region with over 100,000 square feet of flexible event space.
            </p>
            <div className="mt-6">
              <a
                href="https://share.google/vRhsv0xqNzDRTPtGC"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-lg px-6 py-3 text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-80"
                style={{ backgroundColor: '#8B7355' }}
              >
                Open in Google Maps
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Driving Directions */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Driving Directions</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Major highway routes to the Crown Complex</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {DRIVING_DIRECTIONS.map((route) => (
              <div
                key={route.from}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <h3 className="mb-4 text-sm font-bold text-white">{route.from}</h3>
                <ol className="space-y-3">
                  {route.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-xs" style={{ color: '#999' }}>
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: '#8B7355' }}
                      >
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Airport Information */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Airport Information</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Flying in? Two airports serve the Fayetteville area</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {AIRPORT_INFO.map((airport) => (
              <div
                key={airport.name}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <h3 className="text-sm font-bold text-white">{airport.name}</h3>
                <p className="mt-2 text-xs font-medium" style={{ color: '#C4A882' }}>
                  {airport.distance}
                </p>
                <p className="mt-3 text-xs leading-relaxed" style={{ color: '#999' }}>
                  {airport.details}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Parking & Rideshare */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Parking & Transportation</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div
              className="rounded-2xl p-6"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <h3 className="text-sm font-bold text-white">Parking</h3>
              <p className="mt-3 text-xs leading-relaxed" style={{ color: '#999' }}>
                Free parking is available at the Crown Complex with ample space for all attendees. Accessible parking spaces are located near the main entrance. Overflow parking is available in adjacent lots during peak hours on Saturday.
              </p>
            </div>
            <div
              className="rounded-2xl p-6"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <h3 className="text-sm font-bold text-white">Rideshare & Taxi</h3>
              <p className="mt-3 text-xs leading-relaxed" style={{ color: '#999' }}>
                Uber and Lyft are both active in the Fayetteville area. The designated rideshare pickup and drop-off zone is located at the main entrance of the Crown Complex. Local taxi services are also available - ask the front desk at your hotel for recommended companies.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Need more help getting here?</span>
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
