import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { excludeHarnessSponsors } from '@/lib/sponsor-display'

/**
 * Collector's Choice sponsor slot. SERVER rendered.
 *
 * This is the surface behind the packages line 'Your logo on our Collector's
 * Choice voting page'. Until recently that placement was SOLD and had nowhere to
 * render - /contests carried a comment claiming it did, and no query.
 *
 * The copy said 'every vote page of our website', plural, and was corrected to
 * the singular on 2026-08-31. There is ONE vote page - /contests, listing every
 * category inline - so the plural implied pages that do not exist. Settled by
 * fixing the promise rather than by building pages to match loose wording.
 *
 * Renders NOTHING when no sponsor has show_on_vote_pages ticked. That is the
 * normal state today and will be until Ryan ticks one: the slot is ready and
 * empty rather than reserving space or showing a placeholder.
 *
 * Server-rendered on purpose, same reasoning as FooterSponsors. A logo injected
 * after hydration carries little SEO value, and this is a paid placement.
 */
interface VoteSponsor {
  id: string
  sponsor_name: string
  logo_url: string | null
  website: string | null
}

const getVoteSponsors = unstable_cache(
  async (): Promise<VoteSponsor[]> => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data, error } = await supabase
      .from('sponsors_public')
      .select('id, sponsor_name, logo_url, website')
      .eq('show_on_vote_pages', true)

    if (error) {
      // 42703 means migration 063 has not been applied yet - the column does
      // not exist. Render nothing rather than throwing: an unapplied migration
      // should leave the page as it was, not break it.
      console.error(
        `[vote-sponsors] query failed (${error.code}): ${error.message} - slot renders nothing. ` +
        'If 42703, migration 063 has not been applied.'
      )
      return []
    }
    // Harness rows are anon-visible on purpose; see src/lib/sponsor-display.ts.
    return excludeHarnessSponsors((data as unknown as VoteSponsor[]) ?? [])
  },
  ['vote_page_sponsors'],
  { revalidate: 60, tags: ['sponsors'] }
)

export default async function VotePageSponsors({ className }: { className?: string }) {
  const sponsors = await getVoteSponsors()
  if (sponsors.length === 0) return null

  return (
    <div className={className}>
      <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#999' }}>
        Collector&apos;s Choice presented by
      </p>
      <div className="flex flex-wrap items-center justify-center gap-6">
        {sponsors.map(s => {
          const inner = s.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logo_url} alt={s.sponsor_name} className="h-12 w-auto object-contain" loading="lazy" />
          ) : (
            <span className="text-sm font-bold" style={{ color: '#C4A882' }}>{s.sponsor_name}</span>
          )
          return s.website ? (
            <a key={s.id} href={s.website} target="_blank" rel="noreferrer noopener" className="transition-opacity hover:opacity-80">
              {inner}
            </a>
          ) : (
            <span key={s.id}>{inner}</span>
          )
        })}
      </div>
    </div>
  )
}
