'use client'

import { useState } from 'react'
import { guardedWrite } from '@/lib/db-write'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

interface RosterApp {
  id: string
  event_id: string | null
  business_name: string
  contact_name: string
  email: string
  exhibitor_type: 'artist' | 'vendor'
  artist_count: number
}

export function RosterCompletionPanel({ application, onComplete }: { application: RosterApp; onComplete: () => void }) {
  const supabase = createClient()
  const [boothHolderIdFile, setBoothHolderIdFile] = useState<File | null>(null)
  const [artists, setArtists] = useState<Array<{ name: string; idFile: File | null; nickname: string; instagram: string }>>(
    Array.from({ length: Math.max(1, application.artist_count) }, () => ({ name: '', idFile: null, nickname: '', instagram: '' }))
  )
  const [submitting, setSubmitting] = useState(false)

  const isArtist = application.exhibitor_type === 'artist'

  const updateArtist = (i: number, patch: Partial<{ name: string; idFile: File | null; nickname: string; instagram: string }>) => {
    setArtists(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } : a))
  }

  const addArtist = () => setArtists(prev => [...prev, { name: '', idFile: null, nickname: '', instagram: '' }])
  const removeArtist = (i: number) => setArtists(prev => prev.filter((_, idx) => idx !== i))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!boothHolderIdFile) { toast.error('Booth holder ID is required'); return }
    if (isArtist && artists.some(a => !a.name.trim() || !a.idFile)) {
      toast.error('Every artist needs a name and ID upload')
      return
    }

    setSubmitting(true)

    // 1. Upload booth-holder ID to private bucket
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Session expired'); setSubmitting(false); return }

    const ts = Date.now()
    const ext = (boothHolderIdFile.name.split('.').pop() || 'jpg').toLowerCase()
    const idPath = `${user.id}/${ts}-booth-holder-id.${ext}`
    const { error: idErr } = await supabase.storage
      .from('application-docs')
      .upload(idPath, boothHolderIdFile)
    if (idErr) { toast.error(`ID upload failed: ${idErr.message}`); setSubmitting(false); return }

    // 2. For each artist, upload their ID and build the artists JSONB array
    const artistRecords: Array<{ name: string; id_url: string | null; nickname?: string; instagram?: string }> = []
    if (isArtist) {
      for (let i = 0; i < artists.length; i++) {
        const a = artists[i]
        if (!a.idFile) continue
        const aExt = (a.idFile.name.split('.').pop() || 'jpg').toLowerCase()
        const aPath = `${user.id}/${ts}-artist-${i + 1}-id.${aExt}`
        const { error: aErr } = await supabase.storage
          .from('application-docs')
          .upload(aPath, a.idFile)
        if (aErr) { toast.error(`Artist ${i + 1} ID upload failed: ${aErr.message}`); setSubmitting(false); return }
        artistRecords.push({
          name: a.name.trim(),
          id_url: aPath,
          ...(a.nickname.trim() ? { nickname: a.nickname.trim() } : {}),
          ...(a.instagram.trim() ? { instagram: a.instagram.trim() } : {}),
        })
      }
    }

    // 3. Update the application — flip needs_roster=false, set artists, set id_doc_url
    // .select() is required: without a returned row this cannot tell a
    // successful save from an RLS-filtered no-op, and needs_roster is half the
    // public directory gate. See src/lib/db-write.ts.
    const rosterWrite = await guardedWrite(
      supabase
        .from('applications')
        .update({
          needs_roster: false,
          artists: isArtist ? artistRecords : null,
          artist_count: isArtist ? artistRecords.length : 0,
          id_doc_url: idPath,
        })
        .eq('id', application.id)
        .select('id, needs_roster'),
      'Could not save your roster',
      'roster completion',
    )
    if (!rosterWrite.ok) { toast.error(rosterWrite.error!); setSubmitting(false); return }

    // The trigger in migration 041 refuses to clear needs_roster unless the
    // roster is genuinely complete, so a row can come back unchanged.
    if (rosterWrite.data[0]?.needs_roster) {
      toast.error('Roster incomplete — every artist needs a name and an ID upload.')
      setSubmitting(false); return
    }

    // 4. Create the exhibitor row so they appear publicly
    const { error: exhErr } = await supabase.from('exhibitors').insert({
      event_id: application.event_id ?? '',
      application_id: application.id,
      business_name: application.business_name,
      contact_name: application.contact_name,
      email: application.email,
      exhibitor_type: application.exhibitor_type,
    })
    // Ignore duplicate-key errors (row may already exist)
    if (exhErr && !exhErr.message.includes('duplicate')) {
      toast.error(`Profile creation failed: ${exhErr.message}`)
      setSubmitting(false)
      return
    }

    toast.success('Roster complete — your booth is now visible publicly')
    onComplete()
  }

  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <p className="mb-1 text-xs font-bold uppercase tracking-widest" style={{ color: '#8B7355' }}>Welcome back</p>
      <h2 className="mb-4 font-display text-2xl font-bold text-white">Complete your roster</h2>
      <p className="mb-6 text-sm" style={{ color: '#999' }}>
        Your AATC 2027 booth is paid in full. To appear in the public directory, please upload your booth-holder ID
        {isArtist && ' and add your artists'}.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Booth holder ID */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-white">Booth holder ID *</label>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={e => setBoothHolderIdFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-white" />
          <p className="mt-1 text-xs" style={{ color: '#666' }}>JPEG / PNG / WEBP / PDF, max 50MB</p>
        </div>

        {isArtist && (
          <div>
            <p className="mb-2 text-sm font-medium text-white">Artists</p>
            {artists.map((a, i) => (
              <div key={i} className="mb-3 rounded-lg p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-white">Artist {i + 1}</span>
                  {artists.length > 1 && (
                    <button type="button" onClick={() => removeArtist(i)} className="text-xs" style={{ color: '#f87171' }}>Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input type="text" placeholder="Name *" required value={a.name} onChange={e => updateArtist(i, { name: e.target.value })} className="rounded px-3 py-2 text-sm text-white" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }} />
                  <input type="text" placeholder="Nickname" value={a.nickname} onChange={e => updateArtist(i, { nickname: e.target.value })} className="rounded px-3 py-2 text-sm text-white" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }} />
                  <input type="text" placeholder="Instagram" value={a.instagram} onChange={e => updateArtist(i, { instagram: e.target.value })} className="rounded px-3 py-2 text-sm text-white sm:col-span-2" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }} />
                  <div className="sm:col-span-2">
                    <label className="text-xs text-white">ID upload *</label>
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={e => updateArtist(i, { idFile: e.target.files?.[0] ?? null })} className="block w-full text-sm text-white mt-1" />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={addArtist} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: '#0a0a0a', color: '#C4A882', border: '1px solid #2a2a2a' }}>+ Add artist</button>
          </div>
        )}

        <button type="submit" disabled={submitting} className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#8B7355' }}>
          {submitting ? 'Submitting…' : 'Complete roster'}
        </button>
      </form>
    </div>
  )
}
