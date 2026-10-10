'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { activeHold, holdUntilLabel } from '@/lib/booth-holds'
import { artistCapacity, isIdVerified } from '@/lib/artist-roster'
import { describeBooths, boothSlotCount } from '@/lib/booth-display'
import toast from 'react-hot-toast'
import type { Database } from '@/types/database'
import { guardedWrite } from '@/lib/db-write'
import { requestRevalidate } from '@/lib/revalidate'
import { useApplicationDocs } from '@/lib/use-application-docs'
import AddOnList from '@/components/admin/AddOnList'
import { artistTv, ownTv, unattributedTv } from '@/lib/tv-show'
import { TATTOO_STYLES } from '@/lib/tattoo-styles'

type ArtistEntry = {
  name?: string | null
  nickname?: string | null
  instagram?: string | null
  styles?: string[] | null
  portfolio_urls?: string[] | null
  id_url?: string | null
  id_later?: boolean | null
  [key: string]: unknown
}
type Application = Omit<Database['public']['Tables']['applications']['Row'], 'artists'> & {
  artists: ArtistEntry[] | null
}

interface AssignedBooth {
  id: string
  booth_number: string
  is_corner: boolean
  status: string
}


// ── Section wrapper ────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <p className="mb-4 text-xs font-bold uppercase tracking-widest" style={{ color: '#8B7355' }}>{title}</p>
      {children}
    </div>
  )
}

function ReadField({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === null || value === undefined || value === '') return null
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#555' }}>{label}</p>
      <p className="mt-0.5 text-sm text-white break-words">{display}</p>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function BoothDetailPage() {
  const { id: appId } = useParams<{ id: string }>()
  const supabase = createClient()
  const logoRef = useRef<HTMLInputElement>(null)
  const portfolioRef = useRef<HTMLInputElement>(null)

  const [app, setApp] = useState<Application | null>(null)
  const [assignedBooths, setAssignedBooths] = useState<AssignedBooth[]>([])
  // Booths on an active hold linked to this application (087): only it can take them.
  const [heldForThis, setHeldForThis] = useState<Array<{ booth_number: string; held_until: string }>>([])
  const [eventId, setEventId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Booth slot inputs (one per size slot)
  const [slotInputs, setSlotInputs] = useState<string[]>([])
  const [savingBooths, setSavingBooths] = useState(false)

  // Profile edits
  const [profile, setProfile] = useState({
    business_name: '',
    instagram: '',
    facebook: '',
    website: '',
    notes: '',
  })
  const [savingProfile, setSavingProfile] = useState(false)

  // Per-artist editable fields
  const [artistEdits, setArtistEdits] = useState<Array<{ name: string; nickname: string; instagram: string; styles: string[]; id_file: File | null; tv_featured: boolean | null; tv_credit: string }>>([])
  const [artistPortfolioUrls, setArtistPortfolioUrls] = useState<Record<number, string[]>>({})
  const [savingArtist, setSavingArtist] = useState<number | null>(null)
  const [uploadingArtistPortfolio, setUploadingArtistPortfolio] = useState<number | null>(null)

  // Logo
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Portfolio
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([])
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false)

  // ID documents: signed for five minutes by the admin route (the one home
  // for signing). `open` re-signs on every click.
  const docs = useApplicationDocs(app?.id ?? null)

  useEffect(() => {
    const load = async () => {
      const [{ data: appData }, { data: boothData }, { data: eventData }] = await Promise.all([
        supabase
          .from('applications')
          .select('*')
          .eq('id', appId)
          .eq('status', 'approved')
          .single(),
        supabase
          .from('booths')
          .select('id, booth_number, is_corner, status')
          .eq('application_id', appId),
        supabase
          .from('events')
          .select('id')
          .eq('is_active', true)
          .single(),
      ])

      if (!appData) { setNotFound(true); setLoading(false); return }

      const a = appData as unknown as Application
      setApp(a)
      // 098: who is attending the VIP Meet & Greet (errors harmlessly before 098).
      const { data: vip } = await supabase.from('vip_featured_artists').select('artist_uid').eq('application_id', appId)
      setVipUids((vip ?? []).map(v => v.artist_uid))
      setAssignedBooths((boothData ?? []) as AssignedBooth[])
      const { data: heldRows } = await supabase
        .from('booths')
        .select('booth_number, held_for, held_until, held_for_application_id, held_for_sponsorship_id')
        .eq('held_for_application_id', appId)
      setHeldForThis((heldRows ?? []).filter(h => activeHold(h)).map(h => ({ booth_number: h.booth_number, held_until: h.held_until! })))
      setEventId(eventData?.id ?? null)

      const slotCount = boothSlotCount(a)
      const nums = (boothData ?? []).map((b: AssignedBooth) => b.booth_number)
      const inputs = Array.from({ length: slotCount }, (_, i) => nums[i] ?? '')
      setSlotInputs(inputs)

      setProfile({
        business_name: a.business_name,
        instagram: a.instagram ?? '',
        facebook: a.facebook ?? '',
        website: a.website ?? '',
        notes: a.notes ?? '',
      })
      setArtistEdits((a.artists ?? []).map(ar => {
        const tv = ownTv(ar)
        return { name: ar.name ?? '', nickname: ar.nickname ?? '', instagram: ar.instagram ?? '', styles: ar.styles ?? [], id_file: null, tv_featured: tv?.featured ?? null, tv_credit: tv?.show ?? '' }
      }))
      const portfolioByArtist: Record<number, string[]> = {}
      ;(a.artists ?? []).forEach((ar, i) => { portfolioByArtist[i] = ar.portfolio_urls ?? [] })
      setArtistPortfolioUrls(portfolioByArtist)
      setLogoUrl(a.logo_url ?? null)
      setPortfolioUrls(a.portfolio_image_urls ?? [])

      setLoading(false)
    }
    load()
  }, [appId])

  // ── Booth assignment ─────────────────────────────────────────
  // The write is assign_booths() (migration 086): one transaction, scoped to
  // this application's event, refusing not-sellable booths, booths held by
  // another application, duplicates and more booths than slots. Fewer booths
  // than slots is allowed (half of a double now, the rest later). Its error
  // messages are written for this toast. The corner checks stay here as
  // confirm() warnings, as before.
  const saveBoothAssignment = async () => {
    if (!app) return
    if (!app.event_id) {
      toast.error('Application has no event ID - cannot assign booths')
      return
    }

    const nums = slotInputs.map(s => s.trim()).filter(Boolean)
    setSavingBooths(true)
    try {
      if (nums.length > 0) {
        // This application's event only: every event has booths 1-267.
        const { data: eventBooths, error: boothFetchError } = await supabase
          .from('booths')
          .select('booth_number, is_corner')
          .eq('event_id', app.event_id)
        if (boothFetchError || !eventBooths) {
          toast.error('Failed to load booth data')
          return
        }
        const chosen = eventBooths.filter(b => nums.includes(b.booth_number))
        // 2027 applications record corners in corner_count; 2026 rows in is_corner.
        const paidForCorner = app.is_corner || (app.corner_count ?? 0) > 0

        if (paidForCorner && !chosen.some(r => r.is_corner)) {
          const proceed = window.confirm(
            'Warning: This exhibitor paid for a corner booth, but none of the selected booths is marked as a corner. Assign anyway?'
          )
          if (!proceed) return
        }
        if (!paidForCorner && chosen.some(r => r.is_corner)) {
          const cornerNums = chosen.filter(r => r.is_corner).map(r => `#${r.booth_number}`).join(', ')
          const proceed = window.confirm(
            `Warning: Booth ${cornerNums} is a corner booth, but this exhibitor did not pay for a corner. Assign anyway?`
          )
          if (!proceed) return
        }
      }

      const { error } = await supabase.rpc('assign_booths', { p_application_id: appId, p_booth_numbers: nums })
      if (error) {
        console.error(`[admin/booths] assign_booths failed for ${appId}: ${error.code} ${error.message}`)
        toast.error(error.code === 'PGRST202'
          ? 'Booth assignment needs migration 086 applied in Supabase.'
          : `Not saved: ${error.message}`)
        return
      }

      // Read back what the database now holds, rather than trusting the inputs.
      const { data: fresh } = await supabase
        .from('booths')
        .select('id, booth_number, is_corner, status')
        .eq('application_id', appId)
      setAssignedBooths((fresh ?? []) as AssignedBooth[])

      const slots = boothSlotCount(app)
      if (nums.length === 0) toast.success('Booth assignment cleared')
      else toast.success(
        `Booth${nums.length > 1 ? 's' : ''} ${nums.map(n => `#${n}`).join(', ')} assigned` +
        (nums.length < slots ? ` (${nums.length} of ${slots} slots)` : '')
      )
    } finally {
      setSavingBooths(false)
    }
  }

  // ── Profile save ─────────────────────────────────────────────
  const saveProfile = async () => {
    if (!app) return
    setSavingProfile(true)

    const res = await guardedWrite(
      supabase
        .from('applications')
        .update({
          business_name: profile.business_name.trim() || app.business_name,
          instagram: profile.instagram.trim() || null,
          facebook: profile.facebook.trim() || null,
          website: profile.website.trim() || null,
          notes: profile.notes.trim() || null,
        })
        .eq('id', appId)
        .select('id'),
      'Profile not saved',
      `admin/booths/${appId} saveProfile`,
    )

    if (!res.ok) {
      toast.error(res.error)
    } else {
      toast.success('Profile updated')
    }
    setSavingProfile(false)
  }

  // ── Logo upload ──────────────────────────────────────────────
  const uploadLogo = async () => {
    if (!logoFile) return
    setUploadingLogo(true)
    const ext = logoFile.name.split('.').pop() ?? 'jpg'
    const path = `${appId}/logo.${ext}`
    const { error } = await supabase.storage
      .from('exhibitor-media')
      .upload(path, logoFile, { upsert: true })

    if (error) {
      toast.error('Logo upload failed')
    } else {
      const { data: urlData } = supabase.storage.from('exhibitor-media').getPublicUrl(path)
      const url = urlData.publicUrl
      // The file is already in storage by this point, so a silent failure here
      // leaves an uploaded logo the application does not reference. The UI said
      // 'Logo uploaded' either way.
      const res = await guardedWrite(
        supabase.from('applications').update({ logo_url: url }).eq('id', appId).select('id'),
        'Logo uploaded but not linked to the application',
        `admin/booths/${appId} logo`,
      )
      if (!res.ok) {
        await supabase.storage.from('exhibitor-media').remove([path])
        toast.error(`${res.error} The file was removed rather than left unlinked.`)
        setUploadingLogo(false)
        return
      }
      setLogoUrl(url)
      setLogoFile(null)
      setLogoPreview(null)
      if (logoRef.current) logoRef.current.value = ''
      toast.success('Logo uploaded')
    }
    setUploadingLogo(false)
  }

  const removeLogo = async () => {
    const res = await guardedWrite(
      supabase.from('applications').update({ logo_url: null }).eq('id', appId).select('id'),
      'Logo not removed',
      `admin/booths/${appId} removeLogo`,
    )
    if (!res.ok) { toast.error(res.error); return }
    setLogoUrl(null)
    toast.success('Logo removed')
  }

  // ── Portfolio upload ─────────────────────────────────────────
  const uploadPortfolioImages = async (files: FileList) => {
    if (portfolioUrls.length + files.length > 10) {
      toast.error('Max 10 portfolio images')
      return
    }
    setUploadingPortfolio(true)
    const newUrls: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${appId}/portfolio/${Date.now()}-${i}.${ext}`
      const { error } = await supabase.storage
        .from('exhibitor-media')
        .upload(path, file, { upsert: false })
      if (!error) {
        const { data: urlData } = supabase.storage.from('exhibitor-media').getPublicUrl(path)
        newUrls.push(urlData.publicUrl)
      }
    }

    const merged = [...portfolioUrls, ...newUrls]
    // Same shape as the logo: the files are uploaded before this runs, so a
    // silent failure orphans them and the count in the toast is a fiction.
    const res = await guardedWrite(
      supabase.from('applications').update({ portfolio_image_urls: merged }).eq('id', appId).select('id'),
      'Images uploaded but not saved to the application',
      `admin/booths/${appId} portfolioAdd`,
    )
    if (!res.ok) {
      toast.error(res.error)
      setUploadingPortfolio(false)
      return
    }
    setPortfolioUrls(merged)
    if (portfolioRef.current) portfolioRef.current.value = ''
    toast.success(`${newUrls.length} image${newUrls.length !== 1 ? 's' : ''} uploaded`)
    setUploadingPortfolio(false)
  }

  const removePortfolioImage = async (url: string) => {
    const updated = portfolioUrls.filter(u => u !== url)
    const path = url.split('/exhibitor-media/')[1]
    // Row first, then the file - a blocked row update leaves the image showing,
    // which is harmless. The reverse leaves the application pointing at a
    // deleted object, which renders broken on the public directory.
    const res = await guardedWrite(
      supabase.from('applications').update({ portfolio_image_urls: updated }).eq('id', appId).select('id'),
      'Image not removed',
      `admin/booths/${appId} portfolioRemove`,
    )
    if (!res.ok) { toast.error(res.error); return }
    if (path) await supabase.storage.from('exhibitor-media').remove([path])
    setPortfolioUrls(updated)
    toast.success('Image removed')
  }

  // ── Per-artist save ───────────────────────────────────────────
  const saveArtistEdit = async (i: number) => {
    if (!app) return
    setSavingArtist(i)
    const edit = artistEdits[i]
    const ar = app.artists![i]
    let id_url = ar.id_url

    // Upload new ID if provided
    if (edit?.id_file) {
      const ext = edit.id_file.name.split('.').pop()
      const path = `admin/${app.id}/artist-${i + 1}-id-${Date.now()}.${ext}`
      const { data: up, error: upErr } = await supabase.storage
        .from('application-docs')
        .upload(path, edit.id_file)
      if (upErr) {
        toast.error('Failed to upload ID')
        setSavingArtist(null)
        return
      }
      id_url = up.path
      // Clear the file from state after successful upload
      setArtistEdits(prev => prev.map((ed, idx) => idx === i ? { ...ed, id_file: null } : ed))
    }

    const updatedArtists = (app.artists ?? []).map((ar2, idx) =>
      idx === i ? {
        ...ar2, name: edit?.name ?? ar2.name, nickname: edit?.nickname, instagram: edit?.instagram ?? '', styles: edit?.styles, id_url,
        // TV: the artist is the source of truth (lib/tv-show.ts); the show is kept only with Yes.
        tv_featured: edit?.tv_featured ?? null, tv_credit: edit?.tv_featured === true ? edit.tv_credit.trim() : '',
      } : ar2
    )
    const saveRes = await guardedWrite(
      supabase.from('applications')
        .update({ artists: updatedArtists as unknown as Database['public']['Tables']['applications']['Row']['artists'] })
        .eq('id', appId).select('id'),
      'Artist not saved',
      `admin/booths/${appId} saveArtist idx=${i}`,
    )
    if (!saveRes.ok) { toast.error(saveRes.error) } else {
      // Read the roster back: the database decides the verification keys (088).
      const { data: fresh } = await supabase.from('applications').select('artists').eq('id', appId).single()
      if (fresh) setApp(prev => prev ? { ...prev, artists: fresh.artists as unknown as ArtistEntry[] } : prev)
      toast.success('Artist saved'); void docs.refresh()
    }
    setSavingArtist(null)
  }

  // ── Per-artist ID verification (088: only this function writes it) ──
  const [verifyingArtist, setVerifyingArtist] = useState<number | null>(null)

  // ── Gold Star VIP Meet & Greet (098): by the artist's uid; saved at once ──
  const [vipUids, setVipUids] = useState<string[]>([])
  const [vipSaving, setVipSaving] = useState<string | null>(null)
  const toggleVip = async (uid: string, on: boolean) => {
    setVipSaving(uid)
    if (on) {
      const { data: last } = await supabase.from('vip_featured_artists').select('display_order').order('display_order', { ascending: false }).limit(1)
      const res = await guardedWrite(
        supabase.from('vip_featured_artists').insert({ application_id: appId, artist_uid: uid, display_order: (last?.[0]?.display_order ?? 0) + 1 }).select('id'),
        'Not added to the VIP Meet & Greet', `admin/booths/${appId} vipAdd`,
      )
      if (!res.ok) toast.error(res.error); else { setVipUids(prev => [...prev, uid]); toast.success('Added to the VIP Meet & Greet'); void requestRevalidate({ paths: ['/events/vip-meet-greet'], tags: ['vip'] }) }
    } else {
      const res = await guardedWrite(
        supabase.from('vip_featured_artists').delete().eq('application_id', appId).eq('artist_uid', uid).select('id'),
        'Not removed from the VIP Meet & Greet', `admin/booths/${appId} vipRemove`,
      )
      if (!res.ok) toast.error(res.error); else { setVipUids(prev => prev.filter(u => u !== uid)); toast.success('Removed from the VIP Meet & Greet'); void requestRevalidate({ paths: ['/events/vip-meet-greet'], tags: ['vip'] }) }
    }
    setVipSaving(null)
  }
  const setArtistVerified = async (i: number, verified: boolean) => {
    if (!app) return
    setVerifyingArtist(i)
    const { data, error } = await supabase.rpc('set_artist_id_verified', { p_application_id: appId, p_index: i, p_verified: verified })
    setVerifyingArtist(null)
    if (error) { toast.error(error.code === 'PGRST202' ? 'ID verification needs migration 088 applied in Supabase.' : `Not saved: ${error.message}`); return }
    setApp(prev => prev ? { ...prev, artists: (prev.artists ?? []).map((ar, idx) => idx === i ? (data as unknown as ArtistEntry) : ar) } : prev)
    toast.success(verified ? `Artist ${i + 1}: ID verified` : `Artist ${i + 1}: verification removed`)
  }

  // ── Per-artist portfolio upload ───────────────────────────────
  const uploadArtistPortfolioImages = async (artistIdx: number, files: FileList) => {
    if (!app) return
    const current = artistPortfolioUrls[artistIdx] ?? []
    if (current.length + files.length > 10) { toast.error('Max 10 images per artist'); return }
    setUploadingArtistPortfolio(artistIdx)
    const newUrls: string[] = []
    for (let j = 0; j < files.length; j++) {
      const file = files[j]
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${appId}/artists/${artistIdx}/${Date.now()}-${j}.${ext}`
      const { error } = await supabase.storage.from('exhibitor-media').upload(path, file, { upsert: false })
      if (!error) {
        const { data: urlData } = supabase.storage.from('exhibitor-media').getPublicUrl(path)
        newUrls.push(urlData.publicUrl)
      }
    }
    const merged = [...current, ...newUrls]
    const updatedArtists = (app.artists ?? []).map((ar, idx) =>
      idx === artistIdx ? { ...ar, portfolio_urls: merged } : ar
    )
    // Files are already uploaded. A silent failure here orphans them and the
    // toast still reports a count that was never saved.
    const addRes = await guardedWrite(
      supabase.from('applications').update({ artists: updatedArtists as never }).eq('id', appId).select('id'),
      'Images uploaded but not saved to the artist',
      `admin/booths/${appId} artistPortfolioAdd idx=${artistIdx}`,
    )
    if (!addRes.ok) {
      toast.error(addRes.error)
      setUploadingArtistPortfolio(null)
      return
    }
    setArtistPortfolioUrls(prev => ({ ...prev, [artistIdx]: merged }))
    toast.success(`${newUrls.length} image${newUrls.length !== 1 ? 's' : ''} uploaded`)
    setUploadingArtistPortfolio(null)
  }

  const removeArtistPortfolioImage = async (artistIdx: number, url: string) => {
    if (!app) return
    const current = artistPortfolioUrls[artistIdx] ?? []
    const updated = current.filter(u => u !== url)
    const path = url.split('/exhibitor-media/')[1]
    if (path) await supabase.storage.from('exhibitor-media').remove([path])
    const updatedArtists = (app.artists ?? []).map((ar, idx) =>
      idx === artistIdx ? { ...ar, portfolio_urls: updated } : ar
    )
    const remRes = await guardedWrite(
      supabase.from('applications').update({ artists: updatedArtists as never }).eq('id', appId).select('id'),
      'Image not removed',
      `admin/booths/${appId} artistPortfolioRemove idx=${artistIdx}`,
    )
    if (!remRes.ok) { toast.error(remRes.error); return }
    setArtistPortfolioUrls(prev => ({ ...prev, [artistIdx]: updated }))
    toast.success('Image removed')
  }

  // ── Render ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (notFound || !app) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-sm" style={{ color: '#555' }}>Exhibitor not found or not approved.</p>
        <Link href="/admin/booths" className="text-sm font-semibold" style={{ color: '#8B7355' }}>← Back</Link>
      </div>
    )
  }

  const slotCount = boothSlotCount(app)
  const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff' }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/booths"
            className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest transition-colors"
            style={{ color: '#555' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#555')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            All Exhibitors
          </Link>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{app.business_name}</h1>
          <Link href={`/admin/applications/${app.id}/edit`} className="mt-1 inline-block text-xs font-semibold underline" style={{ color: '#C4A882' }}>
            Edit in editor (contacts, booths, roster, documents, photos)
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
              style={{
                backgroundColor: app.exhibitor_type === 'artist' ? 'rgba(139,115,85,0.2)' : 'rgba(96,165,250,0.15)',
                color: app.exhibitor_type === 'artist' ? '#C4A882' : '#60a5fa',
              }}
            >
              {app.exhibitor_type}
            </span>
            <span className="text-xs capitalize" style={{ color: '#666' }}>
              {describeBooths(app)}
              {app.exhibitor_type === 'artist' ? ` · ${app.artist_count} artist${app.artist_count !== 1 ? 's' : ''}` : ''}
            </span>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: '#1a1a1a', color: '#999', border: '1px solid #2a2a2a' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
          </svg>
          Print
        </button>
      </div>

      {/* ── Booth number assignment ── */}
      <Section title="Booth Number Assignment">
        {heldForThis.length > 0 && (
          <p className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ color: '#f5c542', backgroundColor: 'rgba(245,197,66,0.08)', border: '1px solid rgba(212,160,23,0.4)' }}>
            Held for this exhibitor: {heldForThis.map(h => `#${h.booth_number} (until ${holdUntilLabel(h.held_until)} ET)`).join(', ')}. Assigning it here uses the hold.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {slotInputs.map((val, i) => (
            <div key={i}>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#666' }}>
                Slot {i + 1}{slotCount > 1 ? ` of ${slotCount}` : ''}
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Booth #"
                value={val}
                onChange={e => {
                  const copy = [...slotInputs]
                  copy[i] = e.target.value
                  setSlotInputs(copy)
                }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
              />
            </div>
          ))}
        </div>

        {/* Current assignment status */}
        {assignedBooths.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: '#555' }}>Currently assigned:</span>
            {assignedBooths.map(b => (
              <span
                key={b.id}
                className="rounded-md px-2 py-0.5 text-xs font-bold"
                style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80' }}
              >
                #{b.booth_number}{b.is_corner ? ' ★' : ''}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4">
          <button
            onClick={saveBoothAssignment}
            disabled={savingBooths}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#8B7355' }}
          >
            {savingBooths ? 'Saving…' : 'Save Booth Assignment'}
          </button>
        </div>
      </Section>

      {/* ── Exhibitor profile ── */}
      <Section title="Exhibitor Profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Business / Studio Name</label>
            <input
              type="text"
              value={profile.business_name}
              onChange={e => setProfile(p => ({ ...p, business_name: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Instagram</label>
            <input
              type="text"
              placeholder="@handle"
              value={profile.instagram}
              onChange={e => setProfile(p => ({ ...p, instagram: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Facebook</label>
            <input
              type="text"
              value={profile.facebook}
              onChange={e => setProfile(p => ({ ...p, facebook: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Website</label>
            <input
              type="text"
              value={profile.website}
              onChange={e => setProfile(p => ({ ...p, website: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Notes</label>
            <textarea
              value={profile.notes}
              onChange={e => setProfile(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={inputStyle}
            />
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#8B7355' }}
          >
            {savingProfile ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </Section>

      {/* ── Logo ── */}
      <Section title="Booth Logo">
        <div className="flex items-start gap-5">
          {/* Preview */}
          <div
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl"
            style={{ backgroundColor: '#0a0a0a', border: '2px dashed #2a2a2a' }}
          >
            {(logoPreview ?? logoUrl) ? (
              <Image
                src={logoPreview ?? logoUrl!}
                alt="Logo"
                fill
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={logoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              id="logo-upload"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0] ?? null
                setLogoFile(file)
                setLogoPreview(file ? URL.createObjectURL(file) : null)
              }}
            />
            <div className="flex items-center gap-2">
              <label
                htmlFor="logo-upload"
                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
              >
                {logoFile ? 'Change' : logoUrl ? 'Replace' : 'Upload Logo'}
              </label>
              {logoFile && (
                <button
                  onClick={uploadLogo}
                  disabled={uploadingLogo}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#8B7355' }}
                >
                  {uploadingLogo ? 'Uploading…' : 'Save'}
                </button>
              )}
              {logoUrl && !logoFile && (
                <button
                  onClick={removeLogo}
                  className="text-xs"
                  style={{ color: '#f87171' }}
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs" style={{ color: '#444' }}>JPG, PNG or WebP · max 20 MB</p>
          </div>
        </div>
      </Section>

      {/* ── Vendor portfolio (vendor booths only) ── */}
      {app.exhibitor_type === 'vendor' && (
        <Section title={`Portfolio Images (${portfolioUrls.length}/10)`}>
          {portfolioUrls.length > 0 && (
            <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {portfolioUrls.map(url => (
                <div key={url} className="group relative aspect-square overflow-hidden rounded-xl" style={{ border: '1px solid #2a2a2a' }}>
                  <Image src={url} alt="Portfolio" fill style={{ objectFit: 'cover' }} />
                  <button
                    onClick={() => removePortfolioImage(url)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#f87171' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          {portfolioUrls.length < 10 && (
            <div className="flex items-center gap-3">
              <input ref={portfolioRef} type="file" accept="image/jpeg,image/png,image/webp" multiple id="portfolio-upload" className="hidden"
                onChange={e => { if (e.target.files) uploadPortfolioImages(e.target.files) }} />
              <label htmlFor="portfolio-upload" className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>
                {uploadingPortfolio ? 'Uploading…' : '+ Add Images'}
              </label>
              <p className="text-xs" style={{ color: '#444' }}>Select multiple · JPG, PNG, WebP · max 20 MB each</p>
            </div>
          )}
        </Section>
      )}

      {/* ── Per-artist cards (artist booths only) ── */}
      {app.exhibitor_type === 'artist' && app.artists && app.artists.length > 0 && (
        <div className="space-y-4">
          {app.artists.map((artist, i) => {
            const hasIdDoc = docs.docs.some(d => d.key === `artist-${i + 1}`)
            const portfolioImgs = artistPortfolioUrls[i] ?? []
            const isUploading = uploadingArtistPortfolio === i
            const isSaving = savingArtist === i
            return (
              <div key={i} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #2a2a2a' }}>
                {/* Artist card header */}
                <div className="flex items-center justify-between px-5 py-3" style={{ backgroundColor: '#111', borderBottom: '1px solid #2a2a2a' }}>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8B7355' }}>
                    Artist {i + 1}
                    {artist.id_later && !artist.id_url && (
                      <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'rgba(234,179,8,0.12)', color: '#eab308' }}>
                        ID Pending
                      </span>
                    )}
                    {artist.id_url && (
                      <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>
                        ID ✓
                      </span>
                    )}
                    {!artist.id_later && !artist.id_url && (
                      <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'rgba(248,113,113,0.12)', color: '#f87171' }}>
                        ID Missing
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                  {isIdVerified(artist) ? (
                    <>
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>
                        ID verified{typeof artist.id_verified_at === 'string' ? ` ${new Date(artist.id_verified_at).toLocaleDateString('en-US')}` : ''}
                      </span>
                      <button type="button" disabled={verifyingArtist === i} onClick={() => setArtistVerified(i, false)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ color: '#999', border: '1px solid #2a2a2a' }}>
                        Unverify
                      </button>
                    </>
                  ) : artist.id_url ? (
                    <button type="button" disabled={verifyingArtist === i} onClick={() => setArtistVerified(i, true)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      style={{ backgroundColor: 'rgba(196,168,130,0.12)', color: '#C4A882', border: '1px solid rgba(196,168,130,0.35)' }}>
                      Mark ID verified
                    </button>
                  ) : null}
                  {hasIdDoc && (
                    <button type="button" onClick={() => docs.open(`artist-${i + 1}`)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                      style={{ backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
                      View ID ↗
                    </button>
                  )}
                  </div>
                </div>

                <div className="p-5 space-y-5" style={{ backgroundColor: '#1a1a1a' }}>
                  {/* Name + Nickname */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Legal Name</label>
                      <input
                        type="text"
                        value={artistEdits[i]?.name ?? ''}
                        onChange={e => setArtistEdits(prev => prev.map((ed, idx) => idx === i ? { ...ed, name: e.target.value } : ed))}
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                        onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                        onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                        placeholder="As it appears on their ID"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Artist Name</label>
                      <input
                        type="text"
                        value={artistEdits[i]?.nickname ?? ''}
                        onChange={e => setArtistEdits(prev => prev.map((ed, idx) => idx === i ? { ...ed, nickname: e.target.value } : ed))}
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                        onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                        onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                        placeholder="If you want something other than legal name displayed, enter it here"
                      />
                    </div>
                  </div>

                  {/* Gold Star VIP Meet & Greet (098) */}
                  {typeof artist.uid === 'string' && (
                    <label className="flex items-center gap-2 text-sm text-white">
                      <input type="checkbox" disabled={vipSaving === artist.uid} checked={vipUids.includes(artist.uid)}
                        onChange={e => toggleVip(artist.uid as string, e.target.checked)} />
                      Attending Gold Star VIP Meet &amp; Greet
                    </label>
                  )}

                  {/* TV show: per artist (2026-10-09) */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Featured on a tattoo TV show?</label>
                    <div className="flex flex-wrap gap-2">
                      {([[true, 'Yes'], [false, 'No'], [null, 'Not asked']] as const).map(([v, label]) => {
                        const on = (artistEdits[i]?.tv_featured ?? null) === v
                        return (
                          <button key={label} type="button"
                            onClick={() => setArtistEdits(prev => prev.map((ed, idx) => idx === i ? { ...ed, tv_featured: v } : ed))}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                            style={{ backgroundColor: on ? 'rgba(139,115,85,0.2)' : 'transparent', color: on ? '#C4A882' : '#666', border: `1px solid ${on ? '#8B7355' : '#2a2a2a'}` }}>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                    {artistEdits[i]?.tv_featured === true && (
                      <input
                        type="text"
                        value={artistEdits[i]?.tv_credit ?? ''}
                        onChange={e => setArtistEdits(prev => prev.map((ed, idx) => idx === i ? { ...ed, tv_credit: e.target.value } : ed))}
                        className="mt-2 w-full rounded-lg px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                        placeholder="Which show and season?"
                      />
                    )}
                    {artistEdits[i]?.tv_featured == null && artistTv(app, i)?.from === 'application' && (
                      <p className="mt-1 text-xs" style={{ color: '#666' }}>Showing the application&apos;s answer for this one-artist roster until you set it here.</p>
                    )}
                  </div>

                  {/* Instagram */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Instagram Handle</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#555' }}>@</span>
                      <input
                        type="text"
                        value={artistEdits[i]?.instagram ?? ''}
                        onChange={e => setArtistEdits(prev => prev.map((ed, idx) => idx === i ? { ...ed, instagram: e.target.value.replace(/^@/, '') } : ed))}
                        className="w-full rounded-lg py-2 pr-3 text-sm outline-none"
                        style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                        onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                        onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                        placeholder="artisthandle"
                      />
                    </div>
                  </div>

                  {/* Tattoo Styles */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Tattoo Styles</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TATTOO_STYLES.map(style => {
                        const selected = (artistEdits[i]?.styles ?? []).includes(style)
                        return (
                          <button
                            key={style}
                            type="button"
                            onClick={() => {
                              setArtistEdits(prev => prev.map((ed, idx) => {
                                if (idx !== i) return ed
                                const current = ed.styles ?? []
                                return {
                                  ...ed,
                                  styles: selected
                                    ? current.filter(s => s !== style)
                                    : [...current, style],
                                }
                              }))
                            }}
                            className="rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
                            style={{
                              backgroundColor: selected ? 'rgba(139,115,85,0.25)' : 'rgba(255,255,255,0.04)',
                              color: selected ? '#C4A882' : '#555',
                              border: `1px solid ${selected ? 'rgba(139,115,85,0.5)' : '#2a2a2a'}`,
                            }}
                          >
                            {style}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Portfolio */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>
                      Portfolio ({portfolioImgs.length}/10)
                    </p>
                    {portfolioImgs.length > 0 && (
                      <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {portfolioImgs.map(url => (
                          <div key={url} className="group relative aspect-square overflow-hidden rounded-lg" style={{ border: '1px solid #2a2a2a' }}>
                            <Image src={url} alt="Portfolio" fill style={{ objectFit: 'cover' }} />
                            <button
                              onClick={() => removeArtistPortfolioImage(i, url)}
                              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                              style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#f87171' }}
                            >
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {portfolioImgs.length < 10 && (
                      <div className="flex items-center gap-3">
                        <input type="file" accept="image/jpeg,image/png,image/webp" multiple id={`portfolio-artist-${i}`} className="hidden"
                          onChange={e => { if (e.target.files) uploadArtistPortfolioImages(i, e.target.files) }} />
                        <label htmlFor={`portfolio-artist-${i}`}
                          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold"
                          style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>
                          {isUploading ? 'Uploading…' : '+ Add Images'}
                        </label>
                        <p className="text-xs" style={{ color: '#444' }}>JPG, PNG, WebP · max 20 MB each</p>
                      </div>
                    )}
                  </div>

                  {/* Government ID upload */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Government-issued ID</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      {hasIdDoc ? (
                        <button type="button" onClick={() => docs.open(`artist-${i + 1}`)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                          style={{ backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
                          View Current ID ↗
                        </button>
                      ) : (
                        <span className="text-xs font-semibold" style={{ color: '#f87171' }}>No ID on file</span>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        id={`admin-artist-id-${i}`}
                        className="hidden"
                        onChange={e => setArtistEdits(prev => prev.map((ed, idx) => idx === i ? { ...ed, id_file: e.target.files?.[0] ?? null } : ed))}
                      />
                      <label
                        htmlFor={`admin-artist-id-${i}`}
                        className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                      >
                        {artistEdits[i]?.id_file ? `✓ ${artistEdits[i].id_file!.name}` : (hasIdDoc ? 'Replace ID' : 'Upload ID')}
                      </label>
                    </div>
                  </div>

                  {/* Save button at bottom */}
                  <div className="pt-1">
                    <button
                      onClick={() => saveArtistEdit(i)}
                      disabled={isSaving}
                      className="rounded-lg px-4 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
                      style={{ backgroundColor: '#8B7355' }}
                    >
                      {isSaving ? 'Saving…' : 'Save Artist Info'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Veteran ID (own bucket, shown when veteran discount applies) ── */}
      {app.is_veteran && (
        <Section title="Veteran ID">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Proof of military service</p>
              <p className="text-xs mt-0.5" style={{ color: '#555' }}>DD-214, military ID, or equivalent. Required to verify veteran discount.</p>
            </div>
            {docs.docs.some(d => d.key === 'veteran') ? (
              <button type="button" onClick={() => docs.open('veteran')}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
                View ID ↗
              </button>
            ) : (
              <span className="text-sm font-semibold" style={{ color: '#f87171' }}>Not uploaded</span>
            )}
          </div>
        </Section>
      )}

      {/* ── Application details (read-only) ── */}
      <Section title="Application Details">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <ReadField label="Contact" value={app.contact_name} />
          <ReadField label="Email" value={app.email} />
          <ReadField label="Phone" value={app.phone} />
          <ReadField label="Other links" value={app.other_links} />
          <ReadField label="Booth size" value={describeBooths(app)} />
          <ReadField label="Corner booth" value={app.is_corner} />
          <ReadField label="Veteran" value={app.is_veteran} />
          <ReadField label="TV show (not attributed to an artist; set it on the artist below)" value={unattributedTv(app)} />
          {app.exhibitor_type === 'artist' && <ReadField label="Artists (2 per single, 4 per double)" value={`${app.artist_count} of ${artistCapacity(app)}`} />}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#555' }}>Total invoiced</p>
            <p className="mt-0.5 text-sm font-bold" style={{ color: '#C4A882' }}>{formatCurrency(app.total_amount)}</p>
          </div>
          <ReadField label="Applied" value={new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
          <AddOnList addOns={app.add_ons} labelColor="#555" />
        </div>
      </Section>
    </div>
  )
}
