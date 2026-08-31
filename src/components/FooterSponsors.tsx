import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { excludeHarnessSponsors, HARNESS_PREFIX } from '@/lib/sponsor-display'

/**
 * Footer sponsor logos - SERVER rendered.
 *
 * This was a client-side fetch in SiteFooter, which meant sponsor logos and
 * their outbound links were injected after hydration on all 63 pages. Every
 * sponsorship tier in the packet includes site logo placement, and a
 * client-injected link carries little to no SEO value - so sponsors were
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

    // No join into `invoices` - that subquery is the 42P17 cycle (migration 028).
    //
    // THE CAP OF 5 WAS REMOVED 2026-08-31, and the two defects it was hiding
    // with it.
    //
    // It had no layout basis. This renders into `flex flex-wrap`, so logos flow
    // onto further rows at any count and nothing breaks at 8 or 12; the footer
    // simply gets taller. Meanwhile the cap collided with the placement rule
    // that Gold and above appear in the footer, which Title + Platinum + Gold
    // would have exceeded before April. A number with no layout behind it is not
    // worth ordering rules or rotation to defend, so it went.
    //
    // NOTED, NOT SOLVED: on mobile the logos are h-14 and wrap roughly two or
    // three per row, so a dozen sponsors is about five rows of footer on every
    // page. That is a real design consideration, and it argues for SMALLER
    // LOGOS AT HIGHER COUNTS - not for a cap, and certainly not for five.
    // Revisit when the footer actually holds enough sponsors to feel it; there
    // is one today.
    //
    // 1. ORDER. There was previously no `order by` at all under the limit, so
    //    Postgres returned an arbitrary five - plan-dependent and free to differ
    //    between two identical queries. The sixth sponsor vanished silently and
    //    WHICH five survived was undecidable from the code: a sold placement
    //    that renders or not at the planner's discretion. Ordering is by tier
    //    first, which sorts by ENUM DECLARATION ORDER (title, platinum, gold,
    //    silver, brass, then the individual items) and so happens to be
    //    descending value, then by name to break ties. Deterministic either way,
    //    which is the requirement; the cap being gone is not a reason to leave
    //    render order undefined.
    //
    // 2. HARNESS ROWS, EXCLUDED SERVER-SIDE. excludeHarnessSponsors ran AFTER
    //    the limit, so a harness row inside the window cost a real sponsor their
    //    slot - four logos rendered while five were flagged. Removing the limit
    //    dissolves that, but the exclusion is done in the query anyway so the
    //    defect cannot come back with any future limit. The presentation-layer
    //    filter below is kept as well: it is the documented single place for
    //    this rule and it still catches rows this predicate cannot.
    const { data, error } = await supabase
      .from('sponsors_public')
      .select('id, sponsor_name, logo_url, website')
      .eq('featured_footer', true)
      .not('sponsor_name', 'ilike', `${HARNESS_PREFIX}%`)
      .order('tier')
      .order('sponsor_name')

    if (error) {
      console.error(`[footer] sponsor query failed (${error.code}): ${error.message}`)
      return []
    }
    // Harness rows are anon-visible on purpose; see src/lib/sponsor-display.ts.
    return excludeHarnessSponsors((data as unknown as FooterSponsor[]) ?? [])
  },
  ['footer_sponsors'],
  { revalidate: 60, tags: ['sponsors'] }
)

/**
 * REMOVED 2026-08-31: a placeholder image stood here, pointing at
 * site-assets/skin-reserve-home-2.webp, and it was used for ANY footer sponsor
 * with no logo uploaded:
 *
 *     <img src={s.logo_url || PLACEHOLDER_IMG} alt={s.sponsor_name} />
 *
 * Skin Reserve is a REAL BUSINESS - named on /info/policies as an aftercare
 * vendor selling on the floor. So a sponsor without a logo would have rendered
 * SKIN RESERVE'S ARTWORK captioned with that sponsor's name, hyperlinked to
 * their website with rel="sponsored". One company's brand presented as
 * another's, on every page of the site.
 *
 * It had never fired: the only row that ever had featured_footer set was the
 * RLS harness, which is filtered out. The three real sponsors are entered from
 * invoice data and their logos arrive separately, so this would have gone live
 * the moment the footer had anything to render. A path that has never executed
 * successfully is where the next defect sits.
 *
 * This is "no placeholder humans" applied to brands. The rule forbids inventing
 * a person's name or credential; showing one business's mark under another
 * business's name is the same failure with a logo instead of a face.
 *
 * The fallback is now the sponsor's NAME as text, which is honest, and matches
 * what /sponsors already did - it renders the sponsor's initial rather than
 * borrowing an image.
 */

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
            // No logo means no logo. A sponsor is never represented by another
            // sponsor's artwork; the name is rendered as a wordmark instead.
            const img = s.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.logo_url}
                alt={s.sponsor_name}
                title={s.sponsor_name}
                className="h-14 w-auto opacity-60 grayscale transition-all hover:opacity-100 hover:grayscale-0 sm:h-20"
              />
            ) : (
              <span
                title={s.sponsor_name}
                className="font-display flex h-14 items-center text-base font-bold opacity-60 transition-opacity hover:opacity-100 sm:h-20 sm:text-lg"
                style={{ color: '#C4A882' }}
              >
                {s.sponsor_name}
              </span>
            )
            return s.website ? (
              <a
                key={s.id}
                href={s.website.startsWith('http') ? s.website : `https://${s.website}`}
                target="_blank"
                /* paid placement - Google's guidelines for sponsored links */
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
