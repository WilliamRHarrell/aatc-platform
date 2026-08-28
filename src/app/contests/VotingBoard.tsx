'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

export interface Entry {
  id: string
  contest_id: string
  collector_name: string
  artist_name: string | null
  photo_url: string | null
}

export interface Contest {
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
function Lightbox({ entry, onClose }: { entry: Entry; onClose: () => void }) {
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
      <div className="relative flex max-h-full w-full max-w-3xl flex-col">
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

        <div className="relative w-full overflow-hidden rounded-2xl" style={{ maxHeight: 'calc(100vh - 120px)' }}>
          <Image
            src={entry.photo_url!}
            alt={entry.collector_name}
            width={1200}
            height={1200}
            style={{ width: '100%', height: 'auto', maxHeight: 'calc(100vh - 120px)', objectFit: 'contain' }}
          />
        </div>

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

/**
 * Client island: voting, lightbox and vote-progress only.
 *
 * Contest data arrives already fetched from the server component, and CMS prose
 * arrives as pre-rendered ReactNodes (`voteHint`, `thankYou`) so the markdown is
 * still rendered on the server — this island never renders CMS copy itself.
 */
export default function VotingBoard({
  contests,
  voteHint,
  thankYou,
}: {
  contests: Contest[]
  voteHint: ReactNode
  thankYou: ReactNode
}) {
  const supabase = createClient()
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [voting, setVoting] = useState<string | null>(null)
  const [lightboxEntry, setLightboxEntry] = useState<Entry | null>(null)

  useEffect(() => {
    setChoices(loadChoices())
  }, [])

  const castVote = async (contest: Contest, entry: Entry) => {
    if (choices[contest.id]) return
    setVoting(entry.id)

    const token = getVoterToken()
    // .select() is required: this runs on the show floor with no developer
    // present, and a silently-dropped insert means uncounted votes and a
    // contest-integrity problem in front of the artists.
    const { data: inserted, error } = await supabase
      .from('contest_votes')
      .insert({ entry_id: entry.id, contest_id: contest.id, voter_token: token })
      .select('id')

    if (!error && (!inserted || inserted.length === 0)) {
      console.error(`[vote] 0 rows inserted for entry ${entry.id} - no error returned`)
      toast.error('Your vote did not register. Please try again.')
      setVoting(null)
      return
    }

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
      toast.success(`Vote recorded for ${entry.collector_name}`)
    }
    setVoting(null)
  }

  const votedCount = Object.keys(choices).filter(cid => contests.some(c => c.id === cid)).length

  return (
    <>
      {lightboxEntry && <Lightbox entry={lightboxEntry} onClose={() => setLightboxEntry(null)} />}

      {/* Progress */}
      <p className="mb-1 text-center text-xs" style={{ color: '#555' }}>
        <span className="text-emboss" suppressHydrationWarning>
          {votedCount} of {contests.length} categor{contests.length !== 1 ? 'ies' : 'y'} voted
        </span>
      </p>
      <div className="mb-10 h-0.5 w-full" style={{ backgroundColor: '#1a1a1a' }}>
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${(votedCount / contests.length) * 100}%`, backgroundColor: '#8B7355' }}
          suppressHydrationWarning
        />
      </div>

      <div className="space-y-14">
        {contests.map(contest => {
          const chosen = choices[contest.id]
          const hasVoted = !!chosen
          return (
            <section key={contest.id}>
              {/* Category header */}
              <div className="mb-5">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-2xl font-bold text-white">
                    <span className="text-emboss">{contest.name}</span>
                  </h2>
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
                  <p className="mt-1 text-sm" style={{ color: '#666' }}>
                    <span className="text-emboss">{contest.description}</span>
                  </p>
                )}
                {!hasVoted && (
                  <div className="mt-1 text-xs" style={{ color: '#555' }}>
                    <span className="text-emboss">{voteHint}</span>
                  </div>
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
                        border: isChosen ? '2px solid rgba(139,115,85,0.8)' : '1px solid #2a2a2a',
                        opacity: isOther ? 0.5 : 1,
                      }}
                    >
                      {entry.photo_url ? (
                        <div
                          className="relative h-52 w-full cursor-zoom-in overflow-hidden"
                          onClick={() => setLightboxEntry(entry)}
                        >
                          <Image src={entry.photo_url} alt={entry.collector_name} fill style={{ objectFit: 'cover' }} />
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
        {votedCount === contests.length && contests.length > 0 && thankYou}
      </div>
    </>
  )
}
