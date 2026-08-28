'use client'

import PublicNav from '@/components/PublicNav'

// REMOVED 2026-08-27: this held three invented venues (one of which names a
// real Fayetteville business that has not agreed to host), invented DJ and band
// names, and door prices - "$10 at the door / Free with VIP Pass" is a pricing
// promise the show would have had to honor, the same class of error as the
// fabricated hotel rates.
//
// Venues are not confirmed. Per §3.4 there is no hardcoded day list here or on
// the homepage: both render whatever published rows exist, grouped by day, and
// a day with no rows does not render at all.
const PARTIES: {
  night: string
  date: string
  title: string
  time: string
  venue: string
  address: string
  description: string
  entertainment: string[]
  cover: string
}[] = []

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
          {PARTIES.length === 0 && (
            <div
              className="rounded-2xl px-6 py-10 text-center"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <p className="text-sm" style={{ color: '#999' }}>
                After-party venues for {'2027'} are being finalized. Nights, venues and
                cover will be posted here once they are confirmed.
              </p>
            </div>
          )}
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
