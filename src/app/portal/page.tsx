'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

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
  business_name: string
  contact_name: string
  email: string
  exhibitor_type: 'artist' | 'vendor'
  booth_size: string
  artist_count: number
  is_corner: boolean
  is_veteran: boolean
  total_amount: number
  status: 'pending' | 'approved' | 'rejected' | 'waitlisted'
  artists: PortalArtist[] | null
  artists_ids_later: boolean
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

export default function PortalPage() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const justPaid = searchParams.get('paid') === '1'

  const [loading, setLoading] = useState(true)
  const [application, setApplication] = useState<Application | null>(null)
  const [booths, setBooths] = useState<Booth[]>([])
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [payFull, setPayFull] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [editingArtistIdx, setEditingArtistIdx] = useState<number | null>(null)
  const [artistDraft, setArtistDraft] = useState<ArtistDraft | null>(null)
  const [savingArtist, setSavingArtist] = useState(false)
  const [sponsorship, setSponsorship] = useState<Sponsorship | null>(null)
  const [sponsorProfile, setSponsorProfile] = useState({ website: '', instagram: '', facebook: '' })
  const [savingSponsorProfile, setSavingSponsorProfile] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login?redirect=/portal'); return }
      setUserEmail(user.email ?? null)

      // Get this user's most recent application for the active event
      const { data: app } = await supabase
        .from('applications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // Check if user is a sponsor
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
        // Fetch sponsor invoice
        const { data: sponInvoice } = await supabase
          .from('invoices')
          .select('id, amount, amount_paid, status, due_date, paid_at')
          .eq('sponsorship_id', sponData.id)
          .single()
        if (sponInvoice) setInvoice(sponInvoice as Invoice)
      }

      if (!app && !sponData) {
        // Try to link sponsor by email
        const { data: emailMatch } = await supabase
          .from('sponsorships')
          .select('id')
          .eq('email', user.email!)
          .eq('status', 'confirmed')
          .is('user_id', null)
          .single()

        if (emailMatch) {
          // Link this user to the sponsorship
          await supabase
            .from('sponsorships')
            .update({ user_id: user.id })
            .eq('id', emailMatch.id)

          // Reload to pick up the sponsorship
          window.location.reload()
          return
        }
      }

      if (!app) { setLoading(false); return }
      setApplication(app as unknown as Application)

      // Fetch booth assignment and invoice in parallel
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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/apply')
  }

  const handlePay = async () => {
    if (!invoice) return

    const balance = invoice.amount - (invoice.amount_paid ?? 0)
    let payAmountCents: number

    if (payFull) {
      payAmountCents = balance
    } else {
      const dollars = parseFloat(customAmount)
      if (isNaN(dollars) || dollars <= 0) {
        toast.error('Enter a valid payment amount')
        return
      }
      payAmountCents = Math.round(dollars * 100)
      if (payAmountCents < 25000) {
        toast.error('Minimum payment is $250')
        return
      }
      if (payAmountCents > balance) {
        toast.error(`Payment cannot exceed the balance of ${formatCurrency(balance)}`)
        return
      }
    }

    setPaying(true)
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, amount: payAmountCents }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error ?? 'Could not start checkout')
        setPaying(false)
      }
    } catch {
      toast.error('Could not start checkout')
      setPaying(false)
    }
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

    // Upload new portfolio images
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

    const { error } = await supabase
      .from('applications')
      .update({ artists: updatedArtists })
      .eq('id', application.id)

    if (error) {
      toast.error('Failed to save artist info')
    } else {
      setApplication(prev => prev ? { ...prev, artists: updatedArtists } : prev)
      setEditingArtistIdx(null)
      setArtistDraft(null)
      toast.success('Artist info saved')
    }
    setSavingArtist(false)
  }

  const uploadSponsorLogo = async (file: File) => {
    if (!sponsorship) return
    const ext = file.name.split('.').pop()
    const path = `sponsors/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage.from('exhibitor-media').upload(path, file)
    if (error || !data) { toast.error('Failed to upload logo'); return }
    const { data: urlData } = supabase.storage.from('exhibitor-media').getPublicUrl(data.path)
    await supabase.from('sponsorships').update({ logo_url: urlData.publicUrl }).eq('id', sponsorship.id)
    setSponsorship(prev => prev ? { ...prev, logo_url: urlData.publicUrl } : null)
    toast.success('Logo updated')
  }

  const saveSponsorProfileFn = async () => {
    if (!sponsorship) return
    setSavingSponsorProfile(true)
    const { error } = await supabase
      .from('sponsorships')
      .update({
        website: sponsorProfile.website || null,
        instagram: sponsorProfile.instagram || null,
        facebook: sponsorProfile.facebook || null,
      })
      .eq('id', sponsorship.id)
    if (error) {
      toast.error('Failed to save profile')
    } else {
      setSponsorship(prev => prev ? { ...prev, ...sponsorProfile } : null)
      toast.success('Profile saved')
    }
    setSavingSponsorProfile(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-10" style={{ backgroundColor: '#0a0a0a' }}>
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
            Back
          </Link>
          <div className="flex items-center gap-4">
            {userEmail && <p className="hidden text-xs sm:block" style={{ color: '#555' }}>{userEmail}</p>}
            <button
              onClick={handleSignOut}
              className="text-sm transition-colors"
              style={{ color: '#666' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#666')}
            >
              Sign out
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
              Payment received — thank you!
            </p>
            <p className="mt-0.5 text-xs" style={{ color: '#999' }}>
              A receipt has been sent to your email by Stripe. Check your balance below.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <p className="mb-1 text-sm font-medium uppercase tracking-widest" style={{ color: '#8B7355' }}>
            {sponsorship && !application ? 'My Sponsorship' : 'My Application'}
          </p>
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
            {application ? application.business_name : sponsorship ? sponsorship.sponsor_name : 'Applicant Portal'}
          </h1>
          {application && (
            <p className="mt-1 text-sm capitalize" style={{ color: '#999' }}>
              {application.exhibitor_type} · {application.booth_size} booth ·{' '}
              Submitted {new Date(application.created_at).toLocaleDateString()}
            </p>
          )}
          {sponsorship && !application && (
            <p className="mt-1 text-sm" style={{ color: '#999' }}>
              <span
                className="mr-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
                style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882' }}
              >
                {sponsorship.tier}
              </span>
              Sponsor
            </p>
          )}
        </div>

        {/* No application and no sponsorship */}
        {!application && !sponsorship && (
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

            {/* Booth assignment — show when approved */}
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
                      {application.booth_size} booth · {booths.length} slot{booths.length !== 1 ? 's' : ''}
                      {booths.some(b => b.is_corner) ? ' · Corner' : ''}
                    </p>
                    {application.is_veteran && (
                      <p className="mt-0.5 text-xs" style={{ color: '#4ade80' }}>Veteran discount applied</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: '#666' }}>
                    Your booth is being assigned — check back soon.
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

                  {/* Summary breakdown */}
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

                  {/* Status line */}
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

                  {/* Payment form */}
                  {isPayable && (
                    <div className="mt-5 space-y-4">
                      <div className="rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                        {/* Pay in full checkbox */}
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={payFull}
                            onChange={e => { setPayFull(e.target.checked); if (e.target.checked) setCustomAmount('') }}
                            className="h-4 w-4 rounded accent-[#8B7355]"
                          />
                          <span className="text-sm font-medium text-white">
                            Pay full balance — {formatCurrency(balance)}
                          </span>
                        </label>

                        {/* Custom amount */}
                        {!payFull && (
                          <div className="mt-4">
                            <label className="mb-1.5 block text-sm font-medium text-white">
                              Or enter a payment amount
                            </label>
                            <p className="mb-2 text-xs" style={{ color: '#999' }}>
                              Minimum payment: $250 deposit to hold your booth
                            </p>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-white">$</span>
                              <input
                                type="number"
                                min="250"
                                step="0.01"
                                max={(balance / 100).toFixed(2)}
                                value={customAmount}
                                onChange={e => setCustomAmount(e.target.value)}
                                placeholder="250.00"
                                className="w-full rounded-lg py-3 pl-8 pr-4 text-sm text-white outline-none transition-colors"
                                style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                                onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                                onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={handlePay}
                        disabled={paying || (!payFull && !customAmount)}
                        className="w-full rounded-xl py-3 text-sm font-bold tracking-wide text-white transition-opacity disabled:opacity-60"
                        style={{ backgroundColor: '#8B7355' }}
                      >
                        {paying
                          ? 'Redirecting to Stripe...'
                          : payFull
                            ? `Pay ${formatCurrency(balance)} Now`
                            : customAmount
                              ? `Pay ${formatCurrency(Math.round(parseFloat(customAmount) * 100) || 0)} Now`
                              : 'Enter Amount to Pay'
                        }
                      </button>
                    </div>
                  )}

                  {invoice.status === 'paid' && (
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-xl py-3" style={{ backgroundColor: 'rgba(74,222,128,0.1)' }}>
                      <span style={{ color: '#4ade80' }}>✓</span>
                      <span className="text-sm font-semibold" style={{ color: '#4ade80' }}>Booth confirmed — you&apos;re all set!</span>
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
                        {/* Row header */}
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

                        {/* Edit form */}
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
                                Government-issued ID {a.id_url ? <span style={{ color: '#4ade80' }}>(on file — upload to replace)</span> : '(optional)'}
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

                            {/* Portfolio images */}
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
                  { label: 'Booth size', value: `${application.booth_size} (10×10 ft)` },
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

          </div>
        )}
        {/* Sponsor portal */}
        {sponsorship && (
          <div className="space-y-4">

            {/* Sponsor status card */}
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

            {/* Sponsor invoice & payment */}
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
                    <div className="mt-5 space-y-4">
                      <div className="rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={payFull}
                            onChange={e => { setPayFull(e.target.checked); if (e.target.checked) setCustomAmount('') }}
                            className="h-4 w-4 rounded accent-[#8B7355]"
                          />
                          <span className="text-sm font-medium text-white">
                            Pay full balance — {formatCurrency(balance)}
                          </span>
                        </label>

                        {!payFull && (
                          <div className="mt-4">
                            <label className="mb-1.5 block text-sm font-medium text-white">
                              Or enter a payment amount
                            </label>
                            <p className="mb-2 text-xs" style={{ color: '#999' }}>
                              Minimum payment: $250
                            </p>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-white">$</span>
                              <input
                                type="number"
                                min="250"
                                step="0.01"
                                max={(balance / 100).toFixed(2)}
                                value={customAmount}
                                onChange={e => setCustomAmount(e.target.value)}
                                placeholder="250.00"
                                className="w-full rounded-lg py-3 pl-8 pr-4 text-sm text-white outline-none transition-colors"
                                style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                                onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                                onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={handlePay}
                        disabled={paying || (!payFull && !customAmount)}
                        className="w-full rounded-xl py-3 text-sm font-bold tracking-wide text-white transition-opacity disabled:opacity-60"
                        style={{ backgroundColor: '#8B7355' }}
                      >
                        {paying
                          ? 'Redirecting to Stripe...'
                          : payFull
                            ? `Pay ${formatCurrency(balance)} Now`
                            : customAmount
                              ? `Pay ${formatCurrency(Math.round(parseFloat(customAmount) * 100) || 0)} Now`
                              : 'Enter Amount to Pay'
                        }
                      </button>
                    </div>
                  )}

                  {invoice.status === 'paid' && (
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-xl py-3" style={{ backgroundColor: 'rgba(74,222,128,0.1)' }}>
                      <span style={{ color: '#4ade80' }}>✓</span>
                      <span className="text-sm font-semibold" style={{ color: '#4ade80' }}>Sponsorship paid — thank you!</span>
                    </div>
                  )}
                </Card>
              )
            })()}

            {/* Sponsor profile */}
            <Card>
              <SectionLabel>Sponsor Profile</SectionLabel>
              <div className="space-y-4">
                {/* Logo */}
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Logo</label>
                  <div className="flex items-center gap-4">
                    {sponsorship.logo_url && (
                      <img
                        src={sponsorship.logo_url}
                        alt="Sponsor logo"
                        className="h-16 w-16 rounded-lg object-contain"
                        style={{ border: '1px solid #2a2a2a', backgroundColor: '#111' }}
                      />
                    )}
                    <div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/svg+xml"
                        id="sponsor-logo-upload"
                        className="hidden"
                        onChange={e => { if (e.target.files?.[0]) uploadSponsorLogo(e.target.files[0]); e.target.value = '' }}
                      />
                      <label
                        htmlFor="sponsor-logo-upload"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                        style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                      >
                        {sponsorship.logo_url ? 'Replace Logo' : 'Upload Logo'}
                      </label>
                    </div>
                  </div>
                </div>

                {/* Website */}
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Website</label>
                  <input
                    type="url"
                    value={sponsorProfile.website}
                    onChange={e => setSponsorProfile(p => ({ ...p, website: e.target.value }))}
                    placeholder="https://yoursite.com"
                    className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                    style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                    onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                  />
                </div>

                {/* Instagram */}
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Instagram</label>
                  <input
                    type="text"
                    value={sponsorProfile.instagram}
                    onChange={e => setSponsorProfile(p => ({ ...p, instagram: e.target.value }))}
                    placeholder="@handle"
                    className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                    style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                    onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                  />
                </div>

                {/* Facebook */}
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Facebook</label>
                  <input
                    type="text"
                    value={sponsorProfile.facebook}
                    onChange={e => setSponsorProfile(p => ({ ...p, facebook: e.target.value }))}
                    placeholder="Facebook page URL or name"
                    className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                    style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                    onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                  />
                </div>

                <button
                  onClick={saveSponsorProfileFn}
                  disabled={savingSponsorProfile}
                  className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: '#8B7355' }}
                >
                  {savingSponsorProfile ? 'Saving…' : 'Save Profile'}
                </button>
              </div>
            </Card>

            {/* Sponsorship details */}
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
      </div>
    </div>
  )
}
