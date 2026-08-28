import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getContent } from '@/content/getContent'
import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'
import { excludeHarnessSponsors } from '@/lib/sponsor-display'

export const metadata: Metadata = {
  title: 'Our Sponsors | All American Tattoo Convention 2027',
  description:
    'Meet the sponsors who make the All American Tattoo Convention possible - supporting tattoo artists, veterans, and the Fayetteville & Fort Bragg community.',
}

interface Sponsor {
  id: string
  sponsor_name: string
  tier: string
  logo_url: string | null
  website: string | null
  instagram: string | null
  facebook: string | null
}

const TIER_ORDER = ['title', 'platinum', 'gold', 'silver', 'brass', 'collectible_coin', 'vip_bag', 'collectors_choice', 'artist_lounge', 'rafter_banner']

const TIER_META: Record<string, { label: string; color: string; borderColor: string }> = {
  title:             { label: 'Title Sponsor',         color: '#ffd700', borderColor: 'rgba(255,215,0,0.4)' },
  platinum:          { label: 'Platinum Sponsors',      color: '#e5e4e2', borderColor: 'rgba(229,228,226,0.3)' },
  gold:              { label: 'Gold Sponsors',          color: '#C4A882', borderColor: 'rgba(196,168,130,0.4)' },
  silver:            { label: 'Silver Sponsors',        color: '#a8a8a8', borderColor: 'rgba(168,168,168,0.3)' },
  brass:             { label: 'Brass Sponsors',         color: '#cd7f32', borderColor: 'rgba(205,127,50,0.3)' },
  collectible_coin:  { label: 'Collectible Coin Sponsor', color: '#C4A882', borderColor: 'rgba(196,168,130,0.3)' },
  vip_bag:           { label: 'VIP Bag Sponsor',        color: '#C4A882', borderColor: 'rgba(196,168,130,0.3)' },
  collectors_choice: { label: "Collector's Choice Sponsor", color: '#C4A882', borderColor: 'rgba(196,168,130,0.3)' },
  artist_lounge:     { label: 'Artist Lounge Sponsor',  color: '#C4A882', borderColor: 'rgba(196,168,130,0.3)' },
  rafter_banner:     { label: 'Rafter Banner Sponsor',  color: '#C4A882', borderColor: 'rgba(196,168,130,0.3)' },
}

/**
 * Server-side sponsor fetch. Cookieless anon client so the result is cacheable
 * and the sponsor wall lands in the server HTML - sponsors pay for visibility,
 * so this has to be crawlable rather than hydrated in after paint.
 */
const getSponsors = unstable_cache(
  async (): Promise<Sponsor[]> => {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('is_active', true)
      .single()

    if (!event) return []

    // No join into `invoices` - that subquery triggers the RLS recursion fixed
    // in migration 027, and it also excluded trade/in-kind sponsors, who have
    // no invoice row. Visibility is admin-controlled via the placement flags.
    const { data, error } = await supabase
      .from('sponsors_public')
      .select('id, sponsor_name, tier, logo_url, website, instagram, facebook')
      .eq('event_id', event.id)
      .order('sponsor_name')

    if (error) {
      console.error(
        `[sponsors] query failed (${error.code}): ${error.message} - rendering empty state.`
      )
    }

    // Harness rows are anon-visible on purpose; see src/lib/sponsor-display.ts.
    return excludeHarnessSponsors((data as unknown as Sponsor[]) ?? [])
  },
  ['sponsors_public'],
  { revalidate: 60, tags: ['sponsors'] }
)

const ICON_CLASS =
  'flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] transition-colors hover:bg-[#8B7355]/25'

export default async function SponsorsPage() {
  const [c, sponsors] = await Promise.all([getContent('sponsors'), getSponsors()])

  const grouped = TIER_ORDER.reduce<Record<string, Sponsor[]>>((acc, tier) => {
    const tierSponsors = sponsors.filter(s => s.tier === tier)
    if (tierSponsors.length > 0) acc[tier] = tierSponsors
    return acc
  }, {})

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">{c.header_eyebrow}</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">{c.header_title}</span>
        </h1>
        <div className="mx-auto mt-3 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">
            <Markdown inline>{c.header_intro}</Markdown>
          </span>
        </div>
      </div>

      {/* Current Sponsors */}
      {sponsors.length > 0 && (
        <div className="px-4 py-12">
          <div className="mx-auto max-w-5xl">
            {Object.entries(grouped).map(([tier, tierSponsors]) => {
              const meta = TIER_META[tier] ?? { label: tier, color: '#C4A882', borderColor: '#2a2a2a' }
              const isTitle = tier === 'title'
              return (
                <div key={tier} className="mb-10">
                  <h2 className="mb-5 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: meta.color }}>
                    <span className="text-emboss">{meta.label}</span>
                  </h2>
                  <div className="flex flex-wrap justify-center gap-6">
                    {tierSponsors.map(s => (
                      <div key={s.id} className="group flex flex-col items-center">
                        <a
                          href={s.website ?? '#'}
                          target={s.website ? '_blank' : undefined}
                          rel="noopener noreferrer"
                          className="flex flex-col items-center transition-transform hover:scale-105"
                        >
                          <div
                            className="flex items-center justify-center overflow-hidden rounded-2xl"
                            style={{
                              width: isTitle ? 200 : tier === 'platinum' ? 160 : 120,
                              height: isTitle ? 200 : tier === 'platinum' ? 160 : 120,
                              backgroundColor: '#111',
                              border: `2px solid ${meta.borderColor}`,
                            }}
                          >
                            {s.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.logo_url} alt={s.sponsor_name} className="h-full w-full object-contain p-3" />
                            ) : (
                              <span className="font-display text-3xl font-bold" style={{ color: meta.color }}>
                                {s.sponsor_name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-center text-sm font-medium text-white group-hover:underline">
                            {s.sponsor_name}
                          </p>
                        </a>
                        {/* Social icons */}
                        <div className="mt-1.5 flex items-center gap-2">
                          {s.website && (
                            <a
                              href={s.website.startsWith('http') ? s.website : `https://${s.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Website"
                              className={ICON_CLASS}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="2" y1="12" x2="22" y2="12"/>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                              </svg>
                            </a>
                          )}
                          {s.instagram && (
                            <a
                              href={`https://instagram.com/${s.instagram.replace(/^@/, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Instagram"
                              className={ICON_CLASS}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                              </svg>
                            </a>
                          )}
                          {s.facebook && (
                            <a
                              href={s.facebook.startsWith('http') ? s.facebook : `https://facebook.com/${s.facebook}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Facebook"
                              className={ICON_CLASS}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                              </svg>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {sponsors.length === 0 && (
        <div className="flex h-40 flex-col items-center justify-center gap-3 px-4">
          <p className="text-sm" style={{ color: '#555' }}>
            <span className="text-emboss">{c.empty_body}</span>
          </p>
        </div>
      )}

      {/* CTA */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-4 text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">{c.cta_body}</span>
        </p>
        <Link
          href="/sponsors/packages"
          className="inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#8B7355' }}
        >
          {c.cta_button}
        </Link>
      </div>
    </div>
  )
}
