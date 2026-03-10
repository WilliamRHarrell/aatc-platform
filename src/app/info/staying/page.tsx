'use client'

import PublicNav from '@/components/PublicNav'

const PARTNER_HOTELS = [
  {
    name: 'Holiday Inn Fayetteville - Fort Liberty',
    distance: '0.5 miles from venue',
    rate: '$109/night',
    amenities: ['Free breakfast', 'Indoor pool', 'Free parking', 'Shuttle to Crown Complex'],
    partner: true,
  },
  {
    name: 'Hampton Inn & Suites Fayetteville',
    distance: '1.2 miles from venue',
    rate: '$119/night',
    amenities: ['Free hot breakfast', 'Fitness center', 'Free Wi-Fi', 'Pet-friendly'],
    partner: true,
  },
  {
    name: 'Fairfield Inn & Suites by Marriott',
    distance: '2.0 miles from venue',
    rate: '$99/night',
    amenities: ['Complimentary breakfast', 'Outdoor pool', 'Free parking', 'Business center'],
    partner: true,
  },
]

const TIPS = [
  {
    title: 'What to Bring',
    items: [
      'Valid photo ID (required for alcohol service and age verification)',
      'Cash and cards — most artists and vendors accept both',
      'Reference photos if you plan to get tattooed',
      'Comfortable clothing that allows access to the area being tattooed',
      'Snacks and a water bottle (concessions are also available on site)',
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
      { name: 'Huske Hardware House', desc: 'Brewpub and restaurant in a restored 1903 hardware store in downtown Fayetteville.' },
      { name: 'Hilltop House Restaurant', desc: 'Upscale dining with Southern cuisine and a popular weekend brunch.' },
      { name: 'Luigi\'s Italian Restaurant', desc: 'Local favorite for authentic Italian food, just minutes from the Crown Complex.' },
      { name: 'Mash House Brewing', desc: 'Craft brewery with a full menu of American favorites and house-brewed beers.' },
    ],
  },
  {
    category: 'Entertainment',
    spots: [
      { name: 'Airborne & Special Operations Museum', desc: 'Free museum honoring the history of airborne and special operations forces. A must-visit.' },
      { name: 'Downtown Fayetteville', desc: 'Explore local shops, galleries, and nightlife in the revitalized downtown district.' },
      { name: 'ZipQuest Waterfall & Treetop Adventure', desc: 'Outdoor zipline adventure through the forest canopy near Carvers Falls.' },
      { name: 'Fort Liberty Area', desc: 'Explore the military heritage of the region with guided tours and monuments.' },
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
          <span className="text-emboss">Make the most of your convention weekend. We have partnered with local hotels to offer exclusive rates for AATC attendees, and put together tips to help you plan the perfect trip.</span>
        </p>
      </div>

      {/* Partner Hotels */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Partner Hotels</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Exclusive rates for AATC attendees</span>
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {PARTNER_HOTELS.map((hotel) => (
              <div
                key={hotel.name}
                className="relative rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                {hotel.partner && (
                  <div
                    className="absolute right-4 top-4 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: '#8B7355', color: '#fff' }}
                  >
                    AATC Rate
                  </div>
                )}
                <h3 className="pr-20 text-sm font-bold text-white">{hotel.name}</h3>
                <p className="mt-1 text-xs" style={{ color: '#C4A882' }}>{hotel.distance}</p>
                <p className="mt-3 font-display text-2xl font-bold" style={{ color: '#C4A882' }}>
                  {hotel.rate}
                </p>
                <ul className="mt-4 space-y-2">
                  {hotel.amenities.map((amenity) => (
                    <li key={amenity} className="flex items-center gap-2 text-xs" style={{ color: '#999' }}>
                      <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                      {amenity}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Booking Instructions */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">How to Book Your AATC Rate</span>
          </h2>
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <div className="space-y-4">
              <div className="flex gap-3">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: '#8B7355' }}
                >
                  1
                </span>
                <p className="text-sm" style={{ color: '#999' }}>
                  Call the hotel directly or visit their website and navigate to the reservations page.
                </p>
              </div>
              <div className="flex gap-3">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: '#8B7355' }}
                >
                  2
                </span>
                <p className="text-sm" style={{ color: '#999' }}>
                  Select your check-in and check-out dates (April 15-19, 2027 for the full convention weekend).
                </p>
              </div>
              <div className="flex gap-3">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: '#8B7355' }}
                >
                  3
                </span>
                <div>
                  <p className="text-sm" style={{ color: '#999' }}>
                    Enter the group discount code when prompted:
                  </p>
                  <p
                    className="mt-2 inline-block rounded-lg px-4 py-2 text-sm font-bold tracking-wider text-white"
                    style={{ backgroundColor: '#2a2a2a', border: '1px solid #8B7355' }}
                  >
                    AATC2027
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: '#8B7355' }}
                >
                  4
                </span>
                <p className="text-sm" style={{ color: '#999' }}>
                  The discounted AATC rate will be applied automatically. Book early — rooms in the block are limited and go fast.
                </p>
              </div>
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
                      <p className="mt-1 text-xs" style={{ color: '#999' }}>{spot.desc}</p>
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
