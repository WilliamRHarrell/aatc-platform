'use client'

/**
 * Client islands for /admin/social/artist-posts: refresh, skip/unskip,
 * opt-out, the send-to-Postiz modal, and the hover-to-play video thumbnail.
 * Data is server-rendered by the page; these only act and router.refresh().
 *
 * Writes: skip/unskip and opt-outs go straight through the browser client
 * (admin RLS, 101) with guardedWrite; refresh and send go through
 * /api/admin/artist-posts/* because the n8n secret lives server-side.
 * The app never writes ingest columns (metrics, media, rank, scraped_at).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { defaultCaption } from '@/lib/artist-posts'
import { AATC_POSTIZ_CHANNELS, DEFAULT_CHANNEL_PLATFORMS, INSTAGRAM_CHANNEL_ID } from '@/lib/postiz-channels'

const btnSty = { border: '1px solid #2a2a2a' } as const
const btnCls = 'rounded px-2.5 py-1 text-xs text-white disabled:opacity-40'

export function RefreshButton({ handles, label }: { handles?: string[]; label: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    const res = await fetch('/api/admin/artist-posts/refresh', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(handles?.length ? { handles } : {}),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    setBusy(false)
    if (!res.ok) { toast.error(body.error ?? 'The refresh did not start.'); return }
    toast.success('Refresh started - takes a few minutes.')
    router.refresh()
  }
  return (
    <button type="button" disabled={busy} onClick={run} className={btnCls} style={btnSty}>
      {busy ? 'Starting…' : label}
    </button>
  )
}

export function SkipButton({ id, skipped }: { id: string; skipped: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    const supabase = createClient()
    const res = await guardedWrite(
      supabase.from('artist_social_posts').update({ status: skipped ? 'new' : 'skipped' }).eq('id', id).select('id'),
      skipped ? 'Not unskipped' : 'Not skipped', `admin/artist-posts skip ${id}`,
    )
    setBusy(false)
    if (!res.ok) { toast.error(res.error ?? 'Not saved'); return }
    router.refresh()
  }
  return (
    <button type="button" disabled={busy} onClick={run} className={btnCls} style={btnSty}>
      {skipped ? 'Unskip' : 'Skip'}
    </button>
  )
}

export function OptOutButton({ applicationId, artistUid, optOutId }: {
  applicationId: string
  /** null opts out the whole application. */
  artistUid: string | null
  /** An existing row's id: the button removes it instead. */
  optOutId?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    const supabase = createClient()
    const res = optOutId
      ? await guardedWrite(
          supabase.from('artist_repost_opt_outs').delete().eq('id', optOutId).select('id'),
          'Opt-out not removed', `admin/artist-posts optout- ${optOutId}`,
        )
      : await guardedWrite(
          supabase.from('artist_repost_opt_outs').insert({ application_id: applicationId, artist_uid: artistUid }).select('id'),
          'Opt-out not saved', `admin/artist-posts optout+ ${applicationId}`,
        )
    setBusy(false)
    if (!res.ok) { toast.error(res.error ?? 'Not saved'); return }
    toast.success(optOutId ? 'Opt-out removed - back on the next refresh.' : 'Opted out - effective on the next refresh.')
    router.refresh()
  }
  return (
    <button type="button" disabled={busy} onClick={run} className={btnCls}
      style={{ ...btnSty, color: optOutId ? '#C4A882' : '#f87171' }}>
      {optOutId ? 'Remove opt-out' : 'Opt out'}
    </button>
  )
}

export function HoverVideo({ src, className }: { src: string; className?: string }) {
  return (
    <video
      src={src} muted playsInline preload="metadata" loop className={className}
      onMouseEnter={e => { void e.currentTarget.play().catch(() => undefined) }}
      onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
    />
  )
}

export function SendPostButton({ post, booths }: {
  post: { id: string; handle: string; status: string; sentAt: string | null }
  booths: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [caption, setCaption] = useState(() => defaultCaption(post.handle, booths))
  const [channels, setChannels] = useState<string[]>(
    AATC_POSTIZ_CHANNELS.filter(c => (DEFAULT_CHANNEL_PLATFORMS as readonly string[]).includes(c.platform)).map(c => c.id))
  const [collab, setCollab] = useState(true)
  const [mode, setMode] = useState<'draft' | 'schedule'>('draft')
  const [when, setWhen] = useState('')
  const [confirmResend, setConfirmResend] = useState(false)

  const alreadySent = post.status === 'sent' && !!post.sentAt
  const instagramOn = channels.includes(INSTAGRAM_CHANNEL_ID)
  const toggle = (id: string) => setChannels(cs => (cs.includes(id) ? cs.filter(x => x !== id) : [...cs, id]))

  const submit = async () => {
    if (!caption.trim()) { toast.error('The caption is empty.'); return }
    if (channels.length === 0) { toast.error('Pick at least one channel.'); return }
    if (mode === 'schedule' && !when) { toast.error('Pick a date and time.'); return }
    if (alreadySent && !confirmResend) { toast.error('Tick the resend confirmation first.'); return }
    setBusy(true)
    const res = await fetch('/api/admin/artist-posts/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: post.id, caption, channels, mode,
        ...(mode === 'schedule' ? { scheduledLocal: when } : {}),
        collab: instagramOn && collab,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    setBusy(false)
    if (!res.ok) { toast.error(body.error ?? 'The send did not start.'); return }
    toast.success(mode === 'draft' ? 'Sending to Postiz as a draft…' : 'Scheduling in Postiz…')
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnCls}
        style={{ border: '1px solid #8B7355', color: '#C4A882' }}>
        Send to Postiz
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={() => !busy && setOpen(false)}>
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white">Send @{post.handle} to Postiz</h2>

            {alreadySent && (
              <div className="mt-3 rounded-lg p-3 text-xs" style={{ backgroundColor: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.4)', color: '#eab308' }}>
                Already sent {new Date(post.sentAt!).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET.
                <label className="mt-2 flex items-center gap-2 text-white">
                  <input type="checkbox" checked={confirmResend} onChange={e => setConfirmResend(e.target.checked)} /> Send it again anyway
                </label>
              </div>
            )}

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide" style={{ color: '#999' }}>Caption</label>
            <textarea rows={6} value={caption} onChange={e => setCaption(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-white"
              style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }} />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide" style={{ color: '#999' }}>Channels</p>
            <div className="mt-1 flex flex-wrap gap-3">
              {AATC_POSTIZ_CHANNELS.map(c => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm text-white">
                  <input type="checkbox" checked={channels.includes(c.id)} onChange={() => toggle(c.id)} /> {c.label}
                </label>
              ))}
            </div>
            {instagramOn && (
              <label className="mt-2 flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={collab} onChange={e => setCollab(e.target.checked)} />
                Invite @{post.handle} as an Instagram collaborator
              </label>
            )}

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide" style={{ color: '#999' }}>When</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-white">
                <input type="radio" name={`when-${post.id}`} checked={mode === 'draft'} onChange={() => setMode('draft')} /> Draft
              </label>
              <label className="flex items-center gap-1.5 text-sm text-white">
                <input type="radio" name={`when-${post.id}`} checked={mode === 'schedule'} onChange={() => setMode('schedule')} /> Schedule
              </label>
              {mode === 'schedule' && (
                <>
                  <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
                    className="rounded px-2 py-1 text-sm text-white" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }} />
                  <span className="text-xs" style={{ color: '#666' }}>America/New_York</span>
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className={btnCls} style={btnSty}>Cancel</button>
              <button type="button" disabled={busy} onClick={submit} className="rounded px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: '#8B7355', color: '#fff' }}>
                {busy ? 'Sending…' : mode === 'draft' ? 'Send as draft' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
