'use client'

import PublicNav from '@/components/PublicNav'

const PARTIES = [
  {
    night: 'Friday Night',
    date: 'Friday, April 16',
    title: 'Ink After Dark: Opening Night Party',
    time: '10:30 PM - 2:00 AM',
    venue: 'The Bunker Bar & Lounge',
    address: 'Downtown Fayetteville, NC',
    description: 'Kick off the convention weekend with the official opening night party. Live DJ sets, drink specials, and a crowd full of tattoo enthusiasts ready to celebrate. This is where the weekend really begins.',
    entertainment: [
      'DJ Razorblade spinning hip-hop, rock, and metal',
      'Drink specials all night',
      'Free entry for VIP 3-Day Pass holders',
      'Convention artist meet & mingle',
    ],
    cover: '$10 at the door / Free with VIP Pass',
  },
  {
    night: 'Saturday Night',
    date: 'Saturday, April 17',
    title: 'Main Event: Saturday Night Throwdown',
    time: '10:30 PM - 2:00 AM',
    venue: 'The Hangar Event Space',
    address: 'Downtown Fayetteville, NC',
    description: 'The biggest night of the weekend. Live bands, a packed house, and the energy of a full day of tattooing and contests still buzzing in the air. This is the party everyone talks about.',
    entertainment: [
      'Live performance by Iron Serpent (metal/rock)',
      'Opening set by The Devil\'s Handshake',
      'Full bar with craft cocktail specials',
      'Photo booth with convention backdrop',
      'Midnight raffle with tattoo session giveaways',
    ],
    cover: '$15 at the door / $10 with convention wristband / Free with VIP Pass',
  },
  {
    night: 'Sunday Night',
    date: 'Sunday, April 18',
    title: 'Closing Night: The Last Drop',
    time: '8:00 PM - 12:00 AM',
    venue: 'Yadkin Tap House',
    address: 'Downtown Fayetteville, NC',
    description: 'A more relaxed closing night celebration. Raise a glass with the artists and attendees you have spent the weekend with. Acoustic sets, cold drinks, and good conversation to cap off an unforgettable weekend.',
    entertainment: [
      'Acoustic performances by local artists',
      'Convention award winner recognition',
      'Casual atmosphere with outdoor patio seating',
      'Drink specials for convention attendees',
    ],
    cover: '$5 at the door / Free with convention wristband',
  },
]

export default function AfterPartiesPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">The Ink Doesn&apos;t Stop at Night</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">After Parties</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">When the convention floor closes, the night is just getting started. Join us at venues across downtown Fayetteville for live music, drinks, and late-night celebrations with fellow tattoo lovers.</span>
        </p>
      </div>

      {/* Party Cards */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl space-y-6">
          {PARTIES.map(party => (
            <div
              key={party.night}
              className="rounded-2xl p-6"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span
                  className="rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wider text-white"
                  style={{ backgroundColor: '#8B7355' }}
                >
                  {party.night}
                </span>
                <span className="text-xs" style={{ color: '#666' }}>{party.date}</span>
              </div>

              <h3 className="text-xl font-bold text-white">{party.title}</h3>

              <div className="mt-3 flex flex-wrap gap-4">
                <span className="text-xs" style={{ color: '#C4A882' }}>{party.time}</span>
                <span className="text-xs" style={{ color: '#999' }}>{party.venue}</span>
                <span className="text-xs" style={{ color: '#666' }}>{party.address}</span>
              </div>

              <p className="mt-4 text-sm leading-relaxed" style={{ color: '#999' }}>
                {party.description}
              </p>

              <div className="mt-5">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#666' }}>
                  What to Expect
                </p>
                <ul className="space-y-1.5">
                  {party.entertainment.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#999' }}>
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div
                className="mt-5 rounded-lg px-4 py-2.5"
                style={{ backgroundColor: '#2a2a2a' }}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#666' }}>Cover: </span>
                <span className="text-xs" style={{ color: '#C4A882' }}>{party.cover}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Important Info */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <h3 className="mb-3 text-sm font-bold text-white">Important Information</h3>
            <ul className="space-y-2">
              {[
                'All after party venues are 21+ only. Valid government-issued ID is required at the door.',
                'After party venues are located in downtown Fayetteville, approximately 10-15 minutes from the Crown Complex.',
                'Rideshare services are strongly encouraged. Please do not drink and drive.',
                'VIP 3-Day Pass holders receive complimentary entry to all three after parties.',
                'Venue details and addresses will be announced closer to the event date.',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#999' }}>
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Want to sponsor an after party?</span>
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
