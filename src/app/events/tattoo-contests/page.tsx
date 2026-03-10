'use client'

import Link from 'next/link'
import PublicNav from '@/components/PublicNav'

const CATEGORIES: Record<string, string[]> = {
  'Friday, April 16': [
    'Best Black & Grey',
    'Best Color',
    'Best Traditional',
    'Best Neo-Traditional',
    'Best Realism',
    'Best Small Tattoo',
  ],
  'Saturday, April 17': [
    'Best Portrait',
    'Best Japanese',
    'Best Lettering / Script',
    'Best Biomechanical',
    'Best Watercolor',
    'Best Cover-Up',
  ],
  'Sunday, April 18': [
    'Best Sleeve',
    'Best Back Piece',
    'Best Leg Piece',
    'Best of Day',
    'Best of Show',
    "People's Choice",
  ],
}

const RULES = [
  'All tattoos entered must have been done at the convention or be healed work brought in for judging.',
  'Contestants must be present during judging to be eligible for awards.',
  'Each entry must be registered and paid for before the registration deadline for that day.',
  'Tattoos may only be entered in one category per day unless otherwise specified.',
  'Judges decisions are final. No appeals or disputes will be entertained.',
  'By entering, you consent to having your tattoo photographed for AATC promotional purposes.',
  'Contestants under 18 must have a parent or legal guardian present.',
  'AATC reserves the right to reassign entries to a more appropriate category at the judges discretion.',
]

const JUDGES = [
  { name: 'Judge TBA', title: 'Head Judge', bio: 'Award-winning tattoo artist with over 20 years of experience. Featured on multiple television tattoo programs.', initials: 'TBA' },
  { name: 'Judge TBA', title: 'Guest Judge', bio: 'Internationally recognized for realism and portrait work. Convention circuit veteran and multiple Best of Show winner.', initials: 'TBA' },
  { name: 'Judge TBA', title: 'Guest Judge', bio: 'Specializing in Japanese and traditional styles. Owner of a renowned tattoo studio and industry educator.', initials: 'TBA' },
  { name: 'Judge TBA', title: 'Guest Judge', bio: 'Known for innovative color work and neo-traditional designs. Published artist and brand ambassador.', initials: 'TBA' },
]

const PRIZES = [
  { place: '1st Place (per category)', award: 'Custom Trophy + $200 Cash + Sponsor Prize Pack' },
  { place: '2nd Place (per category)', award: 'Custom Trophy + $100 Cash + Sponsor Prize Pack' },
  { place: '3rd Place (per category)', award: 'Custom Trophy + Sponsor Prize Pack' },
  { place: 'Best of Day', award: 'Custom Trophy + $500 Cash + Sponsor Prize Pack' },
  { place: 'Best of Show', award: 'Custom Trophy + $1,000 Cash + Feature in Convention Media' },
  { place: "People's Choice", award: 'Custom Trophy + $250 Cash' },
]

const SPONSORS = [
  { name: 'Sponsor TBA', initials: 'S1' },
  { name: 'Sponsor TBA', initials: 'S2' },
  { name: 'Sponsor TBA', initials: 'S3' },
  { name: 'Sponsor TBA', initials: 'S4' },
  { name: 'Sponsor TBA', initials: 'S5' },
  { name: 'Sponsor TBA', initials: 'S6' },
]

export default function TattooContestsPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Compete for the Best Ink</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Tattoo Contests</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Show off your ink and compete against the best at the All American Tattoo Convention. Contests run all three days with categories judged by a panel of professional tattoo artists from across the country.</span>
        </p>
      </div>

      {/* Vote CTA */}
      <section className="px-4 py-10">
        <div className="mx-auto max-w-md text-center">
          <p className="mb-3 text-sm font-medium" style={{ color: '#999' }}>
            <span className="text-emboss">Vote for your favorite tattoos in the Tattoo Collectors Award</span>
          </p>
          <Link
            href="/contests"
            className="inline-flex items-center gap-3 rounded-xl px-10 py-4 text-base font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#8B7355' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>
            Vote Now — Tattoo Collectors Award
          </Link>
        </div>
      </section>

      {/* Categories by Day */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Contest Categories by Day</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Six categories judged each day. Enter as many categories as you qualify for.</span>
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {Object.entries(CATEGORIES).map(([day, categories]) => (
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

      {/* How to Enter */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">How to Enter</span>
          </h2>

          <div className="space-y-4">
            {[
              { step: '1', title: 'Register at the Contest Booth', desc: 'Visit the contest registration booth located near the main stage. Registration opens two hours before judging begins each day.' },
              { step: '2', title: 'Pay the Entry Fee', desc: 'Entry is $10 per category. You may enter multiple categories if your tattoo qualifies. Cash and card accepted at the booth.' },
              { step: '3', title: 'Get Judged', desc: 'Report to the judging area at the scheduled time. Our panel of professional artists will evaluate each entry based on technical execution, creativity, and overall impact.' },
              { step: '4', title: 'Attend the Awards', desc: 'Winners are announced on stage following each judging session. You must be present to accept your award.' },
            ].map(item => (
              <div
                key={item.step}
                className="flex gap-4 rounded-2xl p-5"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: '#8B7355' }}
                >
                  {item.step}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{item.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: '#999' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="mt-6 rounded-2xl p-5"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <h3 className="mb-3 text-sm font-bold text-white">Judging Times</h3>
            <div className="space-y-2">
              {[
                { day: 'Friday', time: 'Registration 6:00 PM / Judging 8:00 PM' },
                { day: 'Saturday', time: 'Registration 3:00 PM / Judging 5:00 PM' },
                { day: 'Sunday', time: 'Registration 2:00 PM / Judging 4:00 PM' },
              ].map(d => (
                <div key={d.day} className="flex gap-3">
                  <span className="w-28 shrink-0 text-right text-xs font-medium" style={{ color: '#C4A882' }}>{d.day}</span>
                  <span className="text-xs" style={{ color: '#999' }}>{d.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contest Rules */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Contest Rules</span>
          </h2>

          <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <ol className="space-y-3">
              {RULES.map((rule, i) => (
                <li key={i} className="flex gap-3 text-xs leading-relaxed" style={{ color: '#999' }}>
                  <span className="shrink-0 font-bold" style={{ color: '#C4A882' }}>{i + 1}.</span>
                  {rule}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Judges */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Meet the Judges</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Our panel of industry professionals will be announced closer to the event.</span>
          </p>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {JUDGES.map((judge, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-2xl p-6 text-center"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div
                  className="mb-4 flex h-20 w-20 items-center justify-center rounded-full text-lg font-bold"
                  style={{ backgroundColor: '#111', border: '2px solid #2a2a2a', color: '#555' }}
                >
                  {judge.initials}
                </div>
                <h3 className="text-sm font-bold text-white">{judge.name}</h3>
                <p className="mt-0.5 text-xs font-semibold" style={{ color: '#C4A882' }}>{judge.title}</p>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: '#999' }}>{judge.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Prizes */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Prizes</span>
          </h2>

          <div className="space-y-3">
            {PRIZES.map(prize => (
              <div
                key={prize.place}
                className="flex flex-col gap-1 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <span className="text-sm font-bold text-white">{prize.place}</span>
                <span className="text-xs" style={{ color: '#C4A882' }}>{prize.award}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Prize Sponsors */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Prize Sponsors</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Thank you to these brands for providing products and prizes to our contest winners.</span>
          </p>

          <div className="flex flex-wrap justify-center gap-6">
            {SPONSORS.map((sponsor, i) => (
              <div key={i} className="flex flex-col items-center">
                <div
                  className="flex h-24 w-24 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                >
                  <span className="text-lg font-bold" style={{ color: '#555' }}>{sponsor.initials}</span>
                </div>
                <p className="mt-2 text-xs font-medium" style={{ color: '#666' }}>{sponsor.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom Vote CTA */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-md text-center">
          <h2 className="mb-2 font-display text-xl font-bold text-white"><span className="text-emboss">Tattoo Collectors Award</span></h2>
          <p className="mb-5 text-sm" style={{ color: '#999' }}>
            <span className="text-emboss">Can&apos;t make it to the convention? You can still participate by voting for your favorite tattoos online.</span>
          </p>
          <Link
            href="/contests"
            className="inline-flex items-center gap-3 rounded-xl px-10 py-4 text-base font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#8B7355' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>
            Vote Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Questions about the contests?</span>
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
