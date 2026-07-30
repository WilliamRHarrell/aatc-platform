import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Footer sponsor logos — SERVER rendered.
 *
 * This was a client-side fetch in SiteFooter, which meant sponsor logos and
 * their outbound links were injected after hydration on all 63 pages. Every
 * sponsorship tier in the packet includes site logo placement, and a
 * client-injected link carries little to no SEO value — so sponsors were
 * receiving materially less than was sold to them. Same fix class as /contests
 * and /directory, applied to the one component that appears on every page.
 *
 * Rendered from the root layout and passed into SiteFooter as a prop, because
 * SiteFooter has to stay a client component for its usePathname admin check.
 */
interface FooterSponsor {
  id: string
  sponsor_name: string
  logo_url: string | null
  website: string | null
}

const getFooterSponsors = unstable_cache(
  async (): Promise<FooterSponsor[]> => {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // No join into `invoices` — that subquery is the 42P17 cycle (migration 028).
    const { data, error } = await supabase
      .from('sponsorships')
      .select('id, sponsor_name, logo_url, website')
      .eq('featured_footer', true)
      .eq('status', 'confirmed')
      .limit(5)

    if (error) {
      console.error(`[footer] sponsor query failed (${error.code}): ${error.message}`)
      return []
    }
    return (data as unknown as FooterSponsor[]) ?? []
  },
  ['footer_sponsors'],
  { revalidate: 60, tags: ['sponsors'] }
)

const PLACEHOLDER_IMG = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-assets/skin-reserve-home-2.webp`

export default async function FooterSponsors() {
  const sponsors = await getFooterSponsors()

  // Never a heading over nothing.
  if (sponsors.length === 0) return null

  return (
    <div className="border-t px-4 py-10" style={{ borderColor: '#2a2a2a' }}>
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: '#999' }}>
          AATC 2027
        </p>
        <p className="font-display mx-auto mt-1 max-w-xl text-base font-bold sm:text-lg" style={{ color: '#C4A882' }}>
          Thank you to our sponsors for helping make this happen for Fayetteville &amp; Ft Bragg NC!
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {sponsors.map(s => {
            const img = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.logo_url || PLACEHOLDER_IMG}
                alt={s.sponsor_name}
                title={s.sponsor_name}
                className="h-14 w-auto opacity-60 grayscale transition-all hover:opacity-100 hover:grayscale-0 sm:h-20"
              />
            )
            return s.website ? (
              <a
                key={s.id}
                href={s.website.startsWith('http') ? s.website : `https://${s.website}`}
                target="_blank"
                /* paid placement — Google's guidelines for sponsored links */
                rel="noopener sponsored"
              >
                {img}
              </a>
            ) : (
              <span key={s.id}>{img}</span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
