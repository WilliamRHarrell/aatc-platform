'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PublicNav from '@/components/PublicNav'
import { formatCurrency } from '@/lib/utils'

interface Panel {
  id: string
  title: string
  description: string
  panel_date: string
  panel_time: string
  location: string
  panelists: string
  is_free: boolean
  cost: number
  signup_type: 'none' | 'aatc_invoice' | 'email_host' | 'free_registration'
  host_email: string | null
  max_capacity: number | null
  image_url: string | null
}

interface RegistrationForm {
  name: string
  email: string
  phone: string
  socialMedia: string
  attendeeType: 'artist' | 'vendor' | 'patron'
}

export default function TattooPanelsPage() {
  const searchParams = useSearchParams()
  const [panels, setPanels] = useState<Panel[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPanel, setSelectedPanel] = useState<Panel | null>(null)
  const [form, setForm] = useState<RegistrationForm>({
    name: '',
    email: '',
    phone: '',
    socialMedia: '',
    attendeeType: 'patron',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPanels() {
      const supabase = createClient()

      const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .single()

      if (!event) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('panels')
        .select('*')
        .eq('event_id', event.id)
        .eq('is_published', true)
        .order('panel_date')

      if (data) {
        const fetched = data as Panel[]
        setPanels(fetched)

        // Auto-open registration if ?register=<panelId> is in URL
        const registerId = searchParams.get('register')
        if (registerId) {
          const target = fetched.find(p => p.id === registerId)
          if (target && target.signup_type !== 'none') {
            openModal(target)
          }
        }
      }

      setLoading(false)
    }

    fetchPanels()
  }, [searchParams])

  const openModal = (panel: Panel) => {
    setSelectedPanel(panel)
    setForm({ name: '', email: '', phone: '', socialMedia: '', attendeeType: 'patron' })
    setSubmitMessage(null)
  }

  const closeModal = () => {
    setSelectedPanel(null)
    setSubmitMessage(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPanel) return

    setSubmitting(true)
    setSubmitMessage(null)

    try {
      const res = await fetch('/api/panel-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          panelId: selectedPanel.id,
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          socialMedia: form.socialMedia || null,
          attendeeType: form.attendeeType,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setSubmitMessage(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }

      if (data.url) {
        window.location.href = data.url
        return
      }

      setSubmitMessage('You are registered! We look forward to seeing you.')
      setSubmitting(false)
    } catch {
      setSubmitMessage('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  const formatPanelDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Learn from the Best</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Tattoo Panels</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Attend expert-led panel discussions throughout the weekend. Hear from industry leaders, renowned artists, and veterans on topics ranging from technique and business to the culture and history of tattooing.</span>
        </p>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-12">
        {loading ? (
          <div className="flex justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }}
            />
          </div>
        ) : panels.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-lg font-semibold text-white"><span className="text-emboss">Panel schedule coming soon</span></p>
            <p className="mt-2 text-sm" style={{ color: '#999' }}>
              <span className="text-emboss">Check back for announcements on upcoming panel discussions.</span>
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {(() => {
              const grouped = panels.reduce<Record<string, Panel[]>>((acc, panel) => {
                const day = panel.panel_date || 'TBD'
                if (!acc[day]) acc[day] = []
                acc[day].push(panel)
                return acc
              }, {})

              return Object.entries(grouped).map(([day, dayPanels]) => (
                <div key={day}>
                  <h2
                    className="mb-4 border-b pb-3 text-sm font-bold uppercase tracking-[0.2em]"
                    style={{ color: '#C4A882', borderColor: '#2a2a2a' }}
                  >
                    <span className="text-emboss">{day}</span>
                  </h2>
                  <div className="space-y-4">
                    {dayPanels.map(panel => (
                      <div
                        key={panel.id}
                        className="flex flex-col gap-6 rounded-2xl p-6 sm:flex-row"
                        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                      >
                        {/* Left: Panel info */}
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-bold text-white">{panel.title}</h3>

                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <span className="text-xs" style={{ color: '#999' }}>
                              {panel.panel_time}
                            </span>
                            <span className="text-xs" style={{ color: '#666' }}>
                              {panel.location}
                            </span>
                          </div>

                          <p className="mt-3 text-sm leading-relaxed" style={{ color: '#999' }}>
                            {panel.description}
                          </p>

                          {panel.panelists && (
                            <div className="mt-4">
                              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#666' }}>
                                Panelists
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {panel.panelists.split(',').map(name => (
                                  <span
                                    key={name.trim()}
                                    className="rounded-full px-3 py-1 text-xs"
                                    style={{ backgroundColor: '#2a2a2a', color: '#ccc' }}
                                  >
                                    {name.trim()}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Pricing badge */}
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            {panel.is_free ? (
                              <span
                                className="rounded-full px-3 py-1 text-xs font-bold"
                                style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}
                              >
                                Free to the Public
                              </span>
                            ) : (
                              <span
                                className="rounded-full px-3 py-1 text-xs font-bold"
                                style={{ backgroundColor: 'rgba(139, 115, 85, 0.2)', color: '#C4A882' }}
                              >
                                {formatCurrency(panel.cost)}
                              </span>
                            )}

                            {/* Signup section */}
                            {panel.signup_type === 'email_host' && panel.host_email && (
                              <a
                                href={`mailto:${panel.host_email}?subject=Panel Registration: ${encodeURIComponent(panel.title)}`}
                                className="rounded-lg px-4 py-1.5 text-xs font-bold transition-opacity hover:opacity-80"
                                style={{ backgroundColor: '#8B7355', color: '#fff' }}
                              >
                                Contact host to register
                              </a>
                            )}

                            {panel.signup_type === 'free_registration' && (
                              <button
                                onClick={() => openModal(panel)}
                                className="rounded-lg px-4 py-1.5 text-xs font-bold transition-opacity hover:opacity-80"
                                style={{ backgroundColor: '#8B7355', color: '#fff' }}
                              >
                                Register
                              </button>
                            )}

                            {panel.signup_type === 'aatc_invoice' && (
                              <button
                                onClick={() => openModal(panel)}
                                className="rounded-lg px-4 py-1.5 text-xs font-bold transition-opacity hover:opacity-80"
                                style={{ backgroundColor: '#8B7355', color: '#fff' }}
                              >
                                Register & Pay {formatCurrency(panel.cost)}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Right: Polaroid-style image */}
                        <div className="flex shrink-0 items-start justify-center sm:justify-end">
                          <div
                            className="rounded-sm p-2 pb-8 shadow-lg"
                            style={{
                              backgroundColor: '#f5f2ed',
                              transform: 'rotate(2deg)',
                              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                            }}
                          >
                            {panel.image_url ? (
                              <img
                                src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/panel-images/${panel.image_url}`}
                                alt={panel.title}
                                className="block h-36 w-36 object-cover sm:h-40 sm:w-40"
                                style={{ backgroundColor: '#ddd' }}
                              />
                            ) : (
                              <div
                                className="flex h-36 w-36 items-center justify-center sm:h-40 sm:w-40"
                                style={{ backgroundColor: '#e8e4de' }}
                              >
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                  <circle cx="8.5" cy="8.5" r="1.5" />
                                  <polyline points="21 15 16 10 5 21" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            })()}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Questions? Contact us at{' '}
          <a href="mailto:info@armoredarmadillotattooconvention.com" style={{ color: '#C4A882' }}>
            info@armoredarmadillotattooconvention.com
          </a></span>
        </p>
      </div>

      {/* Registration Modal */}
      {selectedPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#8B7355' }}>
                  Panel Registration
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">{selectedPanel.title}</h3>
              </div>
              <button
                onClick={closeModal}
                className="text-lg text-white hover:opacity-70"
                aria-label="Close"
              >
                X
              </button>
            </div>

            {submitMessage ? (
              <div className="py-8 text-center">
                <p className="text-sm text-white">{submitMessage}</p>
                <button
                  onClick={closeModal}
                  className="mt-4 rounded-lg px-6 py-2 text-sm font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: '#8B7355', color: '#fff' }}
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                    style={{ backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                    style={{ backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>
                    Phone
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                    style={{ backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>
                    Social Media Handle
                  </label>
                  <input
                    type="text"
                    value={form.socialMedia}
                    onChange={e => setForm({ ...form, socialMedia: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                    style={{ backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>
                    Attendee Type
                  </label>
                  <div className="flex gap-2">
                    {(['artist', 'vendor', 'patron'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm({ ...form, attendeeType: type })}
                        className="flex-1 rounded-lg px-3 py-2 text-xs font-bold capitalize transition-colors"
                        style={{
                          backgroundColor: form.attendeeType === type ? '#8B7355' : '#2a2a2a',
                          color: form.attendeeType === type ? '#fff' : '#999',
                          border: '1px solid',
                          borderColor: form.attendeeType === type ? '#8B7355' : '#3a3a3a',
                        }}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedPanel.signup_type === 'aatc_invoice' && (
                  <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(139, 115, 85, 0.15)' }}>
                    <p className="text-xs" style={{ color: '#C4A882' }}>
                      Cost: {formatCurrency(selectedPanel.cost)} -- You will be redirected to complete payment after registering.
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg py-2.5 text-sm font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: '#8B7355', color: '#fff' }}
                >
                  {submitting
                    ? 'Processing...'
                    : selectedPanel.signup_type === 'aatc_invoice'
                      ? `Register & Pay -- ${formatCurrency(selectedPanel.cost)}`
                      : 'Register'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
