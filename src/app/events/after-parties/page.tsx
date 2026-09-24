import type { Metadata } from 'next'
import PublicNav from '@/components/PublicNav'
import PageImage from '@/components/PageImage'
import VenueCard from '@/components/VenueCard'
import { getAfterParties } from '@/lib/after-parties-data'
import { weekdaySlug } from '@/lib/venues'
import { CONTACT_EMAIL, EVENT_DATES_LABEL, EVENT_YEAR } from '@/lib/event-config'

// After parties are schedule_items rows (kind 'after_party', migration 070)
// joined to `venues`. Nights come from the data: a night with no published
// row does not render, a night whose row has no venue renders without venue
// details, and nothing on this page says "to be announced".
//
// History: until 2026-08-27 this page held invented venues, acts and door
// prices; then a hardcoded night list with "Venue and details to be
// announced". Both are gone. Venue facts live on the venues table and are
// edited at /admin/venues; times and publish state at /admin/schedule.

export const metadata: Metadata = {
  title: `After Parties | AATC ${EVENT_YEAR} | Fayetteville NC`,
  description: `Where the AATC ${EVENT_YEAR} crowd goes when the floor closes, ${EVENT_DATES_LABEL}: venues across Fayetteville, with the Thursday kickoff the night before doors open.`,
}

export default async function AfterPartiesPage() {
  const parties = await getAfterParties()

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
          <span className="text-emboss">When the convention floor closes, the night is just getting started. Join us at venues across Fayetteville for live music, drinks, and late-night celebrations with fellow tattoo lovers.</span>
        </p>
      </div>

      {/* Slot 'after-parties-hero'. Renders nothing until an admin uploads. */}
      <PageImage slug="after-parties-hero" className="mx-auto mt-8 max-w-3xl px-4" />

      {/* One card per published night. The per-night flyer slot (after-party-<weekday>)
          renders under the card when an admin has uploaded one. */}
      <main className="px-4 py-12">
        <div className="mx-auto max-w-4xl space-y-6">
          {parties.map(party => (
            <div key={party.id}>
              <VenueCard party={party} />
              <PageImage slug={weekdaySlug(party.day_date)} className="mt-3" />
            </div>
          ))}
        </div>
      </main>

      {/* Important Info */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <h2 className="mb-3 text-sm font-bold text-white">Important Information</h2>
            <ul className="space-y-2">
              {[
                'All after party venues are 21+ only. Valid government-issued ID is required at the door.',
                'After party venues are located around Fayetteville, approximately 10-15 minutes from the Crown Complex.',
                'Rideshare services are strongly encouraged. Please do not drink and drive.',
                'VIP 3-Day Pass holders receive complimentary entry to all three after parties.',
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
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#C4A882' }}>
            {CONTACT_EMAIL}
          </a></span>
        </p>
      </div>
    </div>
  )
}
