import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { canonical } from '@/lib/site'
import { getContent } from '@/content/getContent'
import { isTrue } from '@/content/registry'
import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'
import Countdown from '@/components/home/Countdown'
import VideoFacade from '@/components/home/VideoFacade'
import { HOME_EVENTS, AFTER_PARTIES, mapsUrl } from '@/lib/homepage-content'
import {
  EVENT_NAME,
  EVENT_DATES_LABEL,
  VENUE_NAME,
  VENUE_STREET,
  VENUE_CITY,
  VENUE_STATE,
  VENUE_POSTAL,
  VENUE_MAP_URL,
  ASSETS,
  SOCIAL,
  PROMO_VIDEO,
  BEST_IN_SHOW,
  BEST_IN_SHOW_YEAR,
  daysUntilDoors,
} from '@/lib/event-config'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://allamericantattooconvention.com'

export const metadata: Metadata = {
  title: 'All American Tattoo Convention 2027 | Fayetteville, NC',
  description:
    '300+ world-class tattoo artists, live contests, and entertainment at the Crown Complex in Fayetteville, NC, April 16–18, 2027. Honoring our military heroes.',
  // Off-production this is undefined: emitting a canonical to the real
  // domain before cutover would assert URLs WordPress does not serve.
  alternates: { canonical: canonical('/') },
  openGraph: {
    title: 'All American Tattoo Convention 2027 | Fayetteville, NC',
    description:
      '300+ world-class tattoo artists, live contests, and entertainment at the Crown Complex in Fayetteville, NC, April 16–18, 2027.',
    url: SITE_URL,
    siteName: EVENT_NAME,
    images: [{ url: ASSETS.ogImage, width: 1200, height: 630, alt: EVENT_NAME }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: SOCIAL.xHandle,
    creator: SOCIAL.xHandle,
    title: 'All American Tattoo Convention 2027 | Fayetteville, NC',
    description: '300+ tattoo artists, live contests, and entertainment. April 16–18, 2027 — Fayetteville, NC.',
    images: [ASSETS.ogImage],
  },
}

interface HomeSponsor {
  id: string
  sponsor_name: string
  tier: string
  logo_url: string | null
  website: string | null
  homepage_order: number | null
}

interface HomePanel {
  id: string
  title: string
  description: string
  panel_date: string
  panel_time: string
  location: string
}

const TIER_RANK: Record<string, number> = {
  title: 0, platinum: 1, gold: 2, silver: 3, brass: 4,
  collectible_coin: 5, vip_bag: 6, collectors_choice: 7, artist_lounge: 8, rafter_banner: 9,
}

/** Logos sized by tier — Title and Platinum read noticeably larger. */
const TIER_SIZE: Record<string, number> = { title: 200, platinum: 160 }
const DEFAULT_TIER_SIZE = 116

const getHomepageData = unstable_cache(
  async (): Promise<{ sponsors: HomeSponsor[]; panels: HomePanel[] }> => {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: event } = await supabase.from('events').select('id').eq('is_active', true).single()
    if (!event) return { sponsors: [], panels: [] }

    // No join into `invoices` — that subquery is what triggers the RLS
    // recursion (see migration 027). Placement is decided by admin-set columns
    // on sponsorships, which also lets trade/in-kind sponsors appear.
    const [{ data: sponsorRows, error: sponsorErr }, { data: panelRows }] = await Promise.all([
      supabase
        .from('sponsors_public')
        .select('id, sponsor_name, tier, logo_url, website, homepage_order')
        .eq('event_id', event.id)
        .eq('show_on_homepage', true),
      supabase
        .from('panels_public')
        .select('id, title, description, panel_date, panel_time, location')
        .eq('event_id', event.id)
        .order('panel_date')
        .limit(4),
    ])

    // Degrade to an empty grid rather than throwing — but say so in the logs.
    // Silently swallowing this is how "I ticked the box and nothing appeared"
    // becomes undiagnosable. Common causes: migration 027 not applied yet
    // (42703 undefined_column), or an RLS recursion (42P17).
    if (sponsorErr) {
      console.error(
        `[homepage] sponsor query failed (${sponsorErr.code}): ${sponsorErr.message} — ` +
        'grid will render empty. If 42703, migration 027 has not been applied.'
      )
    }

    // homepage_order first (nulls last), then tier, then name.
    const sponsors = ((sponsorRows as unknown as HomeSponsor[]) ?? []).sort((a, b) => {
      const ao = a.homepage_order ?? Number.MAX_SAFE_INTEGER
      const bo = b.homepage_order ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      const at = TIER_RANK[a.tier] ?? 99
      const bt = TIER_RANK[b.tier] ?? 99
      if (at !== bt) return at - bt
      return a.sponsor_name.localeCompare(b.sponsor_name)
    })

    return { sponsors, panels: (panelRows as unknown as HomePanel[]) ?? [] }
  },
  ['homepage_data'],
  { revalidate: 60, tags: ['sponsors', 'panels'] }
)

export default async function HomePage() {
  const [c, { sponsors, panels }] = await Promise.all([getContent('homepage'), getHomepageData()])

  const ticketsLive = isTrue(c.ticket_sales_live) && !!c.ticket_url
  const winners = BEST_IN_SHOW[BEST_IN_SHOW_YEAR] ?? []
  const daysOut = daysUntilDoors()
  const fullAddress = `${VENUE_STREET}, ${VENUE_CITY}, ${VENUE_STATE} ${VENUE_POSTAL}`

  const eventJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `${EVENT_NAME} 2027`,
    startDate: '2027-04-16',
    endDate: '2027-04-18',
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    description:
      '300+ world-class tattoo artists, live contests, and entertainment at the Crown Complex in Fayetteville, NC. Honoring our military heroes.',
    image: [ASSETS.ogImage],
    location: {
      '@type': 'Place',
      name: VENUE_NAME,
      address: {
        '@type': 'PostalAddress',
        streetAddress: VENUE_STREET,
        addressLocality: VENUE_CITY,
        addressRegion: VENUE_STATE,
        postalCode: VENUE_POSTAL,
        addressCountry: 'US',
      },
    },
    organizer: { '@type': 'Organization', name: `${EVENT_NAME} LLC`, url: SITE_URL },
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/tickets`,
      availability: ticketsLive ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
      priceCurrency: 'USD',
    },
  }

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }} />

      <PublicNav />

      {/* ── 1. Hero + countdown ── */}
      <header className="px-4 pb-10 pt-10 text-center sm:pt-14">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ASSETS.logoHorizontal} alt={EVENT_NAME} className="mx-auto h-24 w-auto sm:h-32 md:h-40" />

        <p className="mt-8 text-xs font-bold uppercase tracking-[0.3em] sm:text-sm" style={{ color: '#8B7355' }}>
          <span className="text-emboss">{c.hero_eyebrow}</span>
        </p>

        <h1 className="font-display mt-3 text-3xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">
          <span className="text-emboss">{c.hero_title}</span>
        </h1>

        <p className="font-display mt-4 text-xl font-bold sm:text-2xl md:text-3xl" style={{ color: '#C4A882' }}>
          <span className="text-emboss">{c.hero_tagline}</span>
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-sm sm:text-base" style={{ color: '#999999' }}>
          <span className="text-emboss">{c.hero_subtitle}</span>
        </p>

        {/* Server-rendered, crawlable event line + day count — meaningful before
            the countdown hydrates and for no-JS visitors. */}
        <p className="mt-6 text-sm font-semibold" style={{ color: '#999999' }}>
          <span className="text-emboss">
            {EVENT_DATES_LABEL} · {VENUE_NAME} · {VENUE_CITY}, {VENUE_STATE}
            {daysOut > 0 ? ` · ${daysOut} days away` : ''}
          </span>
        </p>

        <div
          className="mx-auto mt-8 max-w-2xl rounded-2xl px-4 py-8 sm:px-8"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          <p className="mb-6 text-xs font-medium uppercase tracking-widest sm:text-sm" style={{ color: '#8B7355' }}>
            {c.countdown_heading}
          </p>
          <Countdown />
        </div>
      </header>

      {/* ── 2. Primary CTA pair ── */}
      <section className="px-4 pb-14">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 sm:flex-row">
          <Link
            href="/apply"
            className="flex flex-1 items-center justify-center rounded-xl bg-[#8B7355] px-8 py-5 text-center text-base font-bold text-white transition-colors duration-200 hover:bg-[#C4A882] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4A882]"
          >
            {c.cta_booth}
          </Link>

          {ticketsLive ? (
            <a
              href={c.ticket_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center rounded-xl border-2 border-[#8B7355] px-8 py-5 text-center text-base font-bold text-[#C4A882] transition-colors duration-200 hover:bg-[#8B7355] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4A882]"
            >
              {c.cta_tickets}
            </a>
          ) : (
            <div className="flex flex-1 flex-col items-center">
              <span
                aria-disabled="true"
                className="flex w-full cursor-not-allowed items-center justify-center rounded-xl border-2 border-dashed px-8 py-5 text-center text-base font-bold"
                style={{ borderColor: '#3a3a3a', color: '#777', backgroundColor: 'rgba(42,42,42,0.5)' }}
              >
                {c.cta_tickets}
              </span>
              <span className="mt-2 text-xs" style={{ color: '#666' }}>
                {c.ticket_pending_note}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ── Intro ── */}
      <section className="border-t px-4 py-14" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
            <span className="text-emboss">{c.intro_title}</span>
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed sm:text-base" style={{ color: '#999999' }}>
            <Markdown>{c.intro_body}</Markdown>
          </div>

          <p className="mt-8 text-center text-xs font-bold uppercase tracking-[0.2em] sm:text-sm" style={{ color: '#C4A882' }}>
            <span className="text-emboss">{c.stats_band}</span>
          </p>
        </div>
      </section>

      {/* ── 3. Promo video — renders only when an ID is configured ──
          The footage is vertical (9:16), so it sits in a width-capped column
          beside the copy rather than being pillarboxed into a 16:9 frame. */}
      {PROMO_VIDEO.youTubeId && (
        <section className="border-t px-4 py-14" style={{ borderColor: '#2a2a2a' }}>
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 md:flex-row md:items-center md:gap-12">
            <div className="w-full shrink-0" style={{ maxWidth: PROMO_VIDEO.orientation === 'vertical' ? 400 : undefined }}>
              <VideoFacade
                youTubeId={PROMO_VIDEO.youTubeId}
                title={PROMO_VIDEO.title}
                orientation={PROMO_VIDEO.orientation}
                posterUrl={PROMO_VIDEO.posterUrl}
              />
            </div>

            <div className="w-full text-center md:text-left">
              <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
                <span className="text-emboss">{c.video_heading}</span>
              </h2>
              <div className="mt-3 text-sm leading-relaxed sm:text-base" style={{ color: '#999999' }}>
                <Markdown>{c.video_body}</Markdown>
              </div>
              <Link
                href="/events/schedule"
                className="mt-6 inline-flex items-center rounded-xl border-2 border-[#8B7355] px-6 py-3 text-sm font-bold text-[#C4A882] transition-colors hover:bg-[#8B7355] hover:text-white"
              >
                {c.video_cta}
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── 4. Events ── */}
      <section className="border-t px-4 py-14" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-4xl">
          <div className="mb-7 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              <span className="text-emboss">{c.events_title}</span>
            </h2>
            <Link href="/events/schedule" className="text-sm font-semibold text-[#C4A882] transition-colors hover:text-white">
              Full schedule →
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {HOME_EVENTS.map(ev => (
              <Link
                key={ev.name}
                href={ev.href}
                className="flex flex-col rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5 transition-colors duration-200 hover:border-[#8B7355]"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-bold text-white">{ev.name}</h3>
                  <span className="shrink-0 text-xs font-medium uppercase tracking-wider" style={{ color: '#8B7355' }}>
                    {ev.day}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: '#999999' }}>{ev.description}</p>
              </Link>
            ))}
          </div>

          <div
            className="mt-6 rounded-2xl px-5 py-4 text-center text-sm"
            style={{ backgroundColor: 'rgba(139,115,85,0.1)', border: '1px solid #2a2a2a', color: '#999' }}
          >
            <Markdown inline>{c.events_empty}</Markdown>
          </div>
        </div>
      </section>

      {/* ── 5. Seminars & panels ── */}
      <section className="border-t px-4 py-14" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-4xl">
          <div className="mb-7 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              <span className="text-emboss">{c.panels_title}</span>
            </h2>
            <Link href="/events/tattoo-panels" className="text-sm font-semibold text-[#C4A882] transition-colors hover:text-white">
              See all panels →
            </Link>
          </div>

          {panels.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {panels.map(p => (
                <div key={p.id} className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
                  <h3 className="text-base font-bold text-white">{p.title}</h3>
                  {(p.panel_date || p.panel_time || p.location) && (
                    <p className="mt-1 text-xs font-medium uppercase tracking-wider" style={{ color: '#8B7355' }}>
                      {[p.panel_date, p.panel_time, p.location].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {p.description && (
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: '#999999' }}>{p.description}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* No fabricated speakers or topics — fake names on a live page is a
               credibility problem with the artist community. */
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="flex min-h-[120px] flex-col items-center justify-center rounded-2xl border border-dashed p-5 text-center"
                  style={{ borderColor: '#3a3a3a', backgroundColor: 'rgba(26,26,26,0.6)' }}
                >
                  <p className="text-sm font-bold uppercase tracking-wider" style={{ color: '#8B7355' }}>
                    Lineup announced soon
                  </p>
                </div>
              ))}
              <div
                className="flex items-center rounded-2xl px-5 py-4 text-sm"
                style={{ backgroundColor: 'rgba(139,115,85,0.1)', border: '1px solid #2a2a2a', color: '#999' }}
              >
                <Markdown inline>{c.panels_empty}</Markdown>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 6. Best in Show — renders only when winner data exists ── */}
      {winners.length > 0 && (
        <section className="border-t px-4 py-14" style={{ borderColor: '#2a2a2a' }}>
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display mb-7 text-2xl font-bold text-white sm:text-3xl">
              <span className="text-emboss">Best in Show {BEST_IN_SHOW_YEAR}</span>
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {winners.map(w => (
                <figure key={w.category} className="overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a]">
                  <Image
                    src={w.imageUrl}
                    alt={`${w.category} winner at AATC ${BEST_IN_SHOW_YEAR} — tattoo by ${w.artistName}`}
                    width={800}
                    height={1000}
                    priority={false}
                    className="h-auto w-full object-cover"
                  />
                  <figcaption className="p-5">
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#8B7355' }}>{w.category}</p>
                    <p className="mt-1 font-semibold text-white">{w.artistName}</p>
                    {w.studio && <p className="mt-0.5 text-sm" style={{ color: '#999' }}>{w.studio}</p>}
                    {w.instagram && (
                      <a
                        href={`https://instagram.com/${w.instagram.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-sm text-[#C4A882] transition-colors hover:text-white"
                      >
                        @{w.instagram.replace(/^@/, '')}
                      </a>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 7. Sponsors ── */}
      <section className="border-t px-4 py-14" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-4xl">
          {/* Grid hidden entirely when empty — never a heading over nothing. */}
          {sponsors.length > 0 && (
            <>
              <h2 className="font-display mb-7 text-center text-2xl font-bold text-white sm:text-3xl">
                <span className="text-emboss">{c.sponsors_title}</span>
              </h2>
              <div className="mb-10 flex flex-wrap items-center justify-center gap-6">
                {sponsors.map(s => {
                  const size = TIER_SIZE[s.tier] ?? DEFAULT_TIER_SIZE
                  const inner = (
                    <span
                      className="flex items-center justify-center overflow-hidden rounded-2xl"
                      style={{ width: size, height: size, backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                    >
                      {s.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.logo_url}
                          alt={s.sponsor_name}
                          width={size}
                          height={size}
                          className="h-full w-full object-contain p-3"
                        />
                      ) : (
                        <span className="px-2 text-center font-display text-lg font-bold" style={{ color: '#C4A882' }}>
                          {s.sponsor_name}
                        </span>
                      )}
                    </span>
                  )
                  return s.website ? (
                    <a
                      key={s.id}
                      href={s.website.startsWith('http') ? s.website : `https://${s.website}`}
                      target="_blank"
                      /* rel="sponsored" per Google's guidelines for paid placements */
                      rel="noopener sponsored"
                      className="transition-transform hover:scale-105"
                    >
                      {inner}
                    </a>
                  ) : (
                    <span key={s.id}>{inner}</span>
                  )
                })}
              </div>
            </>
          )}

          {/* CTA always renders, sponsors or not. */}
          <div
            className="mx-auto max-w-2xl rounded-2xl px-6 py-7 text-center"
            style={{ backgroundColor: 'rgba(139,115,85,0.1)', border: '1px solid #8B7355' }}
          >
            <p className="text-sm" style={{ color: '#999' }}>{c.sponsors_cta_body}</p>
            <Link
              href="/sponsors"
              className="mt-4 inline-flex items-center rounded-xl bg-[#8B7355] px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-[#C4A882]"
            >
              {c.sponsors_cta_button}
            </Link>
          </div>
        </div>
      </section>

      {/* ── 8. After parties ── */}
      <section className="border-t px-4 py-14" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-4xl">
          <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
            <span className="text-emboss">{c.afterparty_title}</span>
          </h2>
          <div className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: '#999999' }}>
            <Markdown inline>{c.afterparty_intro}</Markdown>
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            {AFTER_PARTIES.map(p => (
              <div key={p.night} className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#8B7355' }}>{p.night}</p>
                {p.venue ? (
                  <>
                    <h3 className="mt-2 text-base font-bold text-white">{p.venue}</h3>
                    {p.time && <p className="mt-1 text-sm" style={{ color: '#999' }}>{p.time}</p>}
                    {p.address && (
                      <a
                        href={mapsUrl(p.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-sm text-[#C4A882] underline underline-offset-2 transition-colors hover:text-white"
                      >
                        {p.address}
                      </a>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-base font-bold" style={{ color: '#666' }}>Venue TBA</p>
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs" style={{ color: '#666' }}>{c.afterparty_note}</p>
        </div>
      </section>

      {/* ── 9. Fayetteville & Fort Bragg ── */}
      <section className="border-t px-4 py-14" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
            <span className="text-emboss">{c.local_title}</span>
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed sm:text-base" style={{ color: '#999999' }}>
            <Markdown>{c.local_body}</Markdown>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
              <h3 className="text-base font-bold text-white">{c.local_stay_title}</h3>
              <div className="mt-2 text-sm leading-relaxed" style={{ color: '#999999' }}>
                <Markdown inline>{c.local_stay_body}</Markdown>
              </div>
              <Link href="/info/staying" className="mt-3 inline-block text-sm font-semibold text-[#C4A882] transition-colors hover:text-white">
                Plan your stay →
              </Link>
            </div>

            <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
              <h3 className="text-base font-bold text-white">{c.local_discounts_title}</h3>
              <div className="mt-2 text-sm leading-relaxed" style={{ color: '#999999' }}>
                <Markdown inline>{c.local_discounts_body}</Markdown>
              </div>
              <div className="mt-3 flex flex-wrap gap-4">
                <Link href="/tickets" className="text-sm font-semibold text-[#C4A882] transition-colors hover:text-white">
                  Tickets →
                </Link>
                <Link href="/apply" className="text-sm font-semibold text-[#C4A882] transition-colors hover:text-white">
                  Booths →
                </Link>
              </div>
            </div>
          </div>

          {/* Real <address> element — local SEO signal; must match the Google
              Business Profile exactly. */}
          <address className="mt-8 text-sm not-italic leading-relaxed" style={{ color: '#999999' }}>
            <span className="font-semibold text-white">{VENUE_NAME}</span>
            <br />
            <a
              href={VENUE_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-white"
            >
              {fullAddress}
            </a>
            <br />
            <Link href="/info/directions" className="text-[#C4A882] transition-colors hover:text-white">
              Directions & parking →
            </Link>
          </address>
        </div>
      </section>

      {/* ── 10. Artist & vendor login ── */}
      <section className="border-t px-4 py-14" style={{ borderColor: '#2a2a2a' }}>
        <div
          className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-2xl px-6 py-7 text-center sm:flex-row sm:justify-between sm:text-left"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          <div>
            <h2 className="text-base font-bold text-white">{c.login_title}</h2>
            <p className="mt-1 text-sm" style={{ color: '#999' }}>{c.login_body}</p>
          </div>
          <Link
            href="/auth/login"
            className="shrink-0 rounded-xl border-2 border-[#8B7355] px-6 py-3 text-sm font-bold text-[#C4A882] transition-colors hover:bg-[#8B7355] hover:text-white"
          >
            {c.login_button}
          </Link>
        </div>
      </section>
    </div>
  )
}
