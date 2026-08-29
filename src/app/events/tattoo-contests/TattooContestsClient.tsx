'use client'

import type React from 'react'

import Link from 'next/link'
import PublicNav from '@/components/PublicNav'
import { CONTEST_ENTRY_FEE_NOTE } from '@/lib/event-config'

/**
 * The real 2027 category list - 49 categories, from the source graphic
 * (spec §6.4). What was here before was six invented categories per day with
 * names that do not exist ("Best Biomechanical", "People's Choice").
 *
 * TEMPORARY HOME. §16.10 moves these into the database, because contest
 * registration, entry records and judging all need to reference a category by
 * ID. They are inlined here only so the page stops showing the wrong list
 * today - the copy fix ships ahead of the schema work, per §0.2. When the
 * table lands this constant is deleted, not synchronised.
 *
 * DAY ASSIGNMENTS ARE UNCONFIRMED - the source graphic is titled "2026 AATC
 * East" and §17.2 asks Ryan to confirm the Fri/Sat/Sun splits carry over
 * before registration is wired to them.
 */
const CATEGORIES: Record<string, string[]> = {
  'Friday, April 16': [
    'Large Color Tattoo',
    'Small Color Tattoo',
    'Large Black & Gray Tattoo',
    'Small Black & Gray Tattoo',
    'Best Military Tattoo',
    'American Pride Tattoo',
    'Best Geometric / Dotwork',
    'Best Asian Inspired Tattoo',
    'Best Hand Tattoo',
    'Best Neck / Face Tattoo',
    'Best Cover Up Tattoo',
    'Tattoo of the Day - Black & Gray',
    'Tattoo of the Day - Color',
  ],
  'Saturday, April 17': [
    'Large Color Tattoo',
    'Small Color Tattoo',
    'Large Black & Gray Tattoo',
    'Small Black & Gray Tattoo',
    'Best Lettering Tattoo',
    'Best American Traditional',
    'Best Neotraditional Tattoo',
    'Best Watercolor Tattoo',
    'Best Small Color Portrait',
    'Best Large Color Portrait',
    'Small Black & Gray Portrait',
    'Large Black & Gray Portrait',
    'Best Back Piece',
    'Best Arm Sleeve',
    'Best Leg Sleeve',
    'Best Chest Piece',
    'Best Overall Male',
    'Best Overall Female',
    'Tattoo of the Day - Black & Gray',
    'Tattoo of the Day - Color',
  ],
  'Sunday, April 18': [
    'Large Color Tattoo',
    'Small Color Tattoo',
    'Large Black & Gray Tattoo',
    'Small Black & Gray Tattoo',
    'Best Tattoo by a Veteran',
    'Best Comic / Superhero',
    'Best Anime Tattoo',
    'Best Disney Themed Tattoo',
    'Most Unusual Tattoo',
    'Best Tattooed Flesh (Fake Skin)',
    'Best Original Flash',
    'Best Temporary Tattoo (Kids)',
    'Tattoo of the Day - Black & Gray',
    'Tattoo of the Day - Color',
    'Best in Show - Black & Gray',
    'Best in Show - Color',
  ],
}

/**
 * §6.3. Four of the eight rules previously on this page were wrong, and two of
 * them were wrong in a way that would have cost an entrant money:
 *
 * - "may only be entered in one category per day" - there is NO limit.
 *     Someone reading that enters once instead of five times.
 * - "AATC reserves the right to reassign entries to a more appropriate
 *     category" - admins never move an entry after submission.
 * - the under-18 rule implied minors could enter with a guardian present.
 *     They cannot; the only exception is the Kids' Temporary Tattoo Contest.
 * - entries had to be "done at the convention or healed work" - fresh or
 *     healed is fine, except for Tattoo of the Day and Best in Show.
 *
 * Numbering is positional in the render, so the list renumbers itself.
 */
const RULES = [
  'All tattoos entered can be fresh or healed work, with the exception of Tattoo of the Day and Best in Show.',
  'Contestants must be present during judging to be eligible for awards.',
  'Each entry must be registered and paid for before the contest begins.',
  'There is no limit on the number of categories you may enter.',
  'Judges decisions are final. No appeals or disputes will be entertained.',
  'By entering, you consent to having your tattoo photographed for AATC promotional purposes.',
  "Contestants must be 18 or older to enter the tattoo contests. The only exception is the Kids' Temporary Tattoo Contest, which is free to enter and takes place on Sunday.",
]

/**
 * Emptied. The four entries here were named "Judge TBA" but carried invented
 * biographies - "Award-winning tattoo artist with over 20 years", "multiple
 * Best of Show winner". Placeholder names with real-sounding credentials are
 * still fabrication, and this is a page artists decide whether to enter based
 * on who is judging.
 *
 * §6.5 makes judges admin-editable via a shared `judges` table (§16.5), also
 * serving the pin-up contest. Until then the section renders an honest
 * "to be announced".
 */
const JUDGES: { name: string; title: string; bio: string; initials: string }[] = []


const SPONSORS = [
  { name: 'Sponsor TBA', initials: 'S1' },
  { name: 'Sponsor TBA', initials: 'S2' },
  { name: 'Sponsor TBA', initials: 'S3' },
  { name: 'Sponsor TBA', initials: 'S4' },
  { name: 'Sponsor TBA', initials: 'S5' },
  { name: 'Sponsor TBA', initials: 'S6' },
]

export default function TattooContestsClient({ prizesSlot }: { prizesSlot: React.ReactNode }) {
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
            Vote Now - Tattoo Collectors Award
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
              { step: '1', title: 'Register at the Contest Booth', desc: 'Visit the contest registration booth located near the main stage. Registration opens at 1:00 PM each day; judging begins at 4:00 PM.' },
              { step: '2', title: 'Pay the Entry Fee', desc: `${CONTEST_ENTRY_FEE_NOTE} Cash and card accepted at the booth.` },
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
                { day: 'Friday', time: 'Registration 1:00 PM / Judging 4:00 PM' },
                { day: 'Saturday', time: 'Registration 1:00 PM / Judging 4:00 PM' },
                { day: 'Sunday', time: 'Registration 1:00 PM / Judging 4:00 PM' },
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

          {JUDGES.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {JUDGES.map((judge, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center rounded-2xl p-6 text-center"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                >
                  <div
                    className="mb-3 flex h-14 w-14 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: '#2a2a2a' }}
                  >
                    {judge.initials}
                  </div>
                  <h3 className="text-sm font-bold text-white">{judge.name}</h3>
                  <p className="mt-0.5 text-[11px]" style={{ color: '#C4A882' }}>{judge.title}</p>
                  <p className="mt-2 text-xs leading-relaxed" style={{ color: '#999' }}>{judge.bio}</p>
                </div>
              ))}
            </div>
          ) : (
            /* Honest empty state rather than placeholder cards with invented
               credentials. No reserved blank space (§0.8). */
            <div
              className="rounded-2xl p-6 text-center"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <p className="text-sm" style={{ color: '#999' }}>Judges to be announced.</p>
            </div>
          )}
        </div>
      </section>

      {/* Prizes */}
      {prizesSlot}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Prizes</span>
          </h2>

          <div
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <p className="text-sm leading-relaxed" style={{ color: '#bbb' }}>
              Prizes are the same across all daily contest categories.{' '}
              <strong className="text-white">Tattoo of the Day</strong> and{' '}
              <strong className="text-white">Best in Show</strong> receive additional prizes
              from our sponsors.
            </p>
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
