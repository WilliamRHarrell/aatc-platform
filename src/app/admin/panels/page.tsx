'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { guardedWrite } from '@/lib/db-write'
import { dayLabel, timeLabel } from '@/lib/schedule-format'
import { toCsv, slugify, downloadCsv } from '@/lib/csv'
import toast from 'react-hot-toast'

interface Panel {
  id: string
  event_id: string
  title: string
  description: string | null
  panel_day: string | null
  panel_start: string | null
  location: string | null
  panelists: string | null
  is_free: boolean
  cost: number
  signup_type: 'none' | 'aatc_invoice' | 'email_host' | 'free_registration'
  host_email: string | null
  max_capacity: number | null
  is_published: boolean
  image_url: string | null
}

interface PanelRegistration {
  id: string
  panel_id: string
  name: string
  email: string
  phone: string | null
  social_media: string | null
  attendee_type: 'artist' | 'vendor' | 'patron'
  payment_status: string
  stripe_payment_intent_id: string | null
  created_at: string
}

interface PanelFormState {
  title: string
  description: string
  panel_day: string
  panel_start: string
  location: string
  booth_number: string
  panelists: string
  is_free: boolean
  cost: string
  signup_type: 'none' | 'aatc_invoice' | 'email_host' | 'free_registration'
  host_email: string
  max_capacity: string
  is_published: boolean
}

const EMPTY_FORM: PanelFormState = {
  title: '',
  description: '',
  panel_day: '',
  panel_start: '',
  location: '',
  booth_number: '',
  panelists: '',
  is_free: false,
  cost: '',
  signup_type: 'none',
  host_email: '',
  max_capacity: '',
  is_published: false,
}

const LOCATIONS = ['Front Room', 'Ballroom', 'Main Stage', 'Booth']

const SIGNUP_TYPE_LABELS: Record<string, string> = {
  none: 'No Signup',
  aatc_invoice: 'AATC Invoice',
  email_host: 'Email Host',
  free_registration: 'Free Registration',
}

const inputBase = 'w-full rounded-lg px-3 py-2 text-sm outline-none'
const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff' }
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-widest'

export default function AdminPanelsPage() {
  const supabase = createClient()
  const [panels, setPanels] = useState<Panel[]>([])
  const [registrationCounts, setRegistrationCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [eventId, setEventId] = useState<string | null>(null)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingPanel, setEditingPanel] = useState<Panel | null>(null)
  const [form, setForm] = useState<PanelFormState>(EMPTY_FORM)
  const [working, setWorking] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)

  // Registrations drawer
  const [viewingRegistrations, setViewingRegistrations] = useState<Panel | null>(null)
  const [registrations, setRegistrations] = useState<PanelRegistration[]>([])
  const [loadingRegistrations, setLoadingRegistrations] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('is_active', true)
      .single()

    if (!event) {
      setLoading(false)
      return
    }

    setEventId(event.id)

    const { data: panelsData } = await supabase
      .from('panels')
      .select('*')
      .eq('event_id', event.id)
      .order('panel_day', { ascending: true })

    const loadedPanels = (panelsData as unknown as Panel[]) ?? []
    setPanels(loadedPanels)

    // Fetch registration counts
    if (loadedPanels.length > 0) {
      const panelIds = loadedPanels.map(p => p.id)
      const { data: regData } = await supabase
        .from('panel_registrations')
        .select('panel_id')
        .in('panel_id', panelIds)

      const counts: Record<string, number> = {}
      regData?.forEach((r: { panel_id: string }) => {
        counts[r.panel_id] = (counts[r.panel_id] || 0) + 1
      })
      setRegistrationCounts(counts)
    }

    setLoading(false)
  }

  const openAddModal = () => {
    setForm(EMPTY_FORM)
    setEditingPanel(null)
    setShowModal(true)
  }

  const parseLocation = (loc: string | null): { location: string; booth_number: string } => {
    if (!loc) return { location: '', booth_number: '' }
    const boothMatch = loc.match(/^Booth #(.+)$/)
    if (boothMatch) return { location: 'Booth', booth_number: boothMatch[1] }
    if (LOCATIONS.includes(loc)) return { location: loc, booth_number: '' }
    return { location: loc, booth_number: '' }
  }

  const openEditModal = (panel: Panel) => {
    const { location, booth_number } = parseLocation(panel.location ?? null)
    setForm({
      title: panel.title,
      description: panel.description ?? '',
      panel_day: panel.panel_day ?? '',
      panel_start: (panel.panel_start ?? '').slice(0, 5),
      location,
      booth_number,
      panelists: panel.panelists ?? '',
      is_free: panel.is_free,
      cost: panel.is_free ? '' : (panel.cost / 100).toFixed(2),
      signup_type: panel.signup_type,
      host_email: panel.host_email ?? '',
      max_capacity: panel.max_capacity ? String(panel.max_capacity) : '',
      is_published: panel.is_published,
    })
    setEditingPanel(panel)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingPanel(null)
    setForm(EMPTY_FORM)
    setImageFile(null)
  }

  const savePanel = async () => {
    if (!form.title.trim() || !eventId) return
    setWorking(true)

    const costCents = form.is_free ? 0 : Math.round(parseFloat(form.cost || '0') * 100)

    const locationValue = form.location === 'Booth' && form.booth_number.trim()
      ? `Booth #${form.booth_number.trim()}`
      : form.location

    const payload = {
      event_id: eventId,
      title: form.title.trim(),
      description: form.description.trim(),
      panel_day: form.panel_day || null,
      panel_start: form.panel_start || null,
      location: locationValue,
      panelists: form.panelists.trim(),
      is_free: form.is_free,
      cost: costCents,
      signup_type: form.signup_type,
      host_email: form.signup_type === 'email_host' ? (form.host_email.trim() || null) : null,
      max_capacity: form.max_capacity ? parseInt(form.max_capacity, 10) : null,
      is_published: form.is_published,
    }

    if (editingPanel) {
      // Upload image if provided
      if (imageFile) {
        const ext = imageFile.name.split('.').pop()
        const path = `${editingPanel.id}/image.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('panel-images')
          .upload(path, imageFile, { upsert: true })
        if (uploadError) {
          toast.error('Failed to upload image')
          setWorking(false)
          return
        }
        ;(payload as Record<string, unknown>).image_url = path
      }

      // Guarded: every panels policy is `is_admin()`, so a content_editor's
      // update is filtered to zero rows and returns error: null. Unguarded,
      // this toasted "Panel updated" and changed nothing.
      const res = await guardedWrite(
        supabase.from('panels').update(payload).eq('id', editingPanel.id).select('id'),
        'Could not update the panel',
        'admin/panels update',
      )

      if (res.ok) {
        setPanels(prev =>
          prev.map(p => (p.id === editingPanel.id ? { ...p, ...payload } as Panel : p))
        )
        toast.success('Panel updated')
        closeModal()
      } else {
        toast.error(res.error!)
      }
    } else {
      const res = await guardedWrite(
        supabase.from('panels').insert(payload).select('*'),
        'Could not add the panel',
        'admin/panels insert',
      )

      if (res.ok) {
        const newPanel = res.data[0] as unknown as Panel

        // Upload image if provided
        if (imageFile) {
          const ext = imageFile.name.split('.').pop()
          const path = `${newPanel.id}/image.${ext}`
          const { error: uploadError } = await supabase.storage
            .from('panel-images')
            .upload(path, imageFile)
          if (!uploadError) {
            // Guarded separately: the row exists (the insert above succeeded),
            // so a zero-row result here means the image landed in storage and
            // the panel still points at nothing - worth a real error, not a
            // silent mismatch between bucket and table.
            const imgRes = await guardedWrite(
              supabase.from('panels').update({ image_url: path }).eq('id', newPanel.id).select('id'),
              'Panel added, but its image could not be attached',
              'admin/panels image_url update',
            )
            if (imgRes.ok) {
              newPanel.image_url = path
            } else {
              toast.error(imgRes.error!)
            }
          }
        }

        setPanels(prev => [...prev, newPanel])
        toast.success('Panel added')
        closeModal()
      } else {
        toast.error(res.error!)
      }
    }

    setWorking(false)
  }

  const deletePanel = async (id: string) => {
    if (!window.confirm('Delete this panel and all its registrations?')) return
    setDeleting(id)

    // A filtered DELETE is the worst of the three: it returns error: null,
    // toasts "Panel deleted", removes the row from local state - and the panel
    // is still live on the public schedule after a refresh.
    const res = await guardedWrite(
      supabase.from('panels').delete().eq('id', id).select('id'),
      'Could not delete the panel',
      'admin/panels delete',
    )
    if (res.ok) {
      setPanels(prev => prev.filter(p => p.id !== id))
      const newCounts = { ...registrationCounts }
      delete newCounts[id]
      setRegistrationCounts(newCounts)
      toast.success('Panel deleted')
    } else {
      toast.error(res.error!)
    }
    setDeleting(null)
  }

  const openRegistrations = async (panel: Panel) => {
    setViewingRegistrations(panel)
    setLoadingRegistrations(true)

    const { data } = await supabase
      .from('panel_registrations')
      .select('*')
      .eq('panel_id', panel.id)
      .order('created_at', { ascending: false })

    setRegistrations((data as unknown as PanelRegistration[]) ?? [])
    setLoadingRegistrations(false)
  }

  /**
   * Attendance list as CSV. Built for a printed/offline workflow at the desk -
   * the roster is only useful if it leaves the browser.
   *
   * Ordered by registration time (as loaded) rather than by name: the desk
   * works down a list, and "who signed up first" is the useful tiebreak when
   * the room is fuller than the roster. Columns match the on-screen table so
   * nobody has to reconcile two different views of the same list.
   */
  const exportRegistrations = (panel: Panel) => {
    if (registrations.length === 0) return

    const csv = toCsv(
      ['Name', 'Email', 'Phone', 'Social', 'Attendee type', 'Payment', 'Registered'],
      registrations.map(r => [
        r.name,
        r.email,
        r.phone ?? '',
        r.social_media ?? '',
        r.attendee_type,
        r.payment_status === 'na' ? 'Free' : r.payment_status,
        new Date(r.created_at).toLocaleString('en-US'),
      ]),
    )

    const day = panel.panel_day ? `-${panel.panel_day}` : ''
    downloadCsv(`${slugify(panel.title)}${day}-registrations.csv`, csv)
  }

  const closeRegistrations = () => {
    setViewingRegistrations(null)
    setRegistrations([])
  }

  const publishedCount = panels.filter(p => p.is_published).length

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div
          className="h-7 w-7 animate-spin rounded-full border-2"
          style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Panels</h1>
          <p className="mt-1 text-sm" style={{ color: '#999' }}>
            {panels.length} panel{panels.length !== 1 ? 's' : ''}
            {publishedCount > 0 ? ` -- ${publishedCount} published` : ''}
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity"
          style={{ backgroundColor: '#8B7355' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Panel
        </button>
      </div>

      {/* Panel List */}
      {panels.length === 0 ? (
        <div
          className="rounded-2xl px-5 py-16 text-center"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          <p className="mb-1 text-sm font-medium text-white">No panels yet</p>
          <p className="text-sm" style={{ color: '#555' }}>
            Click &ldquo;Add Panel&rdquo; to create your first panel or workshop.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {panels.map(panel => (
            <div
              key={panel.id}
              className="rounded-2xl p-4 sm:p-5"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                {/* Left: Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{panel.title}</p>

                    {/* Published badge */}
                    {panel.is_published ? (
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}
                      >
                        Published
                      </span>
                    ) : (
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ backgroundColor: 'rgba(102,102,102,0.15)', color: '#666', border: '1px solid rgba(102,102,102,0.3)' }}
                      >
                        Draft
                      </span>
                    )}

                    {/* Free / Cost badge */}
                    {panel.is_free ? (
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}
                      >
                        Free
                      </span>
                    ) : panel.cost > 0 ? (
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                      >
                        {formatCurrency(panel.cost)}
                      </span>
                    ) : null}

                    {/* Signup type badge */}
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                      style={{ backgroundColor: 'rgba(102,102,102,0.1)', color: '#999', border: '1px solid rgba(102,102,102,0.2)' }}
                    >
                      {SIGNUP_TYPE_LABELS[panel.signup_type]}
                    </span>
                  </div>

                  {/* Date / Time / Location */}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs" style={{ color: '#999' }}>
                    {panel.panel_day && (
                      <span>{dayLabel(panel.panel_day)}</span>
                    )}
                    {panel.panel_start && (
                      <span>{timeLabel(panel.panel_start)}</span>
                    )}
                    {panel.location && (
                      <span>{panel.location}</span>
                    )}
                  </div>

                  {/* Registrations against the room's planning target.
                      Deliberately NOT "42 / 50 max" - that reads as an enforced
                      gate, and nothing is gated. Registration stays open past
                      the target; the number is there so the room can be
                      changed or chairs added. */}
                  {(() => {
                    const count = registrationCounts[panel.id] ?? 0
                    const target = panel.max_capacity
                    const ratio = target ? count / target : 0
                    const over = !!target && count > target
                    const near = !!target && !over && ratio >= 0.8
                    const colour = over ? '#ef4444' : near ? '#facc15' : '#555'
                    return (
                      <p className="mt-1 text-xs" style={{ color: colour }}>
                        {count} registered
                        {target ? ` · room seats ${target}` : ''}
                        {over && ' · OVER TARGET - bigger room or more chairs'}
                        {near && ' · approaching the room’s size'}
                      </p>
                    )
                  })()}
                </div>

                {/* Right: Actions */}
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    onClick={() => openRegistrations(panel)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity"
                    style={{ backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}
                  >
                    View Registrations
                  </button>
                  <button
                    onClick={() => openEditModal(panel)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity"
                    style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deletePanel(panel.id)}
                    disabled={deleting === panel.id}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-40"
                    style={{ backgroundColor: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}
                  >
                    {deleting === panel.id ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Panel Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-10"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div
            className="w-full max-w-xl rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(139,115,85,0.4)' }}
          >
            <h2 className="mb-5 text-lg font-bold text-white">
              {editingPanel ? 'Edit Panel' : 'Add Panel'}
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Title */}
              <div className="sm:col-span-2">
                <label className={labelClass} style={{ color: '#8B7355' }}>Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Tattoo Business 101"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className={inputBase}
                  style={inputStyle}
                />
              </div>

              {/* Description */}
              <div className="sm:col-span-2">
                <label className={labelClass} style={{ color: '#8B7355' }}>Description</label>
                <textarea
                  placeholder="Optional description"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className={inputBase}
                  style={{ ...inputStyle, resize: 'vertical' as const }}
                />
              </div>

              {/* Date - a real date input since migration 046. Was a select of
                  three hardcoded display strings, which is what made panel_date
                  free text and let a seminar silently miss the schedule. */}
              <div>
                <label className={labelClass} style={{ color: '#8B7355' }}>Date *</label>
                <input
                  type="date"
                  value={form.panel_day}
                  onChange={e => setForm({ ...form, panel_day: e.target.value })}
                  className={inputBase}
                  style={inputStyle}
                />
              </div>

              {/* Time - a real time input since 046. Was free text accepting
                  "2:00 PM - 3:30 PM"; only the start was ever used, and the end
                  time had nowhere to be stored. */}
              <div>
                <label className={labelClass} style={{ color: '#8B7355' }}>Start time</label>
                <input
                  type="time"
                  value={form.panel_start}
                  onChange={e => setForm({ ...form, panel_start: e.target.value })}
                  className={inputBase}
                  style={inputStyle}
                />
              </div>

              {/* Location */}
              <div className={form.location === 'Booth' ? '' : 'sm:col-span-2'}>
                <label className={labelClass} style={{ color: '#8B7355' }}>Location</label>
                <select
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value, booth_number: e.target.value !== 'Booth' ? '' : form.booth_number })}
                  className={inputBase}
                  style={{ ...inputStyle, appearance: 'none' as const, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                >
                  <option value="">Select a location</option>
                  {LOCATIONS.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              {/* Booth Number - only when location is Booth */}
              {form.location === 'Booth' && (
                <div>
                  <label className={labelClass} style={{ color: '#8B7355' }}>Booth #</label>
                  <input
                    type="text"
                    placeholder="e.g. 42"
                    value={form.booth_number}
                    onChange={e => setForm({ ...form, booth_number: e.target.value })}
                    className={inputBase}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Panelists */}
              <div>
                <label className={labelClass} style={{ color: '#8B7355' }}>Panelists</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe, Jane Smith"
                  value={form.panelists}
                  onChange={e => setForm({ ...form, panelists: e.target.value })}
                  className={inputBase}
                  style={inputStyle}
                />
              </div>

              {/* Free to the Public */}
              <div className="sm:col-span-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_free}
                    onChange={e => setForm({
                      ...form,
                      is_free: e.target.checked,
                      cost: e.target.checked ? '' : form.cost,
                    })}
                    className="h-4 w-4 rounded"
                    style={{ accentColor: '#8B7355' }}
                  />
                  <span className="text-sm font-medium text-white">Free to the Public</span>
                  {form.is_free && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                      style={{ backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}
                    >
                      Free to the Public
                    </span>
                  )}
                </label>
              </div>

              {/* Cost */}
              <div>
                <label className={labelClass} style={{ color: '#8B7355' }}>
                  Cost (USD)
                </label>
                <div className="relative">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-sm"
                    style={{ color: form.is_free ? '#444' : '#999' }}
                  >
                    $
                  </span>
                  <input
                    type="text"
                    placeholder="0.00"
                    value={form.is_free ? '0.00' : form.cost}
                    onChange={e => setForm({ ...form, cost: e.target.value })}
                    disabled={form.is_free}
                    className={inputBase}
                    style={{
                      ...inputStyle,
                      paddingLeft: '1.5rem',
                      opacity: form.is_free ? 0.4 : 1,
                      cursor: form.is_free ? 'not-allowed' : 'text',
                    }}
                  />
                </div>
              </div>

              {/* Room size - a PLANNING TARGET, not a cap. Nothing enforces
                  it and registration never closes. */}
              <div>
                <label className={labelClass} style={{ color: '#8B7355' }}>
                  Room seats
                </label>
                <input
                  type="number"
                  placeholder="Optional"
                  value={form.max_capacity}
                  onChange={e => setForm({ ...form, max_capacity: e.target.value })}
                  className={inputBase}
                  style={inputStyle}
                />
                <p className="mt-1 text-[11px]" style={{ color: '#666' }}>
                  Planning target only. Registration is never closed and no
                  attendee is ever turned away - this is what the count is
                  flagged against so you can move rooms or add chairs.
                </p>
              </div>

              {/* Signup Type */}
              <div className="sm:col-span-2">
                <label className={labelClass} style={{ color: '#8B7355' }}>
                  Signup Type
                </label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(['none', 'aatc_invoice', 'email_host', 'free_registration'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm({ ...form, signup_type: type })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold text-left transition-colors"
                      style={{
                        backgroundColor: form.signup_type === type ? 'rgba(139,115,85,0.25)' : '#0a0a0a',
                        border: form.signup_type === type
                          ? '1px solid #8B7355'
                          : '1px solid #2a2a2a',
                        color: form.signup_type === type ? '#C4A882' : '#999',
                      }}
                    >
                      {SIGNUP_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Host Email - only when signup_type = email_host */}
              {form.signup_type === 'email_host' && (
                <div className="sm:col-span-2">
                  <label className={labelClass} style={{ color: '#8B7355' }}>
                    Host Email
                  </label>
                  <input
                    type="email"
                    placeholder="host@example.com"
                    value={form.host_email}
                    onChange={e => setForm({ ...form, host_email: e.target.value })}
                    className={inputBase}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* AATC Invoice note */}
              {form.signup_type === 'aatc_invoice' && !form.is_free && (
                <div className="sm:col-span-2">
                  <p className="text-xs" style={{ color: '#C4A882' }}>
                    Attendees will be charged {form.cost ? `$${parseFloat(form.cost || '0').toFixed(2)}` : 'the cost above'} via Stripe.
                  </p>
                </div>
              )}

              {/* Panel Image */}
              <div className="sm:col-span-2">
                <label className={labelClass} style={{ color: '#8B7355' }}>Panel Image</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  id="panel-image-upload"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file && file.size > 5 * 1024 * 1024) {
                      toast.error('Image must be under 5MB')
                      return
                    }
                    setImageFile(file ?? null)
                  }}
                />
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="panel-image-upload"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold"
                    style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                  >
                    {imageFile ? imageFile.name : 'Upload image'}
                  </label>
                  {editingPanel?.image_url && !imageFile && (
                    <span className="text-xs" style={{ color: '#666' }}>Current image set</span>
                  )}
                </div>
                <p className="mt-1 text-xs" style={{ color: '#555' }}>
                  Square image recommended. Displayed with a polaroid-style frame on the public page.
                </p>
              </div>

              {/* Published */}
              <div className="sm:col-span-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={e => setForm({ ...form, is_published: e.target.checked })}
                    className="h-4 w-4 rounded"
                    style={{ accentColor: '#8B7355' }}
                  />
                  <span className="text-sm font-medium text-white">Published</span>
                </label>
                <p className="mt-1 text-xs" style={{ color: '#555' }}>
                  Published panels are visible on the public schedule.
                </p>
              </div>
            </div>

            {/* Modal actions */}
            <div className="mt-6 flex gap-2">
              <button
                onClick={savePanel}
                disabled={working || !form.title.trim()}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: '#8B7355' }}
              >
                {working ? 'Saving...' : editingPanel ? 'Save Changes' : 'Add Panel'}
              </button>
              <button
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                style={{ color: '#666', border: '1px solid #2a2a2a' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Registrations Modal */}
      {viewingRegistrations && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-10"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) closeRegistrations() }}
        >
          <div
            className="w-full max-w-3xl rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(139,115,85,0.4)' }}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Registrations
                </h2>
                <p className="mt-0.5 text-sm" style={{ color: '#999' }}>
                  {viewingRegistrations.title} - {registrations.length} registrant{registrations.length !== 1 ? 's' : ''}
                  {viewingRegistrations.max_capacity ? ` · room seats ${viewingRegistrations.max_capacity}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportRegistrations(viewingRegistrations)}
                  disabled={registrations.length === 0}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40"
                  style={{ backgroundColor: '#8B7355', color: '#fff' }}
                >
                  Download CSV
                </button>
                <button
                  onClick={closeRegistrations}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{ color: '#666', border: '1px solid #2a2a2a' }}
                >
                  Close
                </button>
              </div>
            </div>

            {loadingRegistrations ? (
              <div className="flex h-32 items-center justify-center">
                <div
                  className="h-6 w-6 animate-spin rounded-full border-2"
                  style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }}
                />
              </div>
            ) : registrations.length === 0 ? (
              <div
                className="rounded-xl px-5 py-10 text-center"
                style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
              >
                <p className="text-sm" style={{ color: '#555' }}>No registrations yet.</p>
              </div>
            ) : (
              <>
                {/* The caveat belongs HERE, next to the number being read.
                    In CUTOVER it would be read once and forgotten. */}
                <div className="mb-3 rounded-xl px-4 py-3 text-xs leading-relaxed"
                     style={{ backgroundColor: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.25)', color: '#d4b545' }}>
                  <strong>This list undercounts the room.</strong> Seminars are open -
                  walk-ins are welcome and do not register, so actual attendance runs
                  higher than the roster. Last year the accounting seminar drew roughly
                  50 people. Plan the room against the registration count plus a walk-in
                  margin, not against the count itself.
                </div>
              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #2a2a2a' }}>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#111' }}>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>Name</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>Email</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>Phone</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>Social</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>Type</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>Payment</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map(reg => (
                      <tr
                        key={reg.id}
                        style={{ borderTop: '1px solid #2a2a2a' }}
                      >
                        <td className="px-3 py-2.5 font-medium text-white whitespace-nowrap">{reg.name}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: '#999' }}>{reg.email}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: '#999' }}>{reg.phone ?? '--'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: '#999' }}>{reg.social_media ?? '--'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                            style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                          >
                            {reg.attendee_type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {reg.payment_status === 'paid' ? (
                            <span
                              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                              style={{ backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}
                            >
                              Paid
                            </span>
                          ) : reg.payment_status === 'pending' ? (
                            <span
                              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                              style={{ backgroundColor: 'rgba(250,204,21,0.1)', color: '#facc15', border: '1px solid rgba(250,204,21,0.25)' }}
                            >
                              Pending
                            </span>
                          ) : (
                            <span
                              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                              style={{ backgroundColor: 'rgba(102,102,102,0.1)', color: '#666', border: '1px solid rgba(102,102,102,0.2)' }}
                            >
                              N/A
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: '#555' }}>
                          {new Date(reg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
