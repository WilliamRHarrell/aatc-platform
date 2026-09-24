import type { Metadata } from 'next'
import PublicNav from '@/components/PublicNav'
import PageGallery from '@/components/PageGallery'
import TeamSection from '@/components/TeamSection'
import Markdown from '@/components/Markdown'
import { getContent } from '@/content/getContent'
import { CONTACT_EMAIL, EVENT_YEAR } from '@/lib/event-config'

/**
 * Every text block on this page is editable at /admin/content ("About AATC")
 * through the 'about' registry entry (2026-09-24). The defaults are the copy
 * that was hardcoded here before, verbatim, so nothing changed visually.
 *
 * The team section moved to the `team_members` table in migration 059 and is
 * rendered by src/components/TeamSection.tsx.
 *
 * THE REASONING MOVED WITH IT, and is repeated in both the migration and the
 * component rather than left here alone: three of the four people once listed
 * on this page did not exist, and Ryan's bio claimed he is an Army veteran when
 * he is not. Both were corrected. The corrected wording is seeded verbatim by
 * 059 and must not be reworded - see that file before editing either bio.
 */

export const metadata: Metadata = {
  title: `About AATC | All American Tattoo Convention ${EVENT_YEAR}`,
  description: 'Why the All American Tattoo Convention exists, what makes it different, and why it is in Fayetteville, home of Fort Bragg.',
}

const CARD = { backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' } as const

export default async function AboutPage() {
  const c = await getContent('about')
  const differentiators = [1, 2, 3, 4].map(n => ({ title: c[`diff_${n}_title`], body: c[`diff_${n}_body`] }))

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">{c.hero_kicker}</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">{c.hero_title}</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss"><Markdown inline>{c.hero_intro}</Markdown></span>
        </p>
      </div>

      {/* What Makes AATC Different */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">{c.different_title}</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {differentiators.map((item) => (
              <div key={item.title} className="rounded-2xl p-6" style={CARD}>
                <h3 className="text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: '#999' }}>
                  <Markdown inline>{item.body}</Markdown>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* History */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">{c.story_title}</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">{c.story_subtitle}</span>
          </p>
          <div className="space-y-6">
            <div className="space-y-4 rounded-2xl p-6" style={CARD}>
              <Markdown className="text-sm leading-relaxed text-[#999]">{c.story_body}</Markdown>
            </div>
          </div>
        </div>
      </section>

      {/* Why Fayetteville */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">{c.fayetteville_title}</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">{c.fayetteville_subtitle}</span>
          </p>
          <div className="space-y-4 rounded-2xl p-6" style={CARD}>
            <Markdown className="text-sm leading-relaxed text-[#999]">{c.fayetteville_body}</Markdown>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <TeamSection />
      </section>
      <PageGallery slug="about" title={c.gallery_title} className="mx-auto max-w-5xl px-4 py-12" />

      {/* Footer CTA */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">{c.cta_title}</span>
        </p>
        <p className="text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">{c.cta_lead}{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#C4A882' }}>
            {CONTACT_EMAIL}
          </a></span>
        </p>
      </div>
    </div>
  )
}
