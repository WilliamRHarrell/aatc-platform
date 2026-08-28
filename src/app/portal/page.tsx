'use client'

import { useEffect, useState, Suspense } from 'react'
import { guardedWrite } from '@/lib/db-write'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { describeBooths } from '@/lib/booth-display'
import toast from 'react-hot-toast'
import { RosterCompletionPanel } from '@/components/portal/RosterCompletionPanel'

interface PortalArtist {
  name: string
  nickname?: string
  styles?: string[]
  id_url: string | null
  id_later?: boolean
  portfolio_urls?: string[]
}

interface Application {
  id: string
  event_id: string | null
  business_name: string
  contact_name: string
  email: string
  exhibitor_type: 'artist' | 'vendor'
  booth_size: 'single' | 'double' | 'triple' | 'quad' | null
  artist_single_qty: number
  artist_double_qty: number
  vendor_single_qty: number
  vendor_double_qty: number
  corner_count: number
  artist_count: number
  is_corner: boolean
  is_veteran: boolean
  total_amount: number
  status: 'pending' | 'approved' | 'rejected' | 'waitlisted'
  artists: PortalArtist[] | null
  artists_ids_later: boolean
  needs_roster: boolean
  facebook: string | null
  logo_url: string | null
  tv_show: string | null
  notes: string | null
  created_at: string
}

interface ArtistDraft {
  name: string
  nickname: string
  styles: string[]
  id_file: File | null
  existing_portfolio_urls: string[]
  portfolio_files: File[]
}

const TATTOO_STYLES = [
  'American Traditional', 'Neo-Traditional', 'Japanese', 'Realism',
  'Watercolor', 'Blackwork', 'Dotwork', 'Geometric', 'Tribal',
  'New School', 'Illustrative', 'Fine Line', 'Surrealism', 'Horror / Dark Art',
  'Biomechanical', 'Lettering / Script', 'Floral', 'Minimalist', 'Portrait', 'Cover-up',
]

interface Booth {
  booth_number: string | number
  is_corner: boolean
}

interface Invoice {
  id: string
  amount: number
  amount_paid: number
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  due_date: string | null
  paid_at: string | null
}

interface Sponsorship {
  id: string
  sponsor_name: string
  tier: string
  amount: number
  status: 'pending' | 'confirmed' | 'cancelled'
  website: string | null
  instagram: string | null
  facebook: string | null
  logo_url: string | null
  contact_name: string | null
  email: string | null
}

interface FoodTruck {
  id: string
  business_name: string
  contact_name: string
  email: string
  cuisine_type: string
  description: string
  website: string | null
  instagram: string | null
  facebook: string | null
  logo_url: string | null
  days: string[]
  thursday_setup: boolean
}

const DAY_LABELS: Record<string, string> = { friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' }

const STATUS_STYLE = {
  pending:    { bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.3)',  color: '#eab308', label: 'Under Review' },
  approved:   { bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)', color: '#4ade80', label: 'Approved' },
  rejected:   { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', color: '#f87171', label: 'Not Accepted' },
  waitlisted: { bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)',  color: '#60a5fa', label: 'Waitlisted' },
}

const INVOICE_STATUS_STYLE: Record<string, { color: string; label: string }> = {
  pending:   { color: '#eab308', label: 'Payment due' },
  paid:      { color: '#4ade80', label: 'Paid' },
  overdue:   { color: '#f87171', label: 'Overdue' },
  cancelled: { color: '#999',    label: 'Cancelled' },
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 sm:p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#8B7355' }}>
      {children}
    </p>
  )
}

// ── Inner component (uses useSearchParams) ────────────────────────────────────

function PortalContent() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const justPaid = searchParams.get('paid') === '1'

  const [loading, setLoading] = useState(true)
  const [applications, setApplications] = useState<Application[]>([])
  const [selectedAppIdx, setSelectedAppIdx] = useState(0)
  const [booths, setBooths] = useState<Booth[]>([])
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [sponsorInvoice, setSponsorInvoice] = useState<Invoice | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [editingArtistIdx, setEditingArtistIdx] = useState<number | null>(null)
  const [artistDraft, setArtistDraft] = useState<ArtistDraft | null>(null)
  const [savingArtist, setSavingArtist] = useState(false)
  // Exhibitor profile self-edit. Directory-facing fields only - everything
  // staff-controlled is clamped by the BEFORE UPDATE trigger from 041/043, so
  // a field that does not appear here cannot be changed from the portal even
  // if the request is hand-crafted.
  const [profileForm, setProfileForm] = useState({
    business_name: '', website: '', instagram: '', facebook: '', phone: '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [sponsorship, setSponsorship] = useState<Sponsorship | null>(null)
  const [sponsorProfile, setSponsorProfile] = useState({ website: '', instagram: '', facebook: '' })
  const [savingSponsorProfile, setSavingSponsorProfile] = useState(false)
  const [foodTruck, setFoodTruck] = useState<FoodTruck | null>(null)
  const [foodTruckInvoice, setFoodTruckInvoice] = useState<Invoice | null>(null)
  const [editingFoodTruck, setEditingFoodTruck] = useState(false)
  const [foodTruckForm, setFoodTruckForm] = useState({
    business_name: '',
    cuisine_type: '',
    description: '',
    website: '',
    instagram: '',
    facebook: '',
  })
  const [foodTruckLogoFile, setFoodTruckLogoFile] = useState<File | null>(null)
  const [savingFoodTruck, setSavingFoodTruck] = useState(false)

  const application = applications[selectedAppIdx] ?? null
  const setApplication = (updater: Application | null | ((prev: Application | null) => Application | null)) => {
    setApplications(prev => {
      const newApps = [...prev]
      if (typeof updater === 'function') {
        newApps[selectedAppIdx] = updater(newApps[selectedAppIdx] ?? null) as Application
      } else if (updater) {
        newApps[selectedAppIdx] = updater
      }
      return newApps
    })
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login?redirect=/portal'); return }
      setUserEmail(user.email ?? null)

      const { data: allApps } = await supabase
        .from('applications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      const app = allApps?.[0] ?? null

      const { data: sponData } = await supabase
        .from('sponsorships')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (sponData) {
        setSponsorship(sponData as unknown as Sponsorship)
        setSponsorProfile({
          website: (sponData as unknown as Sponsorship).website ?? '',
          instagram: (sponData as unknown as Sponsorship).instagram ?? '',
          facebook: (sponData as unknown as Sponsorship).facebook ?? '',
        })
        const { data: sponInvoice } = await supabase
          .from('invoices')
          .select('id, amount, amount_paid, status, due_date, paid_at')
          .eq('sponsorship_id', sponData.id)
          .single()
        if (sponInvoice) setSponsorInvoice(sponInvoice as Invoice)
      }

      const { data: truckData } = await supabase
        .from('food_trucks')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (truckData) {
        const truck = truckData as FoodTruck
        setFoodTruck(truck)
        setFoodTruckForm({
          business_name: truck.business_name,
          cuisine_type: truck.cuisine_type,
          description: truck.description,
          website: truck.website || '',
          instagram: truck.instagram || '',
          facebook: truck.facebook || '',
        })

        const { data: ftInv } = await supabase
          .from('invoices')
          .select('*')
          .eq('food_truck_id', truck.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (ftInv) setFoodTruckInvoice(ftInv as Invoice)
      }

      // Sponsor self-claim removed. It matched on email alone with no
      // verification, which is the wrong mechanism for something granting
      // access to negotiated amounts and contact details - and it never worked
      // anyway, because sponsorships has no owner UPDATE policy, so RLS
      // filtered it to zero rows silently. With ~15 sponsors it does not need
      // to scale: an admin links the account from /admin/sponsorships.

      if (!app) { setLoading(false); return }
      setApplications((allApps ?? []) as unknown as Application[])
      setProfileForm({
        business_name: app.business_name ?? '',
        website: app.website ?? '',
        instagram: app.instagram ?? '',
        facebook: app.facebook ?? '',
        phone: app.phone ?? '',
      })

      const [{ data: boothData }, { data: invoiceData }] = await Promise.all([
        supabase
          .from('booths')
          .select('booth_number, is_corner')
          .eq('application_id', app.id)
          .order('booth_number', { ascending: true }),
        supabase
          .from('invoices')
          .select('id, amount, amount_paid, status, due_date, paid_at')
          .eq('application_id', app.id)
          .single(),
      ])

      if (boothData && boothData.length > 0) setBooths(boothData as unknown as Booth[])
      if (invoiceData) setInvoice(invoiceData as Invoice)
      setLoading(false)
    }
    load()
  }, [])

  const switchApp = async (idx: number) => {
    const app = applications[idx]
    if (!app) return
    setSelectedAppIdx(idx)
    setEditingArtistIdx(null)
    setArtistDraft(null)
    const [{ data: boothData }, { data: invoiceData }] = await Promise.all([
      supabase
        .from('booths')
        .select('booth_number, is_corner')
        .eq('application_id', app.id)
        .order('booth_number', { ascending: true }),
      supabase
        .from('invoices')
        .select('id, amount, amount_paid, status, due_date, paid_at')
        .eq('application_id', app.id)
        .single(),
    ])

    setBooths(boothData && boothData.length > 0 ? (boothData as unknown as Booth[]) : [])
    setInvoice(invoiceData ? (invoiceData as Invoice) : null)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/apply')
  }

  const startEditArtist = (i: number) => {
    const a = application?.artists?.[i]
    setArtistDraft({
      name: a?.name ?? '',
      nickname: a?.nickname ?? '',
      styles: a?.styles ?? [],
      id_file: null,
      existing_portfolio_urls: a?.portfolio_urls ?? [],
      portfolio_files: [],
    })
    setEditingArtistIdx(i)
  }

  const saveArtistEdit = async (i: number) => {
    if (!application || !artistDraft) return
    setSavingArtist(true)

    const artist = application.artists![i]
    let id_url = artist.id_url

    if (artistDraft.id_file) {
      const { data: { user } } = await supabase.auth.getUser()
      const ext = artistDraft.id_file.name.split('.').pop()
      const path = `${user!.id}/${Date.now()}-artist-${i + 1}-id.${ext}`
      const { data: up, error: upErr } = await supabase.storage
        .from('application-docs')
        .upload(path, artistDraft.id_file)
      if (upErr) {
        toast.error('Failed to upload ID')
        setSavingArtist(false)
        return
      }
      id_url = up.path
    }

    const newPortfolioUrls: string[] = []
    for (let j = 0; j < artistDraft.portfolio_files.length; j++) {
      const f = artistDraft.portfolio_files[j]
      const ext = f.name.split('.').pop()
      const path = `${application.id}/artists/${i}/${Date.now()}-${j}.${ext}`
      const { data: up, error: upErr } = await supabase.storage
        .from('exhibitor-media')
        .upload(path, f)
      if (!upErr && up) {
        const { data: urlData } = supabase.storage.from('exhibitor-media').getPublicUrl(up.path)
        newPortfolioUrls.push(urlData.publicUrl)
      }
    }
    const portfolio_urls = [...artistDraft.existing_portfolio_urls, ...newPortfolioUrls]

    const updatedArtists = application.artists!.map((ar, idx) =>
      idx === i
        ? { ...ar, name: artistDraft.name, nickname: artistDraft.nickname, styles: artistDraft.styles, id_url, portfolio_urls }
        : ar
    )

    const { data: rows, error } = await supabase
      .from('applications')
      .update({ artists: updatedArtists as never })
      .eq('id', application.id)
      .select('id')

    if (error) {
      toast.error('Failed to save artist info')
    } else if (!rows || rows.length === 0) {
      // Zero rows with no error = RLS filtered it (see migration 041).
      console.error('[portal] artist edit affected 0 rows - no error returned')
      toast.error('Nothing was saved. Please contact us if this keeps happening.')
    } else {
      setApplication(prev => prev ? { ...prev, artists: updatedArtists } : prev)
      setEditingArtistIdx(null)
      setArtistDraft(null)
      toast.success('Artist info saved')
    }
    setSavingArtist(false)
  }

  /**
   * Save the directory-facing profile. Publishes immediately - no queue.
   *
   * guardedWrite is essential here rather than nice to have: this is an
   * RLS-filtered write by a non-admin, and PostgREST returns data: [] with
   * error: null when the policy excludes the row. Unguarded, an exhibitor
   * would see "Profile saved" and the directory would keep the old name.
   */
  const saveProfile = async () => {
    if (!application) return
    if (!profileForm.business_name.trim()) {
      toast.error('Business name cannot be empty - it is how you appear in the directory')
      return
    }
    setSavingProfile(true)

    const patch = {
      business_name: profileForm.business_name.trim(),
      website: profileForm.website.trim() || null,
      instagram: profileForm.instagram.trim() || null,
      facebook: profileForm.facebook.trim() || null,
      phone: profileForm.phone.trim() || null,
    }

    const res = await guardedWrite(
      supabase.from('applications').update(patch).eq('id', application.id).select('id'),
      'Could not save your profile',
      `portal profile self-edit app=${application.id}`,
    )

    if (res.ok) {
      setApplication(prev => (prev ? { ...prev, ...patch } : prev))
      toast.success('Profile updated - your directory listing is live')
    } else {
      toast.error(res.error!)
    }
    setSavingProfile(false)
  }

  /**
   * Logo upload. The path MUST start `profiles/<user id>/` - migration 048's
   * storage policy scopes owner writes to exactly that prefix, so anything
   * else is rejected, and it keeps exhibitors out of `sponsors/` and
   * `aatc-graphics` (both retained at cutover).
   */
  const uploadProfileLogo = async (file: File) => {
    if (!application) return
    setUploadingLogo(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Please sign in again'); setUploadingLogo(false); return }

    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
    const path = `profiles/${user.id}/logo-${Date.now()}.${ext}`

    const { data, error } = await supabase.storage
      .from('exhibitor-media')
      .upload(path, file, { upsert: true })

    if (error || !data) {
      // Before 048 this bucket was admin-insert-only, so a denial here on a
      // deploy without that migration is expected rather than mysterious.
      console.error('[portal] logo upload failed:', error)
      toast.error('Could not upload the logo. Please try again.')
      setUploadingLogo(false)
      return
    }

    const { data: urlData } = supabase.storage.from('exhibitor-media').getPublicUrl(data.path)

    const res = await guardedWrite(
      supabase.from('applications').update({ logo_url: urlData.publicUrl }).eq('id', application.id).select('id'),
      'Logo uploaded but could not be attached to your listing',
      `portal logo self-edit app=${application.id}`,
    )

    if (res.ok) {
      setApplication(prev => (prev ? { ...prev, logo_url: urlData.publicUrl } : prev))
      toast.success('Logo updated')
    } else {
      toast.error(res.error!)
    }
    setUploadingLogo(false)
  }

  const uploadSponsorLogo = async (file: File) => {
    if (!sponsorship) return
    const ext = file.name.split('.').pop()
    const path = `sponsors/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage.from('exhibitor-media').upload(path, file)
    if (error || !data) { toast.error('Failed to upload logo'); return }
    const { data: urlData } = supabase.storage.from('exhibitor-media').getPublicUrl(data.path)
    await guardedWrite(
      supabase.from('sponsorships').update({ logo_url: urlData.publicUrl }).eq('id', sponsorship.id).select('id'),
      'Could not save your logo',
      'sponsor logo upload',
    )
    setSponsorship(prev => prev ? { ...prev, logo_url: urlData.publicUrl } : null)
    toast.success('Logo updated')
  }

  const saveSponsorProfileFn = async () => {
    if (!sponsorship) return
    setSavingSponsorProfile(true)
    // Was unguarded: no .select(), so an RLS-filtered write returned
    // error: null and toasted success having changed nothing. sponsorships has
    // no owner UPDATE policy at all, so that was the actual behaviour.
    const res = await guardedWrite(
      supabase.from('sponsorships').update({
        website: sponsorProfile.website || null,
        instagram: sponsorProfile.instagram || null,
        facebook: sponsorProfile.facebook || null,
      }).eq('id', sponsorship.id).select('id'),
      'Could not save your profile',
      `portal sponsor profile sponsorship=${sponsorship.id}`,
    )
    if (!res.ok) {
      toast.error(res.error!)
    } else {
      setSponsorship(prev => prev ? { ...prev, ...sponsorProfile } : null)
      toast.success('Profile saved')
    }
    setSavingSponsorProfile(false)
  }

  const handleSaveFoodTruck = async () => {
    if (!foodTruck) return
    setSavingFoodTruck(true)

    try {
      const updates: Record<string, unknown> = {
        business_name: foodTruckForm.business_name,
        cuisine_type: foodTruckForm.cuisine_type,
        description: foodTruckForm.description,
        website: foodTruckForm.website || null,
        instagram: foodTruckForm.instagram || null,
        facebook: foodTruckForm.facebook || null,
      }

      if (foodTruckLogoFile) {
        const ext = foodTruckLogoFile.name.split('.').pop() || 'jpg'
        const path = `${foodTruck.id}/logo.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('food-truck-logos')
          .upload(path, foodTruckLogoFile, { upsert: true })

        if (uploadErr) {
          toast.error('Failed to upload logo')
          setSavingFoodTruck(false)
          return
        }
        updates.logo_url = path
      }

      const { error } = await supabase
        .from('food_trucks')
        .update(updates)
        .eq('id', foodTruck.id)

      if (error) {
        toast.error('Failed to save changes')
      } else {
        toast.success('Profile updated!')
        setFoodTruck({ ...foodTruck, ...updates } as FoodTruck)
        setEditingFoodTruck(false)
        setFoodTruckLogoFile(null)
      }
    } catch {
      toast.error('Something went wrong')
    }

    setSavingFoodTruck(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">

        {/* Nav bar */}
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/apply"
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ color: '#999' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#999')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span className="text-emboss">Back</span>
          </Link>
          <div className="flex items-center gap-4">
            {userEmail && <p className="text-emboss hidden text-xs sm:block" style={{ color: '#555' }}>{userEmail}</p>}
            <Link
              href="/auth/reset-password"
              className="text-sm transition-colors"
              style={{ color: '#666' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#666')}
            >
              <span className="text-emboss">Change password</span>
            </Link>
            <button
              onClick={handleSignOut}
              className="text-sm transition-colors"
              style={{ color: '#666' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#666')}
            >
              <span className="text-emboss">Sign out</span>
            </button>
          </div>
        </div>

        {/* Payment success banner */}
        {justPaid && (
          <div
            className="mb-6 rounded-2xl px-5 py-4"
            style={{ backgroundColor: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)' }}
          >
            <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>
              Payment received - thank you!
            </p>
            <p className="mt-0.5 text-xs" style={{ color: '#999' }}>
              A receipt has been sent to your email by Stripe. Check your balance below.
            </p>
          </div>
        )}

        {/* Application switcher */}
        {applications.length > 1 && (
          <div
            className="mb-6 inline-flex rounded-xl p-1"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            {applications.map((app, i) => (
              <button
                key={app.id}
                onClick={() => switchApp(i)}
                className="rounded-lg px-4 py-2 text-xs font-bold capitalize transition-colors"
                style={{
                  backgroundColor: selectedAppIdx === i ? '#8B7355' : 'transparent',
                  color: selectedAppIdx === i ? '#fff' : '#666',
                }}
              >
                {app.exhibitor_type} Booth
              </button>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <p className="mb-1 text-sm font-medium uppercase tracking-widest" style={{ color: '#8B7355' }}>
            {/* "My Application" is wrong for someone who has none - and this is
                the first thing a new exhibitor sees after registering. */}
            <span className="text-emboss">{
              application ? 'My Application'
                : sponsorship ? 'My Sponsorship'
                : foodTruck ? 'Food Truck Vendor'
                : 'Get Started'
            }</span>
          </p>
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
            <span className="text-emboss">{application ? application.business_name : sponsorship ? sponsorship.sponsor_name : foodTruck ? foodTruck.business_name : 'Applicant Portal'}</span>
          </h1>
          {application && (
            <p className="mt-0 text-sm capitalize" style={{ color: '#999' }}>
              <span className="text-emboss">
                {application.exhibitor_type} · {describeBooths(application)} ·{' '}
                Submitted {new Date(application.created_at).toLocaleDateString()}
              </span>
            </p>
          )}
          {sponsorship && !application && (
            <p className="mt-0 text-sm" style={{ color: '#999' }}>
              <span className="text-emboss">
                <span
                  className="mr-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
                  style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882' }}
                >
                  {sponsorship.tier}
                </span>
                Sponsor
              </span>
            </p>
          )}
        </div>

        {/* No application, no sponsorship, and no food truck */}
        {!application && !sponsorship && !foodTruck && (
          <Card>
            <p className="mb-4 text-sm" style={{ color: '#999' }}>
              You haven&apos;t submitted an application yet.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/apply/artist"
                className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: '#8B7355' }}
              >
                Apply as Artist
              </Link>
              <Link
                href="/apply/vendor"
                className="rounded-lg px-5 py-2.5 text-sm font-semibold"
                style={{ backgroundColor: 'transparent', border: '1px solid #2a2a2a', color: '#999' }}
              >
                Apply as Vendor
              </Link>
              <Link
                href="/apply/sponsor"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#8B7355' }}
              >
                Apply as Sponsor
              </Link>
            </div>
          </Card>
        )}

        {application && (
          <div className="space-y-4">

            {application.needs_roster ? (
              <RosterCompletionPanel application={application} onComplete={() => window.location.reload()} />
            ) : (
            <>

            {/* Status card */}
            {(() => {
              const s = STATUS_STYLE[application.status]
              return (
                <div
                  className="rounded-2xl p-5"
                  style={{ backgroundColor: s.bg, border: `1px solid ${s.border}` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: s.color }}>
                        Application Status
                      </p>
                      <p className="mt-1 text-xl font-bold text-white">{s.label}</p>
                      {application.status === 'pending' && (
                        <p className="mt-1 text-sm" style={{ color: '#999' }}>
                          We&apos;re reviewing your application. You&apos;ll be notified at {application.email}.
                        </p>
                      )}
                      {application.status === 'approved' && (
                        <p className="mt-1 text-sm" style={{ color: '#999' }}>
                          Congratulations! Your application has been approved.
                          {invoice && invoice.status !== 'paid' ? ' Please pay your invoice below.' : ''}
                        </p>
                      )}
                      {application.status === 'waitlisted' && (
                        <p className="mt-1 text-sm" style={{ color: '#999' }}>
                          You&apos;re on the waitlist. We&apos;ll contact you if a spot opens up.
                        </p>
                      )}
                      {application.status === 'rejected' && (
                        <p className="mt-1 text-sm" style={{ color: '#999' }}>
                          Unfortunately we weren&apos;t able to accept your application this year.
                        </p>
                      )}
                    </div>
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
                      style={{ backgroundColor: s.bg }}
                    >
                      {application.status === 'approved' ? '✓' :
                       application.status === 'pending' ? '⏳' :
                       application.status === 'waitlisted' ? '↕' : '✕'}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Booth assignment */}
            {application.status === 'approved' && (
              <Card>
                <SectionLabel>Booth Assignment</SectionLabel>
                {booths.length > 0 ? (
                  <div>
                    <div className="flex flex-wrap gap-3 mb-3">
                      {booths.map(b => (
                        <div
                          key={b.booth_number}
                          className="flex h-16 w-16 items-center justify-center rounded-xl font-display text-2xl font-bold text-white"
                          style={{ backgroundColor: 'rgba(139,115,85,0.2)', border: `2px solid ${b.is_corner ? '#8B7355' : 'rgba(139,115,85,0.4)'}` }}
                        >
                          {b.booth_number}
                        </div>
                      ))}
                    </div>
                    <p className="text-sm capitalize" style={{ color: '#999' }}>
                      {describeBooths(application)} · {booths.length} slot{booths.length !== 1 ? 's' : ''}
                      {booths.some(b => b.is_corner) ? ' · Corner' : ''}
                    </p>
                    {application.is_veteran && (
                      <p className="mt-0.5 text-xs" style={{ color: '#4ade80' }}>Veteran discount applied</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: '#666' }}>
                    Your booth is being assigned - check back soon.
                  </p>
                )}
              </Card>
            )}

            {/* Invoice & Payment */}
            {invoice && (() => {
              const amountPaid = invoice.amount_paid ?? 0
              const balance = invoice.amount - amountPaid
              const hasPartial = amountPaid > 0 && amountPaid < invoice.amount
              const isPayable = invoice.status === 'pending' || invoice.status === 'overdue'

              return (
                <Card>
                  <SectionLabel>Invoice</SectionLabel>

                  <div className="rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: '#999' }}>Invoice total</span>
                      <span className="font-medium text-white">{formatCurrency(invoice.amount)}</span>
                    </div>
                    {amountPaid > 0 && (
                      <div className="mt-2 flex justify-between text-sm">
                        <span style={{ color: '#999' }}>Paid so far</span>
                        <span className="font-medium" style={{ color: '#4ade80' }}>
                          -{formatCurrency(amountPaid)}
                        </span>
                      </div>
                    )}
                    <div className="mt-2 flex justify-between border-t pt-2 text-sm" style={{ borderColor: '#2a2a2a' }}>
                      <span className="font-semibold" style={{ color: invoice.status === 'paid' ? '#4ade80' : '#C4A882' }}>
                        {invoice.status === 'paid' ? 'Paid in full' : 'Balance due'}
                      </span>
                      <span className="font-bold" style={{ color: invoice.status === 'paid' ? '#4ade80' : '#C4A882' }}>
                        {invoice.status === 'paid' ? formatCurrency(0) : formatCurrency(balance)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: INVOICE_STATUS_STYLE[invoice.status]?.color ? `${INVOICE_STATUS_STYLE[invoice.status].color}20` : 'rgba(153,153,153,0.15)',
                        color: INVOICE_STATUS_STYLE[invoice.status]?.color ?? '#999',
                      }}
                    >
                      {INVOICE_STATUS_STYLE[invoice.status]?.label}
                    </span>
                    {hasPartial && invoice.status !== 'paid' && (
                      <span
                        className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}
                      >
                        Deposit received
                      </span>
                    )}
                    {invoice.paid_at && (
                      <span className="text-xs" style={{ color: '#555' }}>
                        {new Date(invoice.paid_at).toLocaleDateString()}
                      </span>
                    )}
                    {invoice.due_date && invoice.status !== 'paid' && (
                      <span className="text-xs" style={{ color: '#555' }}>
                        Due {new Date(invoice.due_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {isPayable && (
                    <div className="mt-5">
                      <Link
                        href={`/portal/pay?invoice=${invoice.id}`}
                        className="block w-full rounded-xl py-3 text-center text-sm font-bold tracking-wide text-white transition-opacity"
                        style={{ backgroundColor: '#8B7355' }}
                      >
                        Pay Now
                      </Link>
                    </div>
                  )}

                  {invoice.status === 'paid' && (
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-xl py-3" style={{ backgroundColor: 'rgba(74,222,128,0.1)' }}>
                      <span style={{ color: '#4ade80' }}>✓</span>
                      <span className="text-sm font-semibold" style={{ color: '#4ade80' }}>Booth confirmed - you&apos;re all set!</span>
                    </div>
                  )}
                </Card>
              )
            })()}

            {/* Artist roster */}
            {application.exhibitor_type === 'artist' && (
              <Card>
                <SectionLabel>
                  Artist Roster{' '}
                  <span className="normal-case font-normal" style={{ color: '#555' }}>
                    ({application.artist_count} artist{application.artist_count !== 1 ? 's' : ''})
                  </span>
                </SectionLabel>
                <div className="space-y-3">
                  {(application.artists ?? Array.from({ length: application.artist_count }, (): PortalArtist => ({ name: '', id_url: null }))).map((a: PortalArtist, i) => {
                    const isEditing = editingArtistIdx === i
                    const canEdit = application.status !== 'rejected'
                    return (
                      <div
                        key={i}
                        className="rounded-xl overflow-hidden"
                        style={{ backgroundColor: '#0a0a0a', border: `1px solid ${isEditing ? 'rgba(139,115,85,0.4)' : '#2a2a2a'}` }}
                      >
                        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: isEditing ? '1px solid #1a1a1a' : 'none' }}>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Artist {i + 1}</p>
                            {!isEditing && (
                              <p className="mt-0.5 text-sm font-medium text-white">
                                {a.name || <span style={{ color: '#444' }}>Name not provided</span>}
                                {a.nickname ? <span style={{ color: '#666' }}> "{a.nickname}"</span> : null}
                              </p>
                            )}
                            {!isEditing && a.styles && a.styles.length > 0 && (
                              <p className="mt-0.5 text-xs" style={{ color: '#666' }}>{a.styles.join(', ')}</p>
                            )}
                            {!isEditing && a.portfolio_urls && a.portfolio_urls.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {a.portfolio_urls.map((url, ui) => (
                                  <img key={ui} src={url} alt="portfolio" className="h-10 w-10 rounded object-cover" style={{ border: '1px solid #2a2a2a' }} />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {!isEditing && (
                              <span className="text-xs font-semibold" style={{ color: a.id_url ? '#4ade80' : '#555' }}>
                                {a.id_url ? 'ID ✓' : 'No ID'}
                              </span>
                            )}
                            {canEdit && !isEditing && (
                              <button
                                onClick={() => startEditArtist(i)}
                                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                                style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                              >
                                Edit
                              </button>
                            )}
                            {isEditing && (
                              <button
                                onClick={() => { setEditingArtistIdx(null); setArtistDraft(null) }}
                                className="text-xs"
                                style={{ color: '#555' }}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>

                        {isEditing && artistDraft && (
                          <div className="space-y-4 p-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Legal Name</label>
                                <input
                                  type="text"
                                  value={artistDraft.name}
                                  onChange={e => setArtistDraft(d => d ? { ...d, name: e.target.value } : d)}
                                  placeholder="Full legal name"
                                  className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                                  style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                                  onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                                  onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Stage Name / Handle</label>
                                <input
                                  type="text"
                                  value={artistDraft.nickname}
                                  onChange={e => setArtistDraft(d => d ? { ...d, nickname: e.target.value } : d)}
                                  placeholder="Artist name or handle"
                                  className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                                  style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                                  onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                                  onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                                />
                              </div>
                            </div>

                            <div>
                              <label className="mb-2 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Tattoo Styles</label>
                              <div className="flex flex-wrap gap-1.5">
                                {TATTOO_STYLES.map(style => {
                                  const selected = artistDraft.styles.includes(style)
                                  return (
                                    <button
                                      key={style}
                                      type="button"
                                      onClick={() => setArtistDraft(d => {
                                        if (!d) return d
                                        return {
                                          ...d,
                                          styles: selected ? d.styles.filter(s => s !== style) : [...d.styles, style],
                                        }
                                      })}
                                      className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                                      style={{
                                        backgroundColor: selected ? 'rgba(139,115,85,0.2)' : 'rgba(255,255,255,0.04)',
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

                            <div>
                              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>
                                Government-issued ID {a.id_url ? <span style={{ color: '#4ade80' }}>(on file - upload to replace)</span> : '(optional)'}
                              </label>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,application/pdf"
                                id={`artist-id-${i}`}
                                className="hidden"
                                onChange={e => setArtistDraft(d => d ? { ...d, id_file: e.target.files?.[0] ?? null } : d)}
                              />
                              <label
                                htmlFor={`artist-id-${i}`}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                                style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                              >
                                {artistDraft.id_file ? `✓ ${artistDraft.id_file.name}` : 'Upload ID'}
                              </label>
                            </div>

                            <div>
                              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Portfolio Images</label>
                              <p className="mb-2 text-xs" style={{ color: '#666' }}>Up to 10 photos of your work (JPG, PNG, WebP)</p>
                              {(artistDraft.existing_portfolio_urls.length > 0 || artistDraft.portfolio_files.length > 0) && (
                                <div className="mb-2 flex flex-wrap gap-2">
                                  {artistDraft.existing_portfolio_urls.map((url, ui) => (
                                    <div key={ui} className="relative h-16 w-16 overflow-hidden rounded-lg" style={{ border: '1px solid #2a2a2a' }}>
                                      <img src={url} alt="portfolio" className="h-full w-full object-cover" />
                                      <button
                                        type="button"
                                        onClick={() => setArtistDraft(d => d ? { ...d, existing_portfolio_urls: d.existing_portfolio_urls.filter((_, idx) => idx !== ui) } : d)}
                                        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
                                        style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff' }}
                                      >✕</button>
                                    </div>
                                  ))}
                                  {artistDraft.portfolio_files.map((f, fi) => (
                                    <div key={`new-${fi}`} className="relative h-16 w-16 overflow-hidden rounded-lg" style={{ border: '1px solid rgba(139,115,85,0.4)' }}>
                                      <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover" />
                                      <button
                                        type="button"
                                        onClick={() => setArtistDraft(d => d ? { ...d, portfolio_files: d.portfolio_files.filter((_, idx) => idx !== fi) } : d)}
                                        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
                                        style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff' }}
                                      >✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {(artistDraft.existing_portfolio_urls.length + artistDraft.portfolio_files.length) < 10 && (
                                <>
                                  <input
                                    type="file"
                                    multiple
                                    accept="image/jpeg,image/png,image/webp"
                                    id={`portfolio-${i}`}
                                    className="hidden"
                                    onChange={e => {
                                      const newFiles = Array.from(e.target.files ?? [])
                                      setArtistDraft(d => {
                                        if (!d) return d
                                        const canAdd = 10 - d.existing_portfolio_urls.length - d.portfolio_files.length
                                        return { ...d, portfolio_files: [...d.portfolio_files, ...newFiles.slice(0, canAdd)] }
                                      })
                                      e.target.value = ''
                                    }}
                                  />
                                  <label
                                    htmlFor={`portfolio-${i}`}
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                                    style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                                  >
                                    Add photos{(artistDraft.existing_portfolio_urls.length + artistDraft.portfolio_files.length) > 0 ? ` (${artistDraft.existing_portfolio_urls.length + artistDraft.portfolio_files.length}/10)` : ''}
                                  </label>
                                </>
                              )}
                            </div>

                            <button
                              onClick={() => saveArtistEdit(i)}
                              disabled={savingArtist}
                              className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                              style={{ backgroundColor: '#8B7355' }}
                            >
                              {savingArtist ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}

            {/* Application details */}
            <Card>
              <SectionLabel>Application Details</SectionLabel>
              <dl className="space-y-2">
                {[
                  { label: 'Contact',   value: application.contact_name },
                  { label: 'Email',     value: application.email },
                  { label: 'Booth size', value: describeBooths(application) },
                  { label: 'Corner booth', value: application.is_corner ? 'Requested' : null },
                  { label: 'Veteran',   value: application.is_veteran ? 'Discount applied' : null },
                  { label: 'TV show',   value: application.tv_show },
                  { label: 'Notes',     value: application.notes },
                ].filter(r => r.value).map(r => (
                  <div key={r.label} className="flex gap-4 text-sm">
                    <dt className="w-28 shrink-0 font-medium" style={{ color: '#666' }}>{r.label}</dt>
                    <dd className="text-white">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            {/* ── Directory profile - self-edit, publishes immediately ── */}
            <Card>
              <SectionLabel>Directory Profile</SectionLabel>
              <p className="mb-4 text-xs leading-relaxed" style={{ color: '#777' }}>
                This is how you appear in the public directory. Changes go live
                straight away - there is no approval step.
              </p>

              <div className="space-y-4">
                {/* Logo */}
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Logo</label>
                  <div className="flex items-center gap-4">
                    {application.logo_url && (
                      <img
                        src={application.logo_url}
                        alt={`${application.business_name} logo`}
                        className="h-16 w-16 rounded-lg object-contain"
                        style={{ border: '1px solid #2a2a2a', backgroundColor: '#111' }}
                      />
                    )}
                    <div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        id="profile-logo-upload"
                        className="hidden"
                        disabled={uploadingLogo}
                        onChange={e => { if (e.target.files?.[0]) uploadProfileLogo(e.target.files[0]); e.target.value = '' }}
                      />
                      <label
                        htmlFor="profile-logo-upload"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                        style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                      >
                        {uploadingLogo ? 'Uploading…' : application.logo_url ? 'Replace Logo' : 'Upload Logo'}
                      </label>
                      <p className="mt-1 text-[11px]" style={{ color: '#555' }}>JPG, PNG or WebP.</p>
                    </div>
                  </div>
                </div>

                {[
                  { key: 'business_name', label: 'Business name', type: 'text', placeholder: '', hint: 'How you are listed in the directory, and how our team finds you.' },
                  { key: 'website', label: 'Website', type: 'url', placeholder: 'https://yoursite.com', hint: '' },
                  { key: 'instagram', label: 'Instagram', type: 'text', placeholder: '@handle', hint: '' },
                  { key: 'facebook', label: 'Facebook', type: 'text', placeholder: 'Page URL or name', hint: '' },
                  { key: 'phone', label: 'Phone', type: 'tel', placeholder: '', hint: '' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>{f.label}</label>
                    <input
                      type={f.type}
                      value={profileForm[f.key as keyof typeof profileForm]}
                      onChange={e => setProfileForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                      style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                      onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                      onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                    />
                    {f.hint && <p className="mt-1 text-[11px]" style={{ color: '#555' }}>{f.hint}</p>}
                  </div>
                ))}

                <button
                  onClick={saveProfile}
                  disabled={savingProfile}
                  className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: '#8B7355' }}
                >
                  {savingProfile ? 'Saving…' : 'Save Profile'}
                </button>
              </div>
            </Card>

            </>
            )}

          </div>
        )}

        {/* Sponsor portal */}
        {sponsorship && (
          <div className="space-y-4">
            {(() => {
              const confirmed = sponsorship.status === 'confirmed'
              return (
                <div
                  className="rounded-2xl p-5"
                  style={{
                    backgroundColor: confirmed ? 'rgba(74,222,128,0.12)' : 'rgba(234,179,8,0.12)',
                    border: `1px solid ${confirmed ? 'rgba(74,222,128,0.3)' : 'rgba(234,179,8,0.3)'}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: confirmed ? '#4ade80' : '#eab308' }}>
                        Sponsorship Status
                      </p>
                      <p className="mt-1 text-xl font-bold text-white">
                        {confirmed ? 'Sponsorship Confirmed' : 'Pending Review'}
                      </p>
                      <p className="mt-1 text-sm" style={{ color: '#999' }}>
                        {confirmed
                          ? 'Thank you for your sponsorship! Review your details and payment below.'
                          : 'Your sponsorship is being reviewed. We\'ll be in touch shortly.'}
                      </p>
                    </div>
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
                      style={{ backgroundColor: confirmed ? 'rgba(74,222,128,0.12)' : 'rgba(234,179,8,0.12)' }}
                    >
                      {confirmed ? '✓' : '⏳'}
                    </div>
                  </div>
                </div>
              )
            })()}

            {sponsorInvoice && (() => {
              const inv = sponsorInvoice
              const amountPaid = inv.amount_paid ?? 0
              const balance = inv.amount - amountPaid
              const hasPartial = amountPaid > 0 && amountPaid < inv.amount
              const isPayable = inv.status === 'pending' || inv.status === 'overdue'

              return (
                <Card>
                  <SectionLabel>Invoice</SectionLabel>
                  <div className="rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: '#999' }}>Invoice total</span>
                      <span className="font-medium text-white">{formatCurrency(inv.amount)}</span>
                    </div>
                    {amountPaid > 0 && (
                      <div className="mt-2 flex justify-between text-sm">
                        <span style={{ color: '#999' }}>Paid so far</span>
                        <span className="font-medium" style={{ color: '#4ade80' }}>-{formatCurrency(amountPaid)}</span>
                      </div>
                    )}
                    <div className="mt-2 flex justify-between border-t pt-2 text-sm" style={{ borderColor: '#2a2a2a' }}>
                      <span className="font-semibold" style={{ color: inv.status === 'paid' ? '#4ade80' : '#C4A882' }}>
                        {inv.status === 'paid' ? 'Paid in full' : 'Balance due'}
                      </span>
                      <span className="font-bold" style={{ color: inv.status === 'paid' ? '#4ade80' : '#C4A882' }}>
                        {inv.status === 'paid' ? formatCurrency(0) : formatCurrency(balance)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${INVOICE_STATUS_STYLE[inv.status]?.color ?? '#999'}20`, color: INVOICE_STATUS_STYLE[inv.status]?.color ?? '#999' }}>
                      {INVOICE_STATUS_STYLE[inv.status]?.label}
                    </span>
                    {hasPartial && inv.status !== 'paid' && <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>Deposit received</span>}
                    {inv.paid_at && <span className="text-xs" style={{ color: '#555' }}>{new Date(inv.paid_at).toLocaleDateString()}</span>}
                    {inv.due_date && inv.status !== 'paid' && <span className="text-xs" style={{ color: '#555' }}>Due {new Date(inv.due_date).toLocaleDateString()}</span>}
                  </div>
                  {isPayable && (
                    <div className="mt-5">
                      <Link
                        href={`/portal/pay?invoice=${sponsorInvoice!.id}`}
                        className="block w-full rounded-xl py-3 text-center text-sm font-bold tracking-wide text-white transition-opacity"
                        style={{ backgroundColor: '#8B7355' }}
                      >
                        Pay Now
                      </Link>
                    </div>
                  )}
                  {inv.status === 'paid' && (
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-xl py-3" style={{ backgroundColor: 'rgba(74,222,128,0.1)' }}>
                      <span style={{ color: '#4ade80' }}>✓</span>
                      <span className="text-sm font-semibold" style={{ color: '#4ade80' }}>Sponsorship paid - thank you!</span>
                    </div>
                  )}
                </Card>
              )
            })()}

            <Card>
              <SectionLabel>Sponsor Profile</SectionLabel>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Logo</label>
                  <div className="flex items-center gap-4">
                    {sponsorship.logo_url && <img src={sponsorship.logo_url} alt="Sponsor logo" className="h-16 w-16 rounded-lg object-contain" style={{ border: '1px solid #2a2a2a', backgroundColor: '#111' }} />}
                    <div>
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" id="sponsor-logo-upload" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadSponsorLogo(e.target.files[0]); e.target.value = '' }} />
                      <label htmlFor="sponsor-logo-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>
                        {sponsorship.logo_url ? 'Replace Logo' : 'Upload Logo'}
                      </label>
                    </div>
                  </div>
                </div>
                {[
                  { key: 'website', label: 'Website', type: 'url', placeholder: 'https://yoursite.com' },
                  { key: 'instagram', label: 'Instagram', type: 'text', placeholder: '@handle' },
                  { key: 'facebook', label: 'Facebook', type: 'text', placeholder: 'Facebook page URL or name' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>{f.label}</label>
                    <input type={f.type} value={sponsorProfile[f.key as keyof typeof sponsorProfile]} onChange={e => setSponsorProfile(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }} onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')} onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')} />
                  </div>
                ))}
                <button onClick={saveSponsorProfileFn} disabled={savingSponsorProfile} className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50" style={{ backgroundColor: '#8B7355' }}>
                  {savingSponsorProfile ? 'Saving…' : 'Save Profile'}
                </button>
              </div>
            </Card>

            <Card>
              <SectionLabel>Sponsorship Details</SectionLabel>
              <dl className="space-y-2">
                {[
                  { label: 'Tier', value: sponsorship.tier },
                  { label: 'Amount', value: formatCurrency(sponsorship.amount) },
                  { label: 'Contact', value: sponsorship.contact_name },
                  { label: 'Email', value: sponsorship.email },
                ].filter(r => r.value).map(r => (
                  <div key={r.label} className="flex gap-4 text-sm">
                    <dt className="w-28 shrink-0 font-medium" style={{ color: '#666' }}>{r.label}</dt>
                    <dd className="text-white capitalize">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        )}

        {/* Food Truck Vendor */}
        {foodTruck && (
          <div className="space-y-4" style={{ marginTop: application || sponsorship ? '1rem' : undefined }}>
            <div className="mb-2">
              <p className="mb-1 text-sm font-medium uppercase tracking-widest" style={{ color: '#8B7355' }}>Food Truck Vendor</p>
              <h2 className="font-display text-2xl font-bold text-white">{foodTruck.business_name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm" style={{ color: '#999' }}>{foodTruck.cuisine_type}</span>
                {foodTruck.days && foodTruck.days.length > 0 && (
                  <>{foodTruck.days.map(d => (<span key={d} className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882' }}>{DAY_LABELS[d] || d}</span>))}</>
                )}
                {foodTruck.thursday_setup && <span className="text-xs" style={{ color: '#999' }}>Thursday setup</span>}
              </div>
            </div>

            {foodTruckInvoice && (() => {
              const inv = foodTruckInvoice
              const amountPaid = inv.amount_paid ?? 0
              const balance = inv.amount - amountPaid
              const hasPartial = amountPaid > 0 && amountPaid < inv.amount
              const isPayable = inv.status === 'pending' || inv.status === 'overdue'
              return (
                <Card>
                  <SectionLabel>Invoice</SectionLabel>
                  <div className="rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                    <div className="flex justify-between text-sm"><span style={{ color: '#999' }}>Invoice total</span><span className="font-medium text-white">{formatCurrency(inv.amount)}</span></div>
                    {amountPaid > 0 && <div className="mt-2 flex justify-between text-sm"><span style={{ color: '#999' }}>Paid so far</span><span className="font-medium" style={{ color: '#4ade80' }}>-{formatCurrency(amountPaid)}</span></div>}
                    <div className="mt-2 flex justify-between border-t pt-2 text-sm" style={{ borderColor: '#2a2a2a' }}>
                      <span className="font-semibold" style={{ color: inv.status === 'paid' ? '#4ade80' : '#C4A882' }}>{inv.status === 'paid' ? 'Paid in full' : 'Balance due'}</span>
                      <span className="font-bold" style={{ color: inv.status === 'paid' ? '#4ade80' : '#C4A882' }}>{inv.status === 'paid' ? formatCurrency(0) : formatCurrency(balance)}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${INVOICE_STATUS_STYLE[inv.status]?.color ?? '#999'}20`, color: INVOICE_STATUS_STYLE[inv.status]?.color ?? '#999' }}>{INVOICE_STATUS_STYLE[inv.status]?.label}</span>
                    {hasPartial && inv.status !== 'paid' && <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>Deposit received</span>}
                    {inv.paid_at && <span className="text-xs" style={{ color: '#555' }}>{new Date(inv.paid_at).toLocaleDateString()}</span>}
                    {inv.due_date && inv.status !== 'paid' && <span className="text-xs" style={{ color: '#555' }}>Due {new Date(inv.due_date).toLocaleDateString()}</span>}
                  </div>
                  {isPayable && (
                    <div className="mt-5">
                      <Link
                        href={`/portal/pay?invoice=${foodTruckInvoice!.id}`}
                        className="block w-full rounded-xl py-3 text-center text-sm font-bold tracking-wide text-white transition-opacity"
                        style={{ backgroundColor: '#8B7355' }}
                      >
                        Pay Now
                      </Link>
                    </div>
                  )}
                  {inv.status === 'paid' && (
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-xl py-3" style={{ backgroundColor: 'rgba(74,222,128,0.1)' }}>
                      <span style={{ color: '#4ade80' }}>✓</span>
                      <span className="text-sm font-semibold" style={{ color: '#4ade80' }}>Payment confirmed - you&apos;re all set!</span>
                    </div>
                  )}
                </Card>
              )
            })()}

            <Card>
              <SectionLabel>Vendor Profile</SectionLabel>
              {!editingFoodTruck ? (
                <div className="space-y-4">
                  {foodTruck.logo_url && (
                    <img src={supabase.storage.from('food-truck-logos').getPublicUrl(foodTruck.logo_url).data.publicUrl} alt={foodTruck.business_name} className="h-20 w-20 rounded-lg object-contain" style={{ border: '1px solid #2a2a2a', backgroundColor: '#111' }} />
                  )}
                  <dl className="space-y-2">
                    {[
                      { label: 'Business', value: foodTruck.business_name },
                      { label: 'Cuisine', value: foodTruck.cuisine_type },
                      { label: 'Description', value: foodTruck.description },
                    ].filter(r => r.value).map(r => (
                      <div key={r.label} className="flex gap-4 text-sm">
                        <dt className="w-28 shrink-0 font-medium" style={{ color: '#666' }}>{r.label}</dt>
                        <dd className="text-white">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {(foodTruck.website || foodTruck.instagram || foodTruck.facebook) && (
                    <div className="flex flex-wrap gap-3">
                      {foodTruck.website && <a href={foodTruck.website} target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80" style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>Website</a>}
                      {foodTruck.instagram && <a href={foodTruck.instagram.startsWith('http') ? foodTruck.instagram : `https://instagram.com/${foodTruck.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80" style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>Instagram</a>}
                      {foodTruck.facebook && <a href={foodTruck.facebook.startsWith('http') ? foodTruck.facebook : `https://facebook.com/${foodTruck.facebook}`} target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80" style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>Facebook</a>}
                    </div>
                  )}
                  <button onClick={() => setEditingFoodTruck(true)} className="rounded-lg px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-80" style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>Edit Profile</button>
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { key: 'business_name', label: 'Business Name', type: 'text', placeholder: 'Business name' },
                    { key: 'cuisine_type', label: 'Cuisine Type', type: 'text', placeholder: 'e.g. Mexican, BBQ, Asian Fusion' },
                    { key: 'website', label: 'Website', type: 'url', placeholder: 'https://yoursite.com' },
                    { key: 'instagram', label: 'Instagram', type: 'text', placeholder: '@handle' },
                    { key: 'facebook', label: 'Facebook', type: 'text', placeholder: 'Facebook page URL or name' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>{f.label}</label>
                      <input type={f.type} value={foodTruckForm[f.key as keyof typeof foodTruckForm]} onChange={e => setFoodTruckForm(fm => ({ ...fm, [f.key]: e.target.value }))} placeholder={f.placeholder} className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }} onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')} onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')} />
                    </div>
                  ))}
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Description</label>
                    <textarea value={foodTruckForm.description} onChange={e => setFoodTruckForm(f => ({ ...f, description: e.target.value }))} placeholder="Tell attendees about your food" rows={3} className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none resize-none" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }} onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')} onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Logo</label>
                    <div className="flex items-center gap-4">
                      {foodTruck.logo_url && !foodTruckLogoFile && <img src={supabase.storage.from('food-truck-logos').getPublicUrl(foodTruck.logo_url).data.publicUrl} alt="Current logo" className="h-16 w-16 rounded-lg object-contain" style={{ border: '1px solid #2a2a2a', backgroundColor: '#111' }} />}
                      <div>
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" id="food-truck-logo-upload" className="hidden" onChange={e => { if (e.target.files?.[0]) setFoodTruckLogoFile(e.target.files[0]); e.target.value = '' }} />
                        <label htmlFor="food-truck-logo-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>
                          {foodTruckLogoFile ? `✓ ${foodTruckLogoFile.name}` : foodTruck.logo_url ? 'Replace Logo' : 'Upload Logo'}
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={handleSaveFoodTruck} disabled={savingFoodTruck} className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50" style={{ backgroundColor: '#8B7355' }}>{savingFoodTruck ? 'Saving…' : 'Save'}</button>
                    <button onClick={() => { setEditingFoodTruck(false); setFoodTruckLogoFile(null); setFoodTruckForm({ business_name: foodTruck.business_name, cuisine_type: foodTruck.cuisine_type, description: foodTruck.description, website: foodTruck.website || '', instagram: foodTruck.instagram || '', facebook: foodTruck.facebook || '' }) }} className="text-sm" style={{ color: '#555' }}>Cancel</button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Suspense wrapper - required because useSearchParams() is used above ────────

export default function PortalPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    }>
      <PortalContent />
    </Suspense>
  )
}
