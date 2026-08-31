'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { guardedWrite } from '@/lib/db-write'

interface Contest {
  id: string
  name: string
  description: string | null
}

interface Entry {
  id: string
  contest_id: string
  collector_name: string
  artist_name: string | null
  photo_url: string | null
  votes: number
}

export default function ContestEntriesPage() {
  const { id: contestId } = useParams<{ id: string }>()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [contest, setContest] = useState<Contest | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [working, setWorking] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState({ collector_name: '', artist_name: '' })
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const [{ data: contestData }, { data: entriesData }, { data: votesData }] = await Promise.all([
        supabase
          .from('contests')
          .select('id, name, description')
          .eq('id', contestId)
          .single(),
        supabase
          .from('contest_entries')
          .select('id, contest_id, collector_name, artist_name, photo_url')
          .eq('contest_id', contestId)
          .order('created_at', { ascending: true }),
        supabase
          .from('contest_votes')
          .select('entry_id')
          .eq('contest_id', contestId),
      ])

      if (contestData) setContest(contestData as Contest)

      const voteCounts = new Map<string, number>()
      votesData?.forEach(v => voteCounts.set(v.entry_id, (voteCounts.get(v.entry_id) ?? 0) + 1))

      const list: Entry[] = (entriesData ?? []).map(e => ({
        ...(e as unknown as Omit<Entry, 'votes'>),
        votes: voteCounts.get(e.id) ?? 0,
      }))
      setEntries(list.sort((a, b) => b.votes - a.votes))
      setLoading(false)
    }
    load()
  }, [contestId])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setPhotoFile(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setPhotoPreview(url)
    } else {
      setPhotoPreview(null)
    }
  }

  const cancelAdd = () => {
    setAdding(false)
    setForm({ collector_name: '', artist_name: '' })
    setPhotoFile(null)
    setPhotoPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const saveEntry = async () => {
    if (!form.collector_name.trim()) return
    setWorking(true)

    let photoUrl: string | null = null

    if (photoFile) {
      const ext = photoFile.name.split('.').pop() ?? 'jpg'
      const path = `${contestId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('contest-photos')
        .upload(path, photoFile, { upsert: false })

      if (uploadError) {
        toast.error('Photo upload failed')
        setWorking(false)
        return
      }

      const { data: urlData } = supabase.storage.from('contest-photos').getPublicUrl(path)
      photoUrl = urlData.publicUrl
    }

    const { data, error } = await supabase
      .from('contest_entries')
      .insert({
        contest_id: contestId,
        collector_name: form.collector_name.trim(),
        artist_name: form.artist_name.trim() || null,
        photo_url: photoUrl,
      })
      .select('id, contest_id, collector_name, artist_name, photo_url')
      .single()

    if (!error && data) {
      setEntries(prev => [...prev, { ...(data as unknown as Omit<Entry, 'votes'>), votes: 0 }])
      toast.success('Entry added')
      cancelAdd()
    } else {
      toast.error('Failed to add entry')
    }
    setWorking(false)
  }

  const deleteEntry = async (entry: Entry) => {
    if (!window.confirm(`Delete "${entry.collector_name}"?`)) return
    setDeleting(entry.id)

    if (entry.photo_url) {
      const path = entry.photo_url.split('/contest-photos/')[1]
      if (path) {
        await supabase.storage.from('contest-photos').remove([path])
      }
    }

    // Guarded, and the ordering above matters: the storage photo is removed
    // BEFORE this. An RLS-filtered delete returns error: null and zero rows, so
    // the entry would have stayed in the database with its photo already gone -
    // a competition record left pointing at a dead image, while the UI said it
    // was deleted. contest_entries rows are results, not copy.
    const res = await guardedWrite(
      supabase.from('contest_entries').delete().eq('id', entry.id).select('id'),
      'Entry not deleted',
      `admin/contests/${contestId} deleteEntry id=${entry.id}`,
    )
    if (res.ok) {
      setEntries(prev => prev.filter(e => e.id !== entry.id))
      toast.success('Entry deleted')
    } else {
      toast.error(res.error)
    }
    setDeleting(null)
  }

  const totalVotes = entries.reduce((s, e) => s + e.votes, 0)

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!contest) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm" style={{ color: '#555' }}>Contest not found.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/contests"
          className="mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest transition-colors"
          style={{ color: '#555' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#555')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          All Contests
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{contest.name}</h1>
            <p className="mt-1 text-sm" style={{ color: '#999' }}>
              {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
              {totalVotes > 0 ? ` · ${totalVotes} vote${totalVotes !== 1 ? 's' : ''}` : ''}
            </p>
          </div>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: '#8B7355' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Entry
            </button>
          )}
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-6 rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(139,115,85,0.4)' }}>
          <p className="mb-4 text-xs font-bold uppercase tracking-widest" style={{ color: '#8B7355' }}>New Entry</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Photo upload */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>
                Photo
              </label>
              <div className="flex items-center gap-4">
                {photoPreview ? (
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl" style={{ border: '1px solid #2a2a2a' }}>
                    <Image src={photoPreview} alt="Preview" fill style={{ objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div
                    className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: '#0a0a0a', border: '2px dashed #2a2a2a' }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                )}
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoChange}
                    className="hidden"
                    id="photo-upload"
                  />
                  <label
                    htmlFor="photo-upload"
                    className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold"
                    style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                  >
                    {photoFile ? 'Change Photo' : 'Upload Photo'}
                  </label>
                  {photoFile && (
                    <button
                      onClick={() => { setPhotoFile(null); setPhotoPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                      className="ml-2 text-xs"
                      style={{ color: '#555' }}
                    >
                      Remove
                    </button>
                  )}
                  <p className="mt-1 text-xs" style={{ color: '#444' }}>JPG, PNG or WebP · max 10 MB</p>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>
                Collector Name *
              </label>
              <input
                type="text"
                placeholder="Tattoo collector's name"
                value={form.collector_name}
                onChange={e => setForm(f => ({ ...f, collector_name: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff' }}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>
                Artist Name
              </label>
              <input
                type="text"
                placeholder="Tattoo artist's name"
                value={form.artist_name}
                onChange={e => setForm(f => ({ ...f, artist_name: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff' }}
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={saveEntry}
              disabled={working || !form.collector_name.trim()}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#8B7355' }}
            >
              {working ? 'Saving…' : 'Add Entry'}
            </button>
            <button
              onClick={cancelAdd}
              className="rounded-lg px-4 py-2 text-sm font-medium"
              style={{ color: '#666', border: '1px solid #2a2a2a' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Entries grid */}
      {entries.length === 0 && !adding ? (
        <div
          className="rounded-2xl px-5 py-16 text-center"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          <p className="mb-1 text-sm font-medium text-white">No entries yet</p>
          <p className="text-sm" style={{ color: '#555' }}>
            Click &ldquo;Add Entry&rdquo; to upload nominees for this category.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry, rank) => (
            <div
              key={entry.id}
              className="relative overflow-hidden rounded-2xl"
              style={{ backgroundColor: '#1a1a1a', border: rank === 0 && entry.votes > 0 ? '1px solid rgba(139,115,85,0.5)' : '1px solid #2a2a2a' }}
            >
              {/* Leading badge */}
              {rank === 0 && entry.votes > 0 && (
                <div
                  className="absolute left-3 top-3 z-10 rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{ backgroundColor: 'rgba(139,115,85,0.9)', color: '#fff' }}
                >
                  Leading
                </div>
              )}

              {/* Photo */}
              {entry.photo_url ? (
                <div className="relative h-48 w-full overflow-hidden">
                  <Image
                    src={entry.photo_url}
                    alt={entry.collector_name}
                    fill
                    style={{ objectFit: 'cover' }}
                  />
                </div>
              ) : (
                <div
                  className="flex h-48 w-full items-center justify-center"
                  style={{ backgroundColor: '#0a0a0a' }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
              )}

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{entry.collector_name}</p>
                    {entry.artist_name && (
                      <p className="truncate text-xs" style={{ color: '#999' }}>by {entry.artist_name}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold" style={{ color: '#C4A882' }}>{entry.votes}</p>
                    <p className="text-xs" style={{ color: '#555' }}>vote{entry.votes !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                <button
                  onClick={() => deleteEntry(entry)}
                  disabled={deleting === entry.id}
                  className="mt-3 w-full rounded-lg py-1.5 text-xs font-semibold transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
                >
                  {deleting === entry.id ? 'Deleting…' : 'Delete Entry'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
