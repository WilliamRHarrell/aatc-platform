'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'
import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'

interface Entry {
  id: string
  contest_id: string
  collector_name: string
  artist_name: string | null
  photo_url: string | null
}

interface Contest {
  id: string
  name: string
  description: string | null
  entries: Entry[]
}

// ── Voter token helpers ────────────────────────────────────
function getVoterToken(): string {
  let token = localStorage.getItem('aatc_voter_token')
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem('aatc_voter_token', token)
  }
  return token
}

function loadChoices(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem('aatc_voter_choices') ?? '{}')
  } catch {
    return {}
  }
}

function saveChoice(contestId: string, entryId: string) {
  const choices = loadChoices()
  choices[contestId] = entryId
  localStorage.setItem('aatc_voter_choices', JSON.stringify(choices))
}

// ── Lightbox ───────────────────────────────────────────────
function Lightbox({
  entry,
  onClose,
}: {
  entry: Entry
  onClose: () => void
}) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.9)' }}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="relative flex max-h-full max-w-3xl w-full flex-col">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -right-2 -top-10 flex h-8 w-8 items-center justify-center rounded-full text-white transition-opacity hover:opacity-70"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Image */}
        <div className="relative w-full overflow-hidden rounded-2xl" style={{ maxHeight: 'calc(100vh - 120px)' }}>
          <Image
            src={entry.photo_url!}
            alt={entry.collector_name}
            width={1200}
            height={1200}
            style={{ width: '100%', height: 'auto', maxHeight: 'calc(100vh - 120px)', objectFit: 'contain' }}
          />
        </div>

        {/* Caption */}
        <div className="mt-3 text-center">
          <p className="font-semibold text-white">{entry.collector_name}</p>
          {entry.artist_name && (
            <p className="mt-0.5 text-sm" style={{ color: '#999' }}>Tattoo by {entry.artist_name}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ContestsClient({ content }: { content: Record<string, string> }) {
  const c = content
  const supabase = createClient()
  const [contests, setContests] = useState<Contest[]>([])
  const [loading, setLoading] = useState(true)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [voting, setVoting] = useState<string | null>(null)
  const [lightboxEntry, setLightboxEntry] = useState<Entry | null>(null)

  useEffect(() => {
    setChoices(loadChoices())

    const load = async () => {
      const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .single()

      if (!event) { setLoading(false); return }

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

      const list: Contest[] = (contestsData ?? []).map(c => ({
        ...(c as unknown as Omit<Contest, 'entries'>),
        entries: entryMap.get(c.id) ?? [],
      })).filter(c => c.entries.length > 0)

      setContests(list)
      setLoading(false)
    }
    load()
  }, [])

  const castVote = async (contest: Contest, entry: Entry) => {
    if (choices[contest.id]) return
    setVoting(entry.id)

    const token = getVoterToken()
    const { error } = await supabase.from('contest_votes').insert({
      entry_id: entry.id,
      contest_id: contest.id,
      voter_token: token,
    })

    if (error) {
      if (error.code === '23505') {
        setChoices(prev => ({ ...prev, [contest.id]: entry.id }))
        saveChoice(contest.id, entry.id)
      } else {
        toast.error('Could not submit vote')
      }
    } else {
      setChoices(prev => ({ ...prev, [contest.id]: entry.id }))
      saveChoice(contest.id, entry.id)
      toast.success('Vote cast!')
    }
    setVoting(null)
  }

  const votedCount = Object.keys(choices).filter(cid =>
    contests.some(c => c.id === cid)
  ).length

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Lightbox */}
      {lightboxEntry && (
        <Lightbox entry={lightboxEntry} onClose={() => setLightboxEntry(null)} />
      )}

      {/* Header */}
      <div className="border-b px-4 pb-8 pt-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">{c.header_title}</span>
        </h1>
        <p className="mt-2 text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">{c.header_subtitle}</span>
        </p>
        {contests.length > 0 && (
          <p className="mt-2 text-xs" style={{ color: '#555' }}>
            <span className="text-emboss">{votedCount} of {contests.length} categor{contests.length !== 1 ? 'ies' : 'y'} voted</span>
          </p>
        )}
      </div>

      {/* Progress bar */}
      {contests.length > 0 && (
        <div className="h-0.5 w-full" style={{ backgroundColor: '#1a1a1a' }}>
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${(votedCount / contests.length) * 100}%`, backgroundColor: '#8B7355' }}
          />
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 py-10">

        {contests.length === 0 ? (
          <div
            className="rounded-2xl px-5 py-20 text-center"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <p className="text-sm font-medium text-white">{c.empty_title}</p>
            <p className="mt-1 text-sm" style={{ color: '#555' }}>
              <Markdown inline>{c.empty_body}</Markdown>
            </p>
          </div>
        ) : (
          <div className="space-y-14">
            {contests.map(contest => {
              const chosen = choices[contest.id]
              const hasVoted = !!chosen
              return (
                <section key={contest.id}>
                  {/* Category header */}
                  <div className="mb-5">
                    <div className="flex items-center gap-3">
                      <h2 className="font-display text-2xl font-bold text-white"><span className="text-emboss">{contest.name}</span></h2>
                      {hasVoted && (
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ade80' }}
                        >
                          Voted ✓
                        </span>
                      )}
                    </div>
                    {contest.description && (
                      <p className="mt-1 text-sm" style={{ color: '#666' }}><span className="text-emboss">{contest.description}</span></p>
                    )}
                    {!hasVoted && (
                      <p className="mt-1 text-xs" style={{ color: '#555' }}>
                        <span className="text-emboss">{c.vote_hint}</span>
                      </p>
                    )}
                  </div>

                  {/* Entry grid */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {contest.entries.map(entry => {
                      const isChosen = chosen === entry.id
                      const isOther = hasVoted && !isChosen
                      const isVotingThis = voting === entry.id

                      return (
                        <div
                          key={entry.id}
                          className="overflow-hidden rounded-2xl transition-all"
                          style={{
                            backgroundColor: '#1a1a1a',
                            border: isChosen
                              ? '2px solid rgba(139,115,85,0.8)'
                              : '1px solid #2a2a2a',
                            opacity: isOther ? 0.5 : 1,
                          }}
                        >
                          {/* Photo */}
                          {entry.photo_url ? (
                            <div
                              className="relative h-52 w-full cursor-zoom-in overflow-hidden"
                              onClick={() => setLightboxEntry(entry)}
                            >
                              <Image
                                src={entry.photo_url}
                                alt={entry.collector_name}
                                fill
                                style={{ objectFit: 'cover' }}
                              />
                              {/* Expand hint */}
                              <div
                                className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full opacity-70"
                                style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                                  <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                                </svg>
                              </div>
                              {isChosen && (
                                <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
                                  <div
                                    className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                                    style={{ backgroundColor: 'rgba(139,115,85,0.9)' }}
                                  >
                                    ✓
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex h-52 w-full items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
                              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                              </svg>
                            </div>
                          )}

                          {/* Info + vote button */}
                          <div className="p-4">
                            <p className="font-semibold text-white">{entry.collector_name}</p>
                            {entry.artist_name && (
                              <p className="mt-0.5 text-xs" style={{ color: '#666' }}>
                                Tattoo by {entry.artist_name}
                              </p>
                            )}

                            {isChosen ? (
                              <div
                                className="mt-3 rounded-xl py-2.5 text-center text-sm font-semibold"
                                style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882' }}
                              >
                                Your Vote ★
                              </div>
                            ) : (
                              <button
                                onClick={() => castVote(contest, entry)}
                                disabled={hasVoted || isVotingThis}
                                className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-30"
                                style={{ backgroundColor: '#8B7355' }}
                              >
                                {isVotingThis ? 'Submitting…' : 'Vote'}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}

            {/* All voted CTA */}
            {votedCount === contests.length && contests.length > 0 && (
              <div
                className="rounded-2xl px-5 py-8 text-center"
                style={{ backgroundColor: 'rgba(139,115,85,0.08)', border: '1px solid rgba(139,115,85,0.3)' }}
              >
                <p className="font-display text-xl font-bold text-white">{c.thankyou_title}</p>
                <p className="mt-1 text-sm" style={{ color: '#999' }}>
                  <Markdown inline>{c.thankyou_body}</Markdown>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="font-display text-sm font-bold text-white"><span className="text-emboss">ALL AMERICAN TATTOO CONVENTION</span></p>
        <p className="mt-1 text-xs" style={{ color: '#555' }}>
          <span className="text-emboss">Crown Complex Event Center · Fayetteville, NC</span>
        </p>
      </footer>
    </div>
  )
}
