import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { getContent } from '@/content/getContent'
import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'
import { ROUTES } from '@/lib/routes'
import { groupByEventYear } from '@/lib/wall-of-honor-publish'
import { WOH_PUBLIC_BUCKET } from '@/lib/wall-of-honor-submission'
import type { Database } from '@/types/database'
import HonoreePhotos from './HonoreePhotos'

// NO PLACEHOLDER HUMANS. Every name on this page comes from a published,
// family-submitted (or imported) tribute in wall_of_honor_public. Nothing is
// ever hard-coded here; the empty state ships until the view has rows.
//
// Metadata lives on layout.tsx.

type PublicRow = Database['public']['Views']['wall_of_honor_public']['Row']
type Honoree = Omit<PublicRow, 'photo_paths'> & { photo_urls: string[] }

// The published wall, read with a cookieless anon client and cached 60 s under
// the 'wall-of-honor' tag; the admin publish route purges the tag and this
// path. A failed read shows the empty state rather than an error page.
const getHonorees = unstable_cache(
  async (): Promise<Honoree[]> => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data, error } = await sb
      .from('wall_of_honor_public')
      .select('id, honoree_name, honoree_rank, branch, unit, service_years, tribute, photo_paths, published_at, event_year')
      .order('published_at', { ascending: false, nullsFirst: false })
    if (error) {
      console.error(`[wall-of-honor] public read failed (${error.code}): ${error.message} - showing the empty state`)
      return []
    }
    const bucket = sb.storage.from(WOH_PUBLIC_BUCKET)
    return ((data ?? []) as PublicRow[]).map(({ photo_paths, ...r }) => ({
      ...r,
      photo_urls: (photo_paths ?? []).map(p => bucket.getPublicUrl(p).data.publicUrl),
    }))
  },
  ['wall-of-honor-public'],
  { revalidate: 60, tags: ['wall-of-honor'] },
)

function HonoreeCard({ h }: { h: Honoree }) {
  const serviceLine = [h.honoree_rank, h.branch].filter(Boolean).join(', ')
  return (
    <article className="overflow-hidden rounded-2xl" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <HonoreePhotos urls={h.photo_urls} name={h.honoree_name} />
      <div className="p-6">
        <div className="text-center">
          <h3 className="text-base font-bold text-white">{h.honoree_name}</h3>
          {serviceLine && (
            <p className="mt-1 text-xs font-medium" style={{ color: '#C4A882' }}>{serviceLine}</p>
          )}
          {h.unit && <p className="mt-0.5 text-xs" style={{ color: '#999' }}>{h.unit}</p>}
          {h.service_years && <p className="mt-0.5 text-xs" style={{ color: '#666' }}>{h.service_years}</p>}
        </div>
        {/* Families write paragraphs: keep their line breaks. */}
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed" style={{ color: '#999' }}>
          {h.tribute.trim()}
        </p>
      </div>
    </article>
  )
}

export default async function WallOfHonorPage() {
  const [honorees, c] = await Promise.all([getHonorees(), getContent('wallOfHonor')])
  const groups = groupByEventYear(honorees)

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Honoring Those Who Served</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Wall of Honor</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm leading-relaxed" style={{ color: '#999' }}>
          <span className="text-emboss">A dedicated space at the All American Tattoo Convention honoring the service members who made the ultimate sacrifice. Their courage, dedication, and love of country will never be forgotten. Families and fellow service members are invited to submit photos and stories so that we may honor their memory together.</span>
        </p>
      </div>

      {/* About the Wall */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <h2 className="text-lg font-bold text-white">{c.intro_title}</h2>
            <div className="mx-auto mt-4 max-w-lg space-y-4 text-sm leading-relaxed" style={{ color: '#999' }}>
              <Markdown>{c.intro_body}</Markdown>
            </div>
            <div className="mx-auto mt-6 max-w-md rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #8B7355' }}>
              {/* Same facts, same words as the Gold Star section on
                  /events/vip-meet-greet - keep the two in step. Corrected
                  2026-09-13: the sentence credited the Crown Complex as
                  co-donor (it is not - ATS donates the passes and the Crown
                  still charges ATS the ticket fee), stated an exact 50, and
                  gave a second sign-up path ("contact us directly") alongside
                  the ACS route on the VIP page. Deliberately plain. */}
              <p className="text-sm font-semibold" style={{ color: '#C4A882' }}>
                American Tattoo Society donates around 50 VIP passes each year for Gold Star Family members.
              </p>
              <p className="mt-2 text-xs" style={{ color: '#999' }}>
                To sign up, contact the Army Community Service Survivor Outreach Services Support Coordinator, USAG Fort Bragg. Passes are first come, first served.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The wall: newest event year first, newest published first within it */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">In Memoriam</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Honoring their service and sacrifice</span>
          </p>
          {groups.length === 0 ? (
            <div className="rounded-2xl px-6 py-10 text-center" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              <p className="text-sm" style={{ color: '#999' }}>{c.empty_state}</p>
            </div>
          ) : (
            <div className="space-y-12">
              {groups.map(g => (
                <div key={g.year ?? 'no-year'}>
                  {g.year !== null && (
                    <h3 className="mb-6 text-center font-display text-2xl font-bold text-white">
                      <span className="text-emboss">{g.year}</span>
                    </h3>
                  )}
                  <div className="grid gap-6 md:grid-cols-2">
                    {g.rows.map(h => <HonoreeCard key={h.id} h={h} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How to Submit */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">{c.how_title}</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Honor your service member on the Wall of Honor</span>
          </p>
          <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <div className="space-y-4 text-sm leading-relaxed" style={{ color: '#999' }}>
              <Markdown>{c.how_body}</Markdown>
            </div>
            <div className="mt-6 text-center">
              <Link
                href={ROUTES.wallOfHonorSubmit}
                className="inline-block rounded-xl px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-80"
                style={{ backgroundColor: '#8B7355' }}
              >
                {c.submit_cta}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
