import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { getContent } from '@/content/getContent'
import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'
import { ROUTES } from '@/lib/routes'
import { GOLD_STAR_PASSES_SENTENCE, WALL_OF_HONOR_EMAIL } from '@/lib/event-config'
import { WOH_PUBLIC_BUCKET } from '@/lib/wall-of-honor-submission'
import type { Database } from '@/types/database'
import HonoreePhotos from './HonoreePhotos'
import TributeText from './TributeText'

// NO PLACEHOLDER HUMANS. Every name on this page comes from a published,
// family-submitted (or imported) tribute in wall_of_honor_public. Nothing is
// ever hard-coded here; the empty state ships until the view has rows.
//
// Metadata lives on layout.tsx.

type PublicRow = Database['public']['Views']['wall_of_honor_public']['Row']
type Focus = { x: number; y: number } | null
type Honoree = Omit<PublicRow, 'photo_paths'> & { photo_urls: string[]; photo_focus_points: Focus[] }

// photo_focus is jsonb { [path]: { x, y } }. It may be absent entirely (view
// not yet migrated) or malformed: anything but numeric x and y is null.
function readFocus(raw: unknown, path: string): Focus {
  if (!raw || typeof raw !== 'object') return null
  const v = (raw as Record<string, unknown>)[path]
  if (!v || typeof v !== 'object') return null
  const { x, y } = v as Record<string, unknown>
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null
  const clamp = (n: number) => Math.min(100, Math.max(0, n))
  return { x: clamp(x), y: clamp(y) }
}

// The published wall, read with a cookieless anon client and cached 60 s under
// the 'wall-of-honor' tag; the admin publish route purges the tag and this
// path. A failed read shows the empty state rather than an error page.
const getHonorees = unstable_cache(
  async (): Promise<Honoree[]> => {
    try {
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data, error } = await sb
        .from('wall_of_honor_public')
        // select('*') on purpose: the view only gains photo_focus once migration
        // 107 is applied. An explicit column list naming photo_focus would fail
        // with 42703 before then and blank a live wall, so take whatever columns
        // exist and read photo_focus defensively below.
        .select('*')
        .order('published_at', { ascending: false, nullsFirst: false })
      if (error) {
        console.error(`[wall-of-honor] public read failed (${error.code}): ${error.message} - showing the empty state`)
        return []
      }
      const bucket = sb.storage.from(WOH_PUBLIC_BUCKET)
      return ((data ?? []) as PublicRow[]).map(({ photo_paths, ...r }) => {
        const paths = photo_paths ?? []
        const raw = (r as { photo_focus?: unknown }).photo_focus
        return {
          ...r,
          photo_urls: paths.map(p => bucket.getPublicUrl(p).data.publicUrl),
          photo_focus_points: paths.map(p => readFocus(raw, p)),
        }
      })
    } catch (e) {
      console.error(`[wall-of-honor] public read threw: ${e instanceof Error ? e.message : String(e)} - showing the empty state`)
      return []
    }
  },
  ['wall-of-honor-public'],
  { revalidate: 60, tags: ['wall-of-honor'] },
)

function HonoreeCard({ h }: { h: Honoree }) {
  const serviceLine = [h.honoree_rank, h.branch].filter(Boolean).join(', ')
  return (
    <article className="overflow-hidden rounded-2xl" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <HonoreePhotos urls={h.photo_urls} name={h.honoree_name} focus={h.photo_focus_points} />
      <div className="p-6">
        <div className="text-center">
          <h3 className="text-base font-bold text-white">{h.honoree_name}</h3>
          {serviceLine && (
            <p className="mt-1 text-xs font-medium" style={{ color: '#C4A882' }}>{serviceLine}</p>
          )}
          {h.unit && <p className="mt-0.5 text-xs" style={{ color: '#999' }}>{h.unit}</p>}
          {h.service_years && <p className="mt-0.5 text-xs" style={{ color: '#666' }}>{h.service_years}</p>}
        </div>
        <TributeText text={h.tribute.trim()} />
      </div>
    </article>
  )
}

export default async function WallOfHonorPage() {
  const [honorees, c] = await Promise.all([getHonorees(), getContent('wallOfHonor')])

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
          <span className="text-emboss">The Wall of Honor at the All American Tattoo Convention honors the service members who made the ultimate sacrifice. Their courage, dedication, and love of country will never be forgotten. Families and fellow service members are invited to submit photos and stories so that we may honor their memory together.</span>
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
              {/* The sentence is GOLD_STAR_PASSES_SENTENCE in event-config,
                  shared with /events/vip-meet-greet. As of Ryan 2026-10-23
                  the Crown Complex is a co-donor; that supersedes the
                  2026-09-13 note that said ATS alone donates and the Crown
                  charges the ticket fee. Do not revert it. Deliberately plain:
                  "around 50", one sign-up path (the ACS route below). */}
              <p className="text-sm font-semibold" style={{ color: '#C4A882' }}>
                {GOLD_STAR_PASSES_SENTENCE}
              </p>
              <p className="mt-2 text-xs" style={{ color: '#999' }}>
                To sign up, contact the Army Community Service Survivor Outreach Services Support Coordinator, USAG Fort Bragg. Passes are first come, first served.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* One continuous wall, newest published first. No year headings or year
          labels on public cards (Ryan, 2026-10-24); the event year stays in the
          admin and the print export. */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">In Memoriam</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Honoring their service and sacrifice</span>
          </p>
          {honorees.length === 0 ? (
            <div className="rounded-2xl px-6 py-10 text-center" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              <p className="text-sm" style={{ color: '#999' }}>{c.empty_state}</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {honorees.map(h => <HonoreeCard key={h.id} h={h} />)}
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
            <p className="mt-6 text-center text-xs" style={{ color: '#666' }}>
              Questions about the Wall of Honor?{' '}
              <a href={`mailto:${WALL_OF_HONOR_EMAIL}`} style={{ color: '#C4A882' }}>
                {WALL_OF_HONOR_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
