'use client'

import PublicNav from '@/components/PublicNav'

const CRITERIA = [
  'Overall presentation and stage presence',
  'Authenticity and creativity of costume/styling',
  'Confidence and audience engagement',
  'Tattoo display and integration with look',
  'Audience response',
]

const JUDGES = [
  { name: 'Judge TBA', title: 'Head Judge', initials: 'TBA' },
  { name: 'Judge TBA', title: 'Guest Judge', initials: 'TBA' },
  { name: 'Judge TBA', title: 'Guest Judge', initials: 'TBA' },
]

const PRIZES = [
  { place: '1st Place - Miss AATC', prize: 'Custom Crown, Sash, Trophy + $500 Cash + Convention Feature' },
  { place: '2nd Place - 1st Runner-Up', prize: 'Trophy + $250 Cash' },
  { place: '3rd Place - 2nd Runner-Up', prize: 'Trophy + $100 Cash' },
]

export default function PinupContestClient({ entrySlot }: { entrySlot: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Vintage Glamour Meets Modern Ink</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Miss AATC Pinup Contest</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Celebrating beauty, confidence, and tattoo culture. The Miss AATC Pinup Contest is one of Saturday evening&apos;s marquee events, bringing vintage glamour and modern ink together on the main stage.</span>
        </p>
      </div>

      {/* Event Details + Entry Form - side by side */}
      <section className="px-4 py-12">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">

          {/* Left: Event Details + Prizes */}
          <div className="space-y-6">
            <div>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
                <span className="text-emboss">Event Details</span>
              </h2>
              <div
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div className="space-y-3">
                  {[
                    { label: 'When', value: 'Saturday, April 17 at 2:00 PM' },
                    { label: 'Where', value: 'Main Stage, Crown Complex Event Center' },
                    { label: 'Entry Fee', value: 'FREE', gold: true },
                    { label: 'Check-In', value: 'Backstage by 1:00 PM Saturday' },
                    { label: 'Eligibility', value: 'Must be 18 years or older' },
                  ].map(item => (
                    <div key={item.label} className="flex gap-3">
                      <span className="w-20 shrink-0 text-right text-xs font-bold" style={{ color: '#C4A882' }}>{item.label}</span>
                      <span className="text-xs font-bold" style={{ color: 'gold' in item && item.gold ? '#C4A882' : '#999' }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
                <span className="text-emboss">Prizes</span>
              </h2>
              <div className="space-y-2">
                {PRIZES.map(item => (
                  <div
                    key={item.place}
                    className="flex flex-col gap-1 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                  >
                    <span className="text-sm font-bold text-white">{item.place}</span>
                    <span className="text-xs" style={{ color: '#C4A882' }}>{item.prize}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* How to Enter */}
            <div>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
                <span className="text-emboss">How to Enter</span>
              </h2>
              <div
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div className="space-y-3 text-xs leading-relaxed" style={{ color: '#999' }}>
                  <p>
                    Entry is <strong style={{ color: '#C4A882' }}>FREE</strong>. Places are limited to 25 contestants and online registration comes first. If fewer than 25 register in advance, additional entries are taken at the contest table on the day.
                  </p>
                  <p>
                    Contestants should arrive backstage by 1:00 PM on Saturday for check-in and lineup coordination. The contest begins at 2:00 PM on the main stage.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Entry Form */}
          <div>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
              <span className="text-emboss">Entry Form</span>
            </h2>
            <div
              className="rounded-2xl p-6"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              {entrySlot}
              {/* INTERIM STATE - the submit path is deliberately removed.
                  The form that stood here recorded nothing: handleSubmit() waited
                  800ms and showed "You're Registered!" with no API route, no table
                  and no error path, so entrants were told they had a place in a
                  capped 25 person contest while nothing was stored anywhere.
                  Taken down ahead of the real intake (pinup_entries) rather than
                  left up, because a form that looks like it works is worse than no
                  form: it stops someone from registering by another route. */}
              <div className="py-8 text-center">
                <p className="text-lg font-bold text-white">Registration opens soon</p>
                <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed" style={{ color: '#999' }}>
                  Online entry for the Miss AATC Pinup Contest is not open yet. Check back
                  shortly - places are limited and will be filled in the order they are
                  received.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Presented By */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: '#666' }}>
            <span className="text-emboss">Presented By</span>
          </p>
          <div
            className="inline-flex flex-col items-center rounded-2xl px-10 py-8"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl"
              style={{ backgroundColor: '#111', border: '2px solid #2a2a2a' }}
            >
              <span className="text-lg font-bold" style={{ color: '#555' }}>TBA</span>
            </div>
            <p className="mt-3 text-sm font-bold text-white">Sponsor TBA</p>
            <p className="mt-1 text-xs" style={{ color: '#999' }}>
              Sponsor details will be announced closer to the event.
            </p>
          </div>
        </div>
      </section>

      {/* Judging Criteria + Judges */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Judging Criteria</span>
          </h2>

          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <ul className="space-y-2.5">
              {CRITERIA.map(item => (
                <li key={item} className="flex items-center gap-2 text-xs" style={{ color: '#999' }}>
                  <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <h2 className="mb-6 mt-10 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Meet the Judges</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            {JUDGES.map((judge, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-2xl p-6 text-center"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div
                  className="mb-3 flex h-16 w-16 items-center justify-center rounded-full text-sm font-bold"
                  style={{ backgroundColor: '#111', border: '2px solid #2a2a2a', color: '#555' }}
                >
                  {judge.initials}
                </div>
                <h3 className="text-sm font-bold text-white">{judge.name}</h3>
                <p className="mt-0.5 text-xs font-semibold" style={{ color: '#C4A882' }}>{judge.title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Questions about the Pinup Contest?</span>
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
