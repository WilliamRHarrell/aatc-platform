'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'

interface Submission {
  id: string
  artist_name: string
  instagram_handle: string
  square_paths: string[]
  vertical_paths: string[]
  caption: string
  status: 'submitted' | 'posted' | 'rejected'
  rejection_reason: string | null
  created_at: string
  exhibitor_id: string
}

export default function AATCQueuePage() {
  const supabase = createClient()
  const [subs, setSubs] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'submitted' | 'posted' | 'rejected'>('submitted')

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('aatc_submissions')
      .select('*')
      .eq('status', filter)
      .order('created_at', { ascending: false })
    setSubs((data as Submission[]) ?? [])
    setLoading(false)
  }

  function pub(path: string) {
    return supabase.storage.from('exhibitor-media').getPublicUrl(path).data.publicUrl
  }

  async function sendToPostiz(id: string) {
    if (!confirm('Push this submission to Postiz (all channels, as draft)?')) return
    setBusyId(id)
    try {
      const res = await fetch('/api/aatc/queue-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'dispatch failed')
      toast.success('Pushed to Postiz!')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusyId(null)
    }
  }

  async function reject(id: string) {
    const reason = prompt('Rejection reason (shown to the artist):')
    if (reason === null) return
    setBusyId(id)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('aatc_submissions').update({
      status: 'rejected',
      rejection_reason: reason || 'Not approved',
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    setBusyId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Rejected')
    load()
  }

  return (
    <div style={{ maxWidth: 1100, color: '#eee' }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>AATC Graphics Queue</h1>
      <p style={{ color: '#999', fontSize: 14, marginTop: 0 }}>
        Artist-submitted graphics. Review, then push to Postiz or reject.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        {(['submitted', 'posted', 'rejected'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid #333', cursor: 'pointer',
              background: filter === f ? '#C4A882' : 'transparent',
              color: filter === f ? '#000' : '#999', fontWeight: 600, textTransform: 'capitalize',
            }}>
            {f}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: '#777' }}>Loading…</p>}
      {!loading && subs.length === 0 && <p style={{ color: '#777' }}>Nothing here.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {subs.map((s) => (
          <div key={s.id} style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{s.artist_name}</span>
                <span style={{ color: '#C4A882', marginLeft: 8 }}>@{s.instagram_handle}</span>
              </div>
              <span style={{ fontSize: 12, color: '#777' }}>{new Date(s.created_at).toLocaleString()}</span>
            </div>

            {/* Square set */}
            <div style={{ fontSize: 11, color: '#666', marginTop: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Square — FB / X / GMB / IG</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8, marginTop: 6 }}>
              {s.square_paths.map((p, i) => (
                <a key={i} href={pub(p)} target="_blank" rel="noreferrer">
                  <img src={pub(p)} style={{ width: '100%', borderRadius: 6, border: '1px solid #333' }} />
                </a>
              ))}
            </div>

            {/* Vertical set */}
            <div style={{ fontSize: 11, color: '#666', marginTop: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Vertical — TikTok</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: 8, marginTop: 6 }}>
              {s.vertical_paths.map((p, i) => (
                <a key={i} href={pub(p)} target="_blank" rel="noreferrer">
                  <img src={pub(p)} style={{ width: '100%', borderRadius: 6, border: '1px solid #333' }} />
                </a>
              ))}
            </div>

            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', color: '#999', fontSize: 13 }}>Caption</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#bbb', marginTop: 6 }}>{s.caption}</pre>
            </details>

            {s.status === 'submitted' && (
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button disabled={busyId === s.id} onClick={() => sendToPostiz(s.id)}
                  style={{ padding: '10px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: '#C4A882', color: '#000', fontWeight: 700, opacity: busyId === s.id ? 0.5 : 1 }}>
                  {busyId === s.id ? 'Pushing…' : 'Send to Postiz'}
                </button>
                <button disabled={busyId === s.id} onClick={() => reject(s.id)}
                  style={{ padding: '10px 16px', borderRadius: 6, border: '1px solid #5a2a2a', cursor: 'pointer',
                    background: 'transparent', color: '#e57373', fontWeight: 600 }}>
                  Reject
                </button>
              </div>
            )}
            {s.status === 'rejected' && s.rejection_reason && (
              <div style={{ marginTop: 12, color: '#e57373', fontSize: 13 }}>Rejected: {s.rejection_reason}</div>
            )}
            {s.status === 'posted' && (
              <div style={{ marginTop: 12, color: '#4caf50', fontSize: 13 }}>✓ Posted to Postiz</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
