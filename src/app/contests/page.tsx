import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getContent } from '@/content/getContent'
import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'
import VotingBoard, { type Contest, type Entry } from './VotingBoard'
import { COLLECTORS_CHOICE_PRIZE } from '@/lib/event-config'

export const metadata: Metadata = {
  title: 'AATC Collector’s Choice | Vote for Your Favorite Tattoo | AATC 2027',
  description:
    'Every tattoo done at the All American Tattoo Convention is cataloged here for 30 days of public voting. ' +
    COLLECTORS_CHOICE_PRIZE,
}

/**
 * Server-side contest fetch. The entry grid and the surrounding prose have to be
 * in the server HTML - this page carries the Collector's Choice sponsor placement,
 * so it must be crawlable rather than rendered after hydration.
 */
const getContests = unstable_cache(
  async (): Promise<Contest[]> => {
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

    const [{ data: contestsData }, { data: entriesData }] = await Promise.all([
      supabase
        .from('contests')
        .select('id, name, description')
        .eq('event_id', event.id)
        .order('order', { ascending: true }),
      supabase
        .from('contest_entries')
        .select('id, contest_id, collector_name, artist_name, photo_url'),
    ])

    const entryMap = new Map<string, Entry[]>()
    ;(entriesData ?? []).forEach(e => {
      const list = entryMap.get(e.contest_id) ?? []
      list.push(e as unknown as Entry)
      entryMap.set(e.contest_id, list)
    })

    return (contestsData ?? [])
      .map(row => ({
        ...(row as unknown as Omit<Contest, 'entries'>),
        entries: entryMap.get(row.id) ?? [],
      }))
      .filter(item => item.entries.length > 0)
  },
  ['contests_public'],
  { revalidate: 60, tags: ['contests'] }
)

export default async function ContestsPage() {
  const [c, contests] = await Promise.all([getContent('contests'), getContests()])

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-8 pt-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">{c.header_title}</span>
        </h1>
        <p className="mt-2 text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">{c.header_subtitle}</span>
        </p>
        <div className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed" style={{ color: '#999' }}>
          <span className="text-emboss">
            <Markdown inline>{c.header_intro}</Markdown>
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10">
        {contests.length === 0 ? (
          <div className="rounded-2xl px-5 py-20 text-center" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <p className="text-sm font-medium text-white">{c.empty_title}</p>
            <div className="mt-1 text-sm" style={{ color: '#555' }}>
              <Markdown inline>{c.empty_body}</Markdown>
            </div>
          </div>
        ) : (
          <VotingBoard
            contests={contests}
            voteHint={c.vote_hint}
            thankYou={
              <div
                className="rounded-2xl px-5 py-8 text-center"
                style={{ backgroundColor: 'rgba(139,115,85,0.08)', border: '1px solid rgba(139,115,85,0.3)' }}
              >
                <p className="font-display text-xl font-bold text-white">{c.thankyou_title}</p>
                <div className="mt-1 text-sm" style={{ color: '#999' }}>
                  <Markdown inline>{c.thankyou_body}</Markdown>
                </div>
              </div>
            }
          />
        )}
      </div>

      {/* Footer */}
      <footer className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="font-display text-sm font-bold text-white">
          <span className="text-emboss">ALL AMERICAN TATTOO CONVENTION</span>
        </p>
        <p className="mt-1 text-xs" style={{ color: '#555' }}>
          <span className="text-emboss">Crown Complex Event Center · Fayetteville, NC</span>
        </p>
      </footer>
    </div>
  )
}
