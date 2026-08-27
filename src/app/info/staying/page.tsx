'use client'

import PublicNav from '@/components/PublicNav'

const TIPS = [
  {
    title: 'What to Bring',
    items: [
      'Valid photo ID (required for alcohol service and age verification)',
      'Cash and cards — most artists and vendors accept both',
      'Reference photos if you plan to get tattooed',
      'Comfortable clothing that allows access to the area being tattooed',
      'A light jacket — convention halls can be cool',
    ],
  },
  {
    title: 'Dress Code',
    items: [
      'There is no formal dress code — wear what makes you comfortable',
      'Wear clothing you do not mind getting ink on if you are getting tattooed',
      'Comfortable shoes are highly recommended — there is a lot to see and the venue is large',
      'Show off your existing ink with pride',
      'Entering a tattoo contest? Wear something that lets you show the tattoo easily. Judges need clear access to the piece, and you don\'t want to be wrestling with a sleeve at the judging table.',
    ],
  },
  {
    title: 'Getting Tattooed',
    items: [
      'Eat a full meal before your session — do not get tattooed on an empty stomach',
      'Stay hydrated throughout the day',
      'Avoid alcohol before and during your tattoo session',
      'Bring a deposit if you have a pre-booked appointment with an artist',
      'Walk-ins are welcome at most booths, but popular artists may book up quickly',
    ],
  },
]

const NEARBY = [
  {
    category: 'Restaurants',
    spots: [
      { name: "Uptown's Chicken and Waffles", desc: '' },
      { name: "Sammio's Italian Restaurant", desc: '' },
      { name: "Chris's Steakhouse", desc: '' },
      { name: "Luigi's Italian Restaurant", desc: '' },
      { name: 'Dad Bod District', desc: '' },
    ],
  },
  {
    category: 'Entertainment',
    spots: [
      { name: 'Airborne & Special Operations Museum', desc: 'Free museum honoring the history of airborne and special operations forces. A must-visit.' },
      { name: 'Downtown Fayetteville', desc: 'Explore local shops, galleries, and nightlife in the revitalized downtown district.' },
      { name: 'ZipQuest Waterfall & Treetop Adventure', desc: 'Outdoor zipline adventure through the forest canopy near Carvers Falls.' },
      { name: 'Fort Bragg Area', desc: 'Explore the military heritage of the region with guided tours and monuments.' },
      { name: 'Group Therapy', desc: 'Skibo Road, Fayetteville.' },
    ],
  },
]

export default function StayingPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Plan Your Stay</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Staying with AATC</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Make the most of your convention weekend. Here is where to stay, where to eat, and what to know before you arrive.</span>
        </p>
      </div>

      {/* ── Where to Stay (spec §1.1) ──────────────────────────
          REPLACED "Partner Hotels" AND "How to Book Your AATC Rate".
          Those sections listed three named hotels with specific nightly rates
          and an "AATC RATE" badge. None of it was real — there is no room
          block and no negotiated rate, so the page was quoting prices AATC
          cannot honour and sending people to ask hotels for a discount that
          does not exist.

          Kept structurally separate so a genuine host hotel can be added later
          without rebuilding the section. */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Where to Stay</span>
          </h2>
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <p className="text-sm leading-relaxed" style={{ color: '#bbb' }}>
              Fayetteville is a military town, which means hotel group rates aren&apos;t the
              bargain they are in most convention cities — the local market is already priced
              for constant government and military travel. For that reason we don&apos;t
              negotiate a room block.
            </p>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: '#bbb' }}>
              We&apos;d suggest looking at Airbnb or Expedia for your stay in the Fayetteville
              / Fort Bragg area this April.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="https://www.airbnb.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#8B7355' }}
              >
                Search Airbnb
              </a>
              <a
                href="https://www.expedia.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors"
                style={{ border: '1px solid #2a2a2a', color: '#C4A882' }}
              >
                Search Expedia
              </a>
            </div>
          </div>
        </div>
      </section>


      {/* Tips for the Weekend */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Tips for the Weekend</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Everything you need to know before you arrive</span>
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {TIPS.map((section) => (
              <div
                key={section.title}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <h3 className="mb-4 text-sm font-bold text-white">{section.title}</h3>
                <ul className="space-y-2.5">
                  {section.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#999' }}>
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Nearby Restaurants & Entertainment */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Beyond the Convention</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Restaurants and entertainment near the venue</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {NEARBY.map((section) => (
              <div
                key={section.category}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
                  {section.category}
                </h3>
                <div className="space-y-4">
                  {section.spots.map((spot) => (
                    <div key={spot.name}>
                      <p className="text-xs font-bold" style={{ color: '#C4A882' }}>{spot.name}</p>
                      {/* Descriptions are optional — the five restaurants in §1.2
                          were given as names only, and an empty <p> would leave a
                          ragged gap under half the list. */}
                      {spot.desc && (
                        <p className="mt-1 text-xs" style={{ color: '#999' }}>{spot.desc}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Questions about accommodations?</span>
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
