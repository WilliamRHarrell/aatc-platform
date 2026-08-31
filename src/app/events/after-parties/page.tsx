'use client'

import PublicNav from '@/components/PublicNav'
import PageImage from '@/components/PageImage'
import { AFTER_PARTIES } from '@/lib/homepage-content'

// REMOVED 2026-08-27: this held three invented venues (one of which names a
// real Fayetteville business that has not agreed to host), invented DJ and band
// names, and door prices - "$10 at the door / Free with VIP Pass" is a pricing
// promise the show would have had to honor, the same class of error as the
// fabricated hotel rates.
//
// Venues are not confirmed. Per §3.4 there is no hardcoded day list here or on
// the homepage: both render whatever published rows exist, grouped by day, and
// a day with no rows does not render at all.

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

      {/* Slot 'after-parties-hero'. Renders nothing until an admin uploads. */}
      <PageImage slug="after-parties-hero" className="mx-auto mt-8 max-w-3xl px-4" />

      {/* Party Cards - NIGHTS ONLY.
          Thursday, Friday and Saturday are confirmed. Venue, act, door price and
          start time are NOT: the last set of those on this page was invented and
          was removed, so nothing goes back until Ryan confirms it. Read from the
          same AFTER_PARTIES constant the homepage uses, so the two cannot drift.
      */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl space-y-6">
          {AFTER_PARTIES.map(party => (
            <div
              key={party.night}
              className="rounded-2xl p-6"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-display text-xl font-bold text-white">
                  <span className="text-emboss">{party.night}</span>
                </h2>
                <span className="text-sm" style={{ color: '#C4A882' }}>{party.date}</span>
                {party.preConvention && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: 'rgba(196,168,130,0.15)', color: '#C4A882' }}
                  >
                    Before the convention opens
                  </span>
                )}
              </div>

              {party.preConvention && (
                <p className="mt-2 text-xs leading-relaxed" style={{ color: '#999' }}>
                  The convention itself runs Friday to Sunday, April 16-18. This night is a
                  kickoff the evening before the doors open, so plan your travel accordingly
                  if you want to be there.
                </p>
              )}

              <PageImage slug={party.imageSlug} className="mt-4" />

              <p className="mt-3 text-xs" style={{ color: '#666' }}>
                Venue and details to be announced.
              </p>
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
