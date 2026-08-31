import type { Metadata } from 'next'
import Link from 'next/link'
import PublicNav from '@/components/PublicNav'
import PageGallery from '@/components/PageGallery'
import Markdown from '@/components/Markdown'
import { getContent } from '@/content/getContent'

// Kids Temp Tattoo Contest.
//
// Route is /events/kids-contest so it matches the page_galleries slug
// 'kids-contest'. The nav label reads "Kids Temp Tattoo Contest" - Ryan's
// phrasing - but a route and a gallery slug that disagree is a trap for whoever
// wires the next one.
//
// Prose comes from page_content via the 'kidsContest' registry entry rather than
// a new table: two editable fields do not justify one, and this is the same
// shape as /contests and /tickets already use.
//
// NO CLOCK TIME ANYWHERE ON THIS PAGE, and that is the accurate answer rather
// than a gap. Categories run concurrently and are called live by the announcer,
// so there is no time to publish. The page says how it works instead, because
// silence about timing reads as information the visitor failed to find.

export const metadata: Metadata = {
  title: 'Kids Temp Tattoo Contest | AATC 2027 | Fayetteville NC',
  description:
    'The one AATC contest open to under-18s. Kids show off a temporary tattoo on the main stage on Sunday. Free to enter, register at the contest booth.',
}

export default async function KidsContestPage() {
  const c = await getContent('kidsContest')

  return (
    <div className="min-h-screen">
      <PublicNav />

      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">{c.hero_kicker}</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">{c.hero_title}</span>
        </h1>
        <div className="mx-auto mt-2 max-w-xl text-sm" style={{ color: '#999' }}>
          <Markdown inline>{c.hero_intro}</Markdown>
        </div>
      </div>

      {/* Key facts. Free and Sunday are confirmed; the under-18 exception is the
          same rule stated on /events/tattoo-contests, linked below so the two
          cannot drift apart unnoticed. */}
      <section className="px-4 py-10">
        <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-3">
          {[
            { label: 'Day', value: 'Sunday' },
            { label: 'Entry', value: 'Free' },
            { label: 'Ages', value: 'Under 18' },
          ].map(f => (
            <div key={f.label} className="rounded-2xl p-5 text-center" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              <p className="text-xs uppercase tracking-wider" style={{ color: '#999' }}>{f.label}</p>
              <p className="mt-1 text-lg font-bold" style={{ color: '#C4A882' }}>{f.value}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-6 max-w-3xl rounded-2xl p-6 text-sm" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', color: '#999' }}>
          <Markdown inline>{c.when_note}</Markdown>
        </div>
      </section>

      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">How to Enter</span>
          </h2>
          <div className="rounded-2xl p-6 text-sm" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', color: '#999' }}>
            <Markdown inline>{c.how_to_enter}</Markdown>
          </div>
        </div>
      </section>

      {/* Empty on day one, and renders nothing at all until Ryan uploads. */}
      <PageGallery slug="kids-contest" title={c.gallery_title} className="mx-auto max-w-5xl px-4 pb-12" />

      {/* Cross-link OUT. The 18+ rule and its single exception live on two pages
          now, so each points at the other - someone reading the exception should
          be one click from the rule it excepts. */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm" style={{ color: '#999' }}>
            <span className="text-emboss">
              Every other AATC contest is 18 and over. Best Temporary Tattoo (Kids) is the only
              exception, and it runs as one of Sunday&apos;s categories.
            </span>
          </p>
          <Link
            href="/events/tattoo-contests"
            className="mt-4 inline-flex items-center rounded-xl px-7 py-3 text-sm font-bold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: '#8B7355' }}
          >
            See all tattoo contest categories
          </Link>
        </div>
      </section>
    </div>
  )
}
