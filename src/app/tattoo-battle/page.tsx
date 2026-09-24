import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import PublicNav from '@/components/PublicNav'
import PageImage from '@/components/PageImage'
import BattleSection from '@/components/tattoo-battle/BattleSection'
import PresentedBy from '@/components/tattoo-battle/PresentedBy'
import EntryCard from '@/components/tattoo-battle/EntryCard'
import ChampionBanner from '@/components/tattoo-battle/ChampionBanner'
import BattleCountdown from '@/components/tattoo-battle/BattleCountdown'
import { canonical, SITE_URL } from '@/lib/site'
import {
  ASSETS, EVENT_NAME, EVENT_YEAR, TATTOO_BATTLE_PRESENTER,
  VENUE_NAME, VENUE_STREET, VENUE_CITY, VENUE_STATE, VENUE_POSTAL, SOCIAL,
} from '@/lib/event-config'
import {
  BATTLE_START, BATTLE_DURATION_HOURS, HERO, ELIGIBILITY, RULES, HOW_IT_WORKS, BUCKETS_ONLY_COPY,
  ONLINE_DONATIONS_COUNT_AS_VOTES, VETERAN_INK, PRIZES, PAST_CHAMPIONS, ATTENDEE_TIPS, FAQ, WINNER_ANNOUNCED,
} from '@/lib/tattoo-battle-config'
import { buildTimeline } from '@/lib/tattoo-battle'
import { getPublishedEntries, getPresenter, getBattleScheduleRows } from '@/lib/tattoo-battle-data'

const TITLE = `The All American Tattoo Battle ${EVENT_YEAR} | AATC Fayetteville`
const DESCRIPTION =
  `AATC's head-to-head tattoo showdown, presented by ${TATTOO_BATTLE_PRESENTER}. Surprise stencil, ${BATTLE_DURATION_HOURS} hours, judged on stage, then the crowd votes with their dollars for ${VETERAN_INK.name}. ${VENUE_CITY}, ${VENUE_STATE}.`

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonical('/tattoo-battle') },
  openGraph: {
    title: TITLE, description: DESCRIPTION, siteName: EVENT_NAME, type: 'website',
    images: [{ url: ASSETS.tattooBattleOg, width: 1200, height: 630, alt: `${HERO.title} presented by ${TATTOO_BATTLE_PRESENTER}` }],
  },
  twitter: { card: 'summary_large_image', site: SOCIAL.xHandle, creator: SOCIAL.xHandle, title: TITLE, description: DESCRIPTION, images: [ASSETS.tattooBattleOg] },
}

const CARD = { backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' } as const

export default async function TattooBattlePage() {
  const [entries, presenter, rows] = await Promise.all([getPublishedEntries(), getPresenter(), getBattleScheduleRows()])
  const champion = entries.find(e => e.is_champion) ?? null
  const { steps, mismatch } = buildTimeline(rows, { startIso: BATTLE_START, durationHours: BATTLE_DURATION_HOURS })
  if (mismatch) console.error(`[tattoo-battle] timeline: ${mismatch}`)

  const eventJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: HERO.title,
    description: DESCRIPTION,
    startDate: BATTLE_START,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: [`${SITE_URL.replace(/\/$/, '')}${ASSETS.tattooBattleOg}`],
    location: {
      '@type': 'Place', name: VENUE_NAME,
      address: { '@type': 'PostalAddress', streetAddress: VENUE_STREET, addressLocality: VENUE_CITY, addressRegion: VENUE_STATE, postalCode: VENUE_POSTAL, addressCountry: 'US' },
    },
    organizer: { '@type': 'Organization', name: `${EVENT_NAME} LLC`, url: SITE_URL },
    superEvent: { '@type': 'Event', name: `${EVENT_NAME} ${EVENT_YEAR}`, url: SITE_URL },
    sponsor: { '@type': 'Organization', name: TATTOO_BATTLE_PRESENTER },
  }
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <PublicNav />

      {champion && <ChampionBanner entry={champion} />}

      <main>
      {/* Hero */}
      <header className="relative px-4 pb-12 pt-8 text-center">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-repeat-x opacity-70"
             style={{ backgroundImage: 'url(/images/tattoo-battle/splatter-top.png)', backgroundSize: 'auto 100%' }} />
        <div className="relative mx-auto max-w-3xl">
          {/* White-and-gold lockup for the dark background, supplied by Ryan
              2026-09-24 (the charcoal cut from the vector master read too dark). */}
          <Image src="/images/tattoo-battle/lockup-full-dark.png" alt="" aria-hidden="true" width={1100} height={690} priority
                 className="mx-auto h-auto w-full max-w-xl" />
          <h1 className="sr-only">{HERO.title}</h1>
          <p className="mt-2 font-battle-condensed text-xs font-bold uppercase tracking-[0.3em] sm:text-sm" style={{ color: '#C4A882' }}>
            <span className="text-emboss">{HERO.kicker}</span>
          </p>
          <div className="mt-6"><PresentedBy presenter={presenter} size="hero" /></div>

          <div className="mx-auto mt-8 max-w-2xl rounded-2xl px-4 py-8 sm:px-8" style={CARD}>
            <p className="mb-6 font-battle-condensed text-xs font-bold uppercase tracking-widest sm:text-sm" style={{ color: '#C4A882' }}>
              The stencil drops in
            </p>
            <BattleCountdown />
          </div>

          <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-4 sm:flex-row">
            <Link href="/apply" className="flex flex-1 items-center justify-center rounded-xl bg-[#866f52] px-8 py-5 text-base font-bold text-white transition-colors hover:bg-[#7f6749] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4A882]">
              {HERO.ctaBooth}
            </Link>
            <a href="#how-it-works" className="flex flex-1 items-center justify-center rounded-xl border-2 px-8 py-5 text-base font-bold transition-colors hover:text-white" style={{ borderColor: '#8B7355', color: '#C4A882' }}>
              {HERO.ctaHow}
            </a>
          </div>
        </div>
      </header>

      {/* Who Can Battle */}
      <BattleSection id="who" kicker="Eligibility" title="Who Can Battle">
        <ul className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
          {ELIGIBILITY.map(line => (
            <li key={line} className="rounded-2xl p-5 text-sm leading-relaxed" style={{ ...CARD, color: '#ddd' }}>{line}</li>
          ))}
        </ul>
      </BattleSection>

      {/* Competition Rules */}
      <BattleSection id="rules" kicker="The rules" title="Competition Rules">
        <dl className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
          {RULES.map(r => (
            <div key={r.title} className="rounded-2xl p-5" style={CARD}>
              <dt className="font-battle-slab text-lg text-white">{r.title}</dt>
              <dd className="mt-1 text-sm leading-relaxed" style={{ color: '#bbb' }}>{r.text}</dd>
            </div>
          ))}
        </dl>
      </BattleSection>

      {/* How the Winner Is Decided */}
      <BattleSection id="how-it-works" kicker="Judges + the crowd" title={HOW_IT_WORKS.heading} splatter="both">
        <p className="mx-auto mb-8 max-w-2xl text-center font-battle-slab text-xl text-white sm:text-2xl">
          <span className="text-emboss">{HOW_IT_WORKS.formula}</span>
        </p>
        <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #8B7355' }}>
            <h3 className="font-battle-display text-2xl uppercase text-white">{HOW_IT_WORKS.judges.title}</h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: '#ddd' }}>{HOW_IT_WORKS.judges.text}</p>
          </div>
          <div aria-hidden="true" className="hidden items-center justify-center font-battle-display text-5xl md:flex" style={{ color: '#C4A882' }}>+</div>
          <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #8B7355' }}>
            <h3 className="font-battle-display text-2xl uppercase text-white">{HOW_IT_WORKS.people.title}</h3>
            <p className="font-battle-condensed text-xs font-bold uppercase tracking-[0.25em]" style={{ color: '#C4A882' }}>{HOW_IT_WORKS.people.subtitle}</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed" style={{ color: '#ddd' }}>
              {HOW_IT_WORKS.people.steps.map(s => <li key={s}>{s}</li>)}
              {!ONLINE_DONATIONS_COUNT_AS_VOTES && <li>{BUCKETS_ONLY_COPY}</li>}
            </ol>
          </div>
        </div>
        <p className="mt-6 rounded-2xl p-5 text-center font-battle-slab text-lg text-white" style={{ backgroundColor: 'rgba(139,115,85,0.15)', border: '1px solid #8B7355' }}>
          {HOW_IT_WORKS.sunday}
        </p>
      </BattleSection>

      {/* This Year's Battle - hidden until at least one entry is published */}
      {entries.length > 0 && (
        <BattleSection id="entries" kicker={`${EVENT_YEAR} entries`} title="This Year's Battle">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {entries.map(e => <EntryCard key={e.id} entry={e} />)}
          </div>
        </BattleSection>
      )}

      {/* About Veteran Ink */}
      <BattleSection id="veteran-ink" kicker="Every dollar supports" title={`About ${VETERAN_INK.name}`}>
        <div className="mx-auto max-w-2xl text-center">
          <PageImage slug="tattoo-battle-veteran-ink" className="mx-auto mb-6 max-w-xs" imageClassName="mx-auto h-auto w-full" />
          <p className="text-sm leading-relaxed sm:text-base" style={{ color: '#ddd' }}>{VETERAN_INK.description}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={VETERAN_INK.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border-2 px-6 py-3 text-sm font-bold" style={{ borderColor: '#8B7355', color: '#C4A882' }}>Visit {VETERAN_INK.name}</a>
            <a href={VETERAN_INK.donateUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#866f52] px-6 py-3 text-sm font-bold text-white hover:bg-[#7f6749]">Donate to {VETERAN_INK.name}</a>
          </div>
        </div>
      </BattleSection>

      {/* Weekend Timeline */}
      <BattleSection id="timeline" kicker="The weekend" title="Weekend Timeline">
        <ol className="mx-auto max-w-2xl space-y-3">
          {steps.map((s, i) => (
            <li key={s.key} className="flex gap-4 rounded-2xl p-5" style={CARD}>
              <span className="font-battle-display text-3xl leading-none" style={{ color: '#C4A882' }}>{i + 1}</span>
              <div>
                <p className="font-battle-condensed text-xs font-bold uppercase tracking-[0.2em]" style={{ color: '#C4A882' }}>{s.when}</p>
                <p className="mt-1 text-sm" style={{ color: '#ddd' }}>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-center font-battle-display text-5xl uppercase sm:text-7xl" style={{ color: '#C4A882' }} aria-label="Let's go">LFG!!</p>
      </BattleSection>

      {/* Prizes */}
      <BattleSection id="prizes" kicker="What the champion takes home" title="Prizes">
        <ul className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
          {PRIZES.map(p => (
            <li key={p.title} className="rounded-2xl p-5 font-battle-slab text-lg text-white" style={CARD}>
              {p.title}{p.optional && <span className="ml-2 font-sans text-xs" style={{ color: '#999' }}>(optional)</span>}
            </li>
          ))}
        </ul>
      </BattleSection>

      {/* Past Champions - hidden while empty */}
      {PAST_CHAMPIONS.length > 0 && (
        <BattleSection id="past-champions" kicker="Hall of champions" title="Past Champions">
          <ul className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
            {PAST_CHAMPIONS.map(c => (
              <li key={`${c.year}-${c.name}`} className="flex items-center gap-4 rounded-2xl p-5" style={CARD}>
                {c.image && <Image src={c.image} alt={`${c.name}, ${c.year} champion`} width={64} height={64} className="h-16 w-16 rounded-full object-cover" />}
                <div>
                  <p className="font-battle-display text-xl" style={{ color: '#C4A882' }}>{c.year}</p>
                  <p className="font-battle-slab text-lg text-white">{c.name}</p>
                  {c.shop && <p className="text-sm" style={{ color: '#999' }}>{c.shop}</p>}
                  {c.instagram && <a href={`https://instagram.com/${c.instagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm underline" style={{ color: '#C4A882' }}>{c.instagram}</a>}
                </div>
              </li>
            ))}
          </ul>
        </BattleSection>
      )}

      {/* For Attendees */}
      <BattleSection id="attendees" kicker="Coming to watch?" title="For Attendees">
        <ul className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-3">
          {ATTENDEE_TIPS.map(t => (
            <li key={t} className="rounded-2xl p-5 text-center font-battle-slab text-lg text-white" style={CARD}>{t}</li>
          ))}
        </ul>
        <p className="mt-4 text-center text-sm" style={{ color: '#999' }}>Champion crowned {WINNER_ANNOUNCED}.</p>
      </BattleSection>

      {/* Sponsor block */}
      <BattleSection id="sponsor" title="Our Presenting Sponsor">
        <PresentedBy presenter={presenter} />
      </BattleSection>

      {/* FAQ */}
      <BattleSection id="faq" kicker="Questions" title="FAQ" splatter="bottom">
        <div className="mx-auto max-w-2xl space-y-2">
          {FAQ.map(f => (
            <details key={f.q} className="group rounded-2xl p-5" style={CARD}>
              <summary className="cursor-pointer font-battle-slab text-base text-white marker:text-[#C4A882]">{f.q}</summary>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: '#ddd' }}>{f.a}</p>
            </details>
          ))}
        </div>
      </BattleSection>
      </main>
    </div>
  )
}
