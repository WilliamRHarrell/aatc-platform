'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import {
  loadImage, loadBarbaro, renderAnnouncement, renderTattooCard,
  renderVerticalCard, canvasToBlob,
} from '@/lib/aatc-canvas'
import { buildCaption } from '@/lib/aatc-template'

type Upload = { file: File; url: string; img: HTMLImageElement } | null
const SLOT_LABELS = ['Artist Photo', 'Tattoo 1', 'Tattoo 2', 'Tattoo 3']

interface MySubmission {
  id: string
  artist_name: string
  status: 'submitted' | 'posted' | 'rejected'
  rejection_reason: string | null
  created_at: string
  square_paths: string[]
}

export default function PortalGraphicsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [authChecked, setAuthChecked] = useState(false)
  const [fontReady, setFontReady] = useState(false)
  const [uploads, setUploads] = useState<Upload[]>([null, null, null, null])
  const [name, setName] = useState('')
  const [ig, setIg] = useState('')
  const [previews, setPreviews] = useState<string[]>([])
  const [vertPreviews, setVertPreviews] = useState<string[]>([])
  const [squareBlobs, setSquareBlobs] = useState<Blob[]>([])
  const [vertBlobs, setVertBlobs] = useState<Blob[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [mine, setMine] = useState<MySubmission[]>([])

  // Gate: must be logged in
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/auth/login?redirect=/portal/graphics'); return }
      setAuthChecked(true)
      loadMine(user.id)
    })
    loadBarbaro().then(() => setFontReady(true))
  }, [])

  async function loadMine(uid: string) {
    const { data } = await supabase
      .from('aatc_submissions')
      .select('id, artist_name, status, rejection_reason, created_at, square_paths')
      .eq('exhibitor_id', uid)
      .order('created_at', { ascending: false })
    if (data) setMine(data as MySubmission[])
  }

  async function onPick(idx: number, file: File) {
    const url = URL.createObjectURL(file)
    const img = await loadImage(url)
    setUploads((u) => { const c = [...u]; c[idx] = { file, url, img }; return c })
  }

  const ready = Boolean(fontReady && name.trim() && ig.trim() && uploads.every(Boolean))

  async function generate() {
    if (!ready) return
    setBusy(true); setStatus('Rendering your graphics…')
    const [artist, t1, t2, t3] = uploads.map((u) => u!.img)
    const sq = [
      await renderAnnouncement(artist, [t1, t2, t3], name, ig),
      await renderTattooCard(t1, name, ig),
      await renderTattooCard(t2, name, ig),
      await renderTattooCard(t3, name, ig),
    ]
    const vt = [
      await renderVerticalCard(artist, name, ig),
      await renderVerticalCard(t1, name, ig),
      await renderVerticalCard(t2, name, ig),
      await renderVerticalCard(t3, name, ig),
    ]
    setPreviews(sq.map((c) => c.toDataURL('image/jpeg', 0.92)))
    setVertPreviews(vt.map((c) => c.toDataURL('image/jpeg', 0.92)))
    setSquareBlobs(await Promise.all(sq.map(canvasToBlob)))
    setVertBlobs(await Promise.all(vt.map(canvasToBlob)))
    setBusy(false); setStatus('')
  }

  async function uploadBlob(uid: string, blob: Blob, tag: string): Promise<string> {
    const path = `aatc-graphics/${uid}/${Date.now()}-${tag}.jpg`
    const { error } = await supabase.storage.from('exhibitor-media').upload(path, blob, {
      contentType: 'image/jpeg', upsert: false,
    })
    if (error) throw error
    return path
  }

  async function sendToAATC() {
    if (squareBlobs.length !== 4 || vertBlobs.length !== 4) {
      toast.error('Generate your graphics first'); return
    }
    setBusy(true); setStatus('Uploading & submitting…')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login?redirect=/portal/graphics'); return }

      const squarePaths: string[] = []
      for (let i = 0; i < squareBlobs.length; i++) {
        squarePaths.push(await uploadBlob(user.id, squareBlobs[i], `sq${i + 1}`))
      }
      const vertPaths: string[] = []
      for (let i = 0; i < vertBlobs.length; i++) {
        vertPaths.push(await uploadBlob(user.id, vertBlobs[i], `vt${i + 1}`))
      }

      const { error } = await supabase.from('aatc_submissions').insert({
        exhibitor_id: user.id,
        artist_name: name,
        instagram_handle: ig.replace(/^@/, ''),
        square_paths: squarePaths,
        vertical_paths: vertPaths,
        caption: buildCaption(name, ig),
        status: 'submitted',
      })
      if (error) throw error

      toast.success('Sent to AATC! We’ll review and post it.')
      // reset the working set, keep name/IG for convenience
      setPreviews([]); setVertPreviews([]); setSquareBlobs([]); setVertBlobs([])
      setUploads([null, null, null, null])
      loadMine(user.id)
    } catch (e: any) {
      toast.error(e.message ?? 'Submission failed')
    } finally {
      setBusy(false); setStatus('')
    }
  }

  if (!authChecked) {
    return <div style={{ padding: 40, color: '#999' }}>Loading…</div>
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24, color: '#eee', fontFamily: 'Barlow, system-ui' }}>
      <h1 style={{ letterSpacing: 1 }}>Submit Graphics</h1>
      <p style={{ color: '#999', marginTop: -6, marginBottom: 20, fontSize: 14 }}>
        Upload your photo and 3 tattoos, generate your AATC announcement set, then send it to us to post.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 12 }}>
        <label>Artist Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" style={inp} />
        </label>
        <label>Instagram Handle
          <input value={ig} onChange={(e) => setIg(e.target.value)} placeholder="jane.ink" style={inp} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 12, marginTop: 16 }}>
        {SLOT_LABELS.map((label, i) => (
          <div key={i} style={box}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{label}</div>
            <input type="file" accept="image/*"
              onChange={(e) => e.target.files?.[0] && onPick(i, e.target.files[0])} />
            {uploads[i] && (
              <img src={uploads[i]!.url} alt={label} style={{ width: '100%', marginTop: 8, borderRadius: 4 }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button disabled={!ready || busy} onClick={generate} style={btn(ready && !busy)}>
          Generate
        </button>
        <button disabled={squareBlobs.length !== 4 || busy} onClick={sendToAATC} style={btn(squareBlobs.length === 4 && !busy)}>
          Send to AATC to Post
        </button>
        <span style={{ fontSize: 13, opacity: 0.85 }}>{status}</span>
      </div>

      {previews.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>Square preview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12 }}>
            {previews.map((p, i) => (
              <img key={i} src={p} style={{ width: '100%', borderRadius: 6, border: '1px solid #333' }} />
            ))}
          </div>
        </div>
      )}
      {vertPreviews.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>Vertical preview (TikTok)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12 }}>
            {vertPreviews.map((p, i) => (
              <img key={i} src={p} style={{ width: '100%', borderRadius: 6, border: '1px solid #333' }} />
            ))}
          </div>
        </div>
      )}

      {/* My submissions */}
      <div style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 18 }}>My Submissions</h2>
        {mine.length === 0 && <p style={{ color: '#777', fontSize: 14 }}>Nothing submitted yet.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {mine.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#0d0d0d', border: '1px solid #222', borderRadius: 6, padding: '10px 14px' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{s.artist_name}</div>
                <div style={{ fontSize: 12, color: '#777' }}>
                  {new Date(s.created_at).toLocaleDateString()}
                  {s.status === 'rejected' && s.rejection_reason && ` — ${s.rejection_reason}`}
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                color: s.status === 'posted' ? '#4caf50' : s.status === 'rejected' ? '#e57373' : '#C1A878' }}>
                {s.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const inp: React.CSSProperties = {
  display: 'block', width: '100%', padding: 8, marginTop: 4,
  background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 4,
}
const box: React.CSSProperties = { background: '#0d0d0d', padding: 10, borderRadius: 6, border: '1px solid #222' }
const btn = (on: boolean): React.CSSProperties => ({
  padding: '10px 16px', borderRadius: 6, border: 'none', cursor: on ? 'pointer' : 'not-allowed',
  background: on ? '#C1A878' : '#333', color: on ? '#000' : '#888', fontWeight: 700,
})
