import type { Metadata } from 'next'
import Link from 'next/link'
import { getContent } from '@/content/getContent'
import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'

export const metadata: Metadata = {
  title: 'Apply - Booths, Contests & More | All American Tattoo Convention 2027',
  description:
    'Applications for AATC 2027 are open. Apply for artist and vendor booths, food trucks, the tattoo contests, the Miss All American Pin-Up Contest, and sponsorships.',
}

// Every application option on /apply is a button-like card: theme gold border,
// stronger on hover and focus, whole card clickable, visible keyboard ring.
// Contrast (checked 2026-09-25): white on surface 17:1, gold-light on surface
// 7.7:1, gold border on surface 3.9:1 (UI component minimum is 3:1).
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
const OPTION_CARD = `group flex flex-1 items-center justify-between gap-4 rounded-xl border-2 border-gold bg-background px-6 py-5 text-left transition-colors duration-200 hover:border-gold-light hover:bg-gold/15 ${FOCUS_RING}`

export default async function ApplyPage() {
  const c = await getContent('applyHub')

  const steps = [
    { title: c.expect_step1_title, desc: c.expect_step1_desc },
    { title: c.expect_step2_title, desc: c.expect_step2_desc },
    { title: c.expect_step3_title, desc: c.expect_step3_desc },
  ]

  // Secondary application cards. `href: null` = the route/form does not exist
  // yet, so the card renders without a link rather than pointing somewhere wrong.
  const secondary = [
    { title: c.pinup_title, body: c.pinup_body, cta: c.pinup_cta, href: '/events/pinup-contest' },
    { title: c.contests_title, body: c.contests_body, cta: c.contests_cta, href: '/events/tattoo-contests' },
    { title: c.honor_title, body: c.honor_body, cta: c.honor_cta, href: '/info/wall-of-honor' },
    { title: c.sponsor_title, body: c.sponsor_body, cta: c.sponsor_cta, href: '/sponsors/packages' },
    { title: c.volunteer_title, body: c.volunteer_body, cta: c.volunteer_cta, href: null },
  ]

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* ── Hero ── */}
      <section className="px-4 py-12 text-center">
        <p className="mb-0 text-sm font-medium uppercase tracking-widest" style={{ color: '#8B7355' }}>
          <span className="text-emboss">{c.hero_eyebrow}</span>
        </p>
        <h1 className="font-display text-3xl font-bold leading-relaxed text-white sm:text-4xl md:text-5xl">
          <span className="text-emboss">{c.hero_title}</span>
          <br className="hidden sm:block" />
          <span className="text-emboss" style={{ color: '#C4A882' }}> {c.hero_title_accent}</span>
        </h1>

        <div className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed" style={{ color: '#999999' }}>
          <span className="text-emboss">
            <Markdown inline>{c.hero_intro}</Markdown>
          </span>
        </div>

        {/* Event details */}
        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-6">
          <span className="text-emboss inline-flex items-center gap-2 whitespace-nowrap text-sm" style={{ color: '#999999' }}>
            <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {c.event_dates}
          </span>
          <span className="hidden h-4 w-px sm:block" style={{ backgroundColor: '#2a2a2a' }} />
          <span className="text-emboss inline-flex items-center gap-2 whitespace-nowrap text-sm" style={{ color: '#999999' }}>
            <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <a href="https://share.google/vRhsv0xqNzDRTPtGC" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 transition-colors hover:text-white">{c.event_venue}</a>
          </span>
          <span className="hidden h-4 w-px sm:block" style={{ backgroundColor: '#2a2a2a' }} />
          <span className="text-emboss text-sm" style={{ color: '#999999' }}>{c.event_location}</span>
        </div>
      </section>

      {/* ── Primary block: apply for a booth ── */}
      <section className="px-4 pb-12">
        <div className="mx-auto max-w-3xl rounded-2xl p-8" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">{c.booth_block_title}</h2>
          <div className="mt-2 text-sm font-semibold" style={{ color: '#C4A882' }}>
            <Markdown inline>{c.booth_block_tagline}</Markdown>
          </div>
          <div className="mt-3 text-sm leading-relaxed" style={{ color: '#999999' }}>
            <Markdown>{c.booth_block_body}</Markdown>
          </div>

          {/* CTAs. Artist and vendor carry the SAME weight: the filled-vs-outlined
              pair made the vendor option read as secondary (Ryan, 2026-09-25).
              Theme tokens only (gold, gold-light); the whole card is the link. */}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/apply/artist" className={OPTION_CARD} aria-label={`${c.cta_artist}: apply as an artist`}>
              <span className="flex items-center gap-3">
                <svg className="shrink-0 text-gold-light" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
                <span className="text-base font-semibold text-white">{c.cta_artist}</span>
              </span>
              <span className="text-lg font-bold text-gold-light transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
            </Link>

            <Link href="/apply/vendor" className={OPTION_CARD} aria-label={`${c.cta_vendor}: apply as a vendor`}>
              <span className="flex items-center gap-3">
                <svg className="shrink-0 text-gold-light" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
                <span className="text-base font-semibold text-white">{c.cta_vendor}</span>
              </span>
              <span className="text-lg font-bold text-gold-light transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
            </Link>

            {/* No food-truck application route exists yet - render as pending
                rather than pointing at the vendor form, which has no food-truck mode. */}
            <div
              className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#3a3a3a] px-6 py-4 text-center"
              style={{ backgroundColor: 'rgba(42,42,42,0.5)' }}
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: '#777' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="6" width="14" height="10" rx="1"/>
                  <path d="M15 9h4l3 3v4h-7z"/>
                  <circle cx="6" cy="18" r="2"/>
                  <circle cx="18" cy="18" r="2"/>
                </svg>
                {c.cta_food_truck}
              </span>
              <span className="text-xs" style={{ color: '#666' }}>Opening soon</span>
            </div>
          </div>

          {/* How it works */}
          <h3 className="font-display mb-5 mt-10 text-lg font-bold text-white">{c.expect_title}</h3>
          <ol className="space-y-5">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-base font-bold"
                  style={{ backgroundColor: '#0a0a0a', color: '#8B7355' }}
                >
                  {i + 1}
                </div>
                <div>
                  <p className="font-semibold text-white">{step.title}</p>
                  <div className="mt-1 text-sm leading-relaxed" style={{ color: '#999999' }}>
                    <Markdown inline>{step.desc}</Markdown>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 border-t pt-5 text-sm" style={{ borderColor: '#2a2a2a', color: '#999999' }}>
            <Markdown inline>{c.booth_info_link_text}</Markdown>
          </div>
        </div>
      </section>

      {/* ── Secondary application cards ── */}
      <section className="px-4 pb-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">{c.secondary_title}</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {secondary.map(card => card.href ? (
              <Link key={card.title} href={card.href} className={`group flex flex-col rounded-2xl border-2 border-gold bg-surface p-6 transition-colors duration-200 hover:border-gold-light hover:bg-gold/15 ${FOCUS_RING}`}>
                <h3 className="text-base font-bold text-white">{card.title}</h3>
                <div className="mt-2 flex-1 text-sm leading-relaxed" style={{ color: '#999999' }}>
                  <Markdown>{card.body}</Markdown>
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-light">
                  {card.cta}
                  <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
                </span>
              </Link>
            ) : (
              <div key={card.title} className="flex flex-col rounded-2xl border-2 border-dashed border-[#3a3a3a] bg-surface p-6">
                <h3 className="text-base font-bold text-white">{card.title}</h3>
                <div className="mt-2 flex-1 text-sm leading-relaxed" style={{ color: '#999999' }}>
                  <Markdown>{card.body}</Markdown>
                </div>
                <p className="mt-4 text-sm font-semibold" style={{ color: '#777' }}>
                  Applications opening soon
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Deadline strip ── */}
      <section className="px-4 pb-16">
        <div
          className="mx-auto max-w-3xl rounded-2xl px-6 py-5 text-center"
          style={{ backgroundColor: 'rgba(139,115,85,0.12)', border: '1px solid #8B7355' }}
        >
          <p className="text-sm font-bold uppercase tracking-wider" style={{ color: '#C4A882' }}>
            {c.deadline_title}
          </p>
          <div className="mt-2 text-sm leading-relaxed" style={{ color: '#999999' }}>
            <Markdown inline>{c.deadline_body}</Markdown>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <div className="mb-3 flex justify-center gap-2 text-sm" style={{ color: '#8B7355' }}>
          {['★', '★', '★', '★', '★'].map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>

        <p className="font-display text-lg font-bold text-white">
          <span className="text-emboss">{c.footer_name}</span>
        </p>
        <p className="mt-1 text-sm" style={{ color: '#999999' }}>
          <span className="text-emboss">{c.footer_location}</span>
        </p>

        <p className="mt-6 text-xs" style={{ color: '#555555' }}>
          <span className="text-emboss">© 2027 All American Tattoo Convention LLC. All rights reserved.</span>
        </p>
      </footer>
    </div>
  )
}
