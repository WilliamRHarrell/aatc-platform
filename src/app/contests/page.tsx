import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getContent } from '@/content/getContent'
import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'
import VotingBoard, { type Contest, type Entry } from './VotingBoard'
import { COLLECTORS_CHOICE_PRIZE } from '@/lib/event-config'
import VotePageSponsors from '@/components/VotePageSponsors'

export const metadata: Metadata = {
  title: 'AATC Collector’s Choice | Vote for Your Favorite Tattoo | AATC 2027',
  description:
    'Every trophy-winning tattoo from the All American Tattoo Convention - first, second and third in each category - is posted here for voting after the show. Voting is free and needs an account. ' +
    COLLECTORS_CHOICE_PRIZE,
}

/**
 * Server-side contest fetch. The entry grid and the surrounding prose have to be
 * in the server HTML - this page carries the Collector's Choice sponsor
 * placement (VotePageSponsors below), so it must be crawlable rather than
 * rendered after hydration. That comment described an intention for some time
 * before the slot existed; it is now true.
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

/**
 * The voting window, from events.voting_opens_at / voting_closes_at via
 * voting_state(). Deliberately independent of whether entries exist: trophy
 * winners are uploaded on the Sunday evening while the photos are fresh, and
 * voting must stay shut until the Wednesday regardless.
 *
 * The RLS policy in migration 061 is what actually closes voting. This only
 * decides which of three sentences a visitor reads - hiding the board is not a
 * gate, the same way hiding the pinup form was not one.
 */
const getVotingState = unstable_cache(
  async (): Promise<'unscheduled' | 'before' | 'open' | 'closed'> => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: event } = await supabase.from('events').select('id').eq('is_active', true).maybeSingle()
    if (!event) return 'unscheduled'
    const { data, error } = await supabase.rpc('voting_state', { p_event_id: event.id })
    if (error) {
      // 42883 means migration 061 has not been applied yet. Treat an unknown
      // state as 'before' rather than 'open': showing a board that cannot
      // accept votes is worse than saying voting has not started.
      console.error(`[contests] voting_state failed (${error.code}): ${error.message} - treating as before.`)
      return 'before'
    }
    return (data as 'unscheduled' | 'before' | 'open' | 'closed') ?? 'before'
  },
  ['voting_state'],
  { revalidate: 60, tags: ['contests'] }
)

export default async function ContestsPage() {
  const [c, contests, votingState] = await Promise.all([
    getContent('contests'),
    getContests(),
    getVotingState(),
  ])

  // 'unscheduled' reads as 'before' to a visitor: no window configured is not a
  // state anyone outside the admin needs a distinct sentence for.
  const phase = votingState === 'closed' ? 'closed' : votingState === 'open' ? 'open' : 'before'
  const showBoard = phase === 'open' && contests.length > 0

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

      {/* The Collector's Choice placement. Renders nothing until a sponsor has
          show_on_vote_pages ticked, which is the state today. */}
      <VotePageSponsors className="mx-auto max-w-5xl px-4 pt-8" />

      <div className="mx-auto max-w-5xl px-4 py-10">
        {!showBoard ? (
          <div className="rounded-2xl px-5 py-20 text-center" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <p className="text-sm font-medium text-white">
              {phase === 'before' ? c.before_title : phase === 'closed' ? c.closed_title : c.empty_title}
            </p>
            <div className="mt-1 text-sm" style={{ color: '#555' }}>
              <Markdown inline>
                {phase === 'before' ? c.before_body : phase === 'closed' ? c.closed_body : c.empty_body}
              </Markdown>
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
