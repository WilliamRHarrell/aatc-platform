'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { truckInvoiceRepriceable } from '@/lib/food-truck-invoice'
import { foodTruckPrice } from '@/lib/food-truck-pricing'
import InviteLinkControl from '@/components/admin/InviteLinkControl'
import { guardedWrite } from '@/lib/db-write'
import { requestRevalidate } from '@/lib/revalidate'
import { parseCapacity } from '@/lib/pinup-capacity'
import { TRUCK_STATUS_LABELS, capLabel, type Decision } from '@/lib/food-truck-decision'
import { truckBalancePastDue, truckPaymentState } from '@/lib/food-truck-reminders'
import { todayEastern } from '@/lib/date-only'
import { FINAL_DUE_LABEL } from '@/lib/event-config'
import { TRUCK_DOC_KINDS, TRUCK_DOC_LABELS, truckDocState, type TruckDocKind, type TruckDocState } from '@/lib/food-truck-submission'

const DAY_OPTIONS = ['friday', 'saturday', 'sunday'] as const
const DAY_LABELS: Record<string, string> = { friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }
// Prices: src/lib/food-truck-pricing.ts (reconcile block G is pinned to it by a test).

// Applications (091): status, the cap and the switch. See
// docs/superpowers/plans/2026-10-07-food-truck-application.md.
const TRUCK_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:      { bg: 'rgba(234,179,8,0.15)',   color: '#eab308' },
  approved:     { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
  waitlisted:   { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
  not_selected: { bg: 'rgba(153,153,153,0.15)', color: '#999' },
  released:     { bg: 'rgba(153,153,153,0.15)', color: '#999' },
}
const STATUS_FILTERS = ['all', 'pending', 'approved', 'waitlisted', 'not_selected'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]
const publicImage = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/food-truck-logos/${path}`

const INVOICE_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:   { bg: 'rgba(234,179,8,0.15)',   color: '#eab308' },
  paid:      { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
  overdue:   { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  cancelled: { bg: 'rgba(153,153,153,0.15)', color: '#999' },
}

interface FoodTruck {
  id: string
  event_id: string
  user_id: string | null
  business_name: string
  contact_name: string
  email: string
  phone: string | null
  website: string | null
  instagram: string | null
  facebook: string | null
  cuisine_type: string
  description: string
  logo_url: string | null
  days: string[]
  thursday_setup: boolean
  is_published: boolean
  created_at: string
  // 091; absent until it is applied
  status?: string
  photos?: string[]
  applied_at?: string | null
  acknowledged_at?: string | null
  decided_at?: string | null
  decision_email_opt_out?: boolean
  decision_email_sent_at?: string | null
  // 093; absent until it is applied
  permit_path?: string | null
  permit_uploaded_at?: string | null
  permit_verified_at?: string | null
  license_path?: string | null
  license_uploaded_at?: string | null
  license_verified_at?: string | null
}

// Docs column and panel (093): missing / uploaded / verified per document.
const DOC_STATE_STYLE: Record<TruckDocState, { color: string; short: string }> = {
  missing:  { color: '#666',    short: 'missing' },
  uploaded: { color: '#eab308', short: 'uploaded' },
  verified: { color: '#4ade80', short: 'verified' },
}
const docState = (t: FoodTruck, kind: TruckDocKind) => truckDocState(t[`${kind}_path`], t[`${kind}_verified_at`])

interface EventSettings { open: boolean; cap: number }

interface FoodTruckInvoice {
  id: string
  deposit_paid_at: string | null
  food_truck_id: string
  amount: number
  amount_paid: number
  payment_reference: string | null
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
}

interface FormState {
  business_name: string
  contact_name: string
  email: string
  phone: string
  website: string
  instagram: string
  facebook: string
  cuisine_type: string
  description: string
  days: string[]
  thursday_setup: boolean
}

const EMPTY_FORM: FormState = {
  business_name: '',
  contact_name: '',
  email: '',
  phone: '',
  website: '',
  instagram: '',
  facebook: '',
  cuisine_type: '',
  description: '',
  days: [],
  thursday_setup: false,
}

export default function AdminFoodTrucksPage() {
  const supabase = createClient()
  const [trucks, setTrucks] = useState<FoodTruck[]>([])
  const [invoiceMap, setInvoiceMap] = useState<Map<string, FoodTruckInvoice>>(new Map())
  const [loading, setLoading] = useState(true)
  const [eventId, setEventId] = useState<string | null>(null)
  const [thursdayCount, setThursdayCount] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [working, setWorking] = useState(false)
  // null = 091 not applied yet (the columns are missing): the application
  // controls stay hidden and the page works as before.
  const [settings, setSettings] = useState<EventSettings | null>(null)
  const [capDraft, setCapDraft] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [deciding, setDeciding] = useState(false)
  const [docBusy, setDocBusy] = useState(false)

  const loadData = async () => {
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('is_active', true)
      .single()

    if (!event) { setLoading(false); return }
    setEventId(event.id)

    const { data: es, error: esErr } = await supabase
      .from('events')
      .select('food_truck_applications_open, food_truck_cap')
      .eq('id', event.id)
      .single()
    if (esErr || !es) {
      if (esErr?.code !== '42703') console.error(`[admin/food-trucks] event settings: ${esErr?.message}`)
      setSettings(null)
    } else {
      setSettings({ open: es.food_truck_applications_open, cap: es.food_truck_cap })
      setCapDraft(String(es.food_truck_cap))
    }

    const { data } = await supabase
      .from('food_trucks')
      .select('*')
      .eq('event_id', event.id)
      .order('business_name')

    const truckList = (data as unknown as FoodTruck[]) ?? []
    setTrucks(truckList)
    setThursdayCount(truckList.filter(t => t.thursday_setup).length)

    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, food_truck_id, amount, amount_paid, status, payment_reference, deposit_paid_at')
      .not('food_truck_id', 'is', null)

    const map = new Map<string, FoodTruckInvoice>()
    for (const inv of (invoices ?? []) as unknown as FoodTruckInvoice[]) {
      if (inv.food_truck_id) map.set(inv.food_truck_id, inv)
    }
    setInvoiceMap(map)

    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const counts = useMemo(() => ({
    total: trucks.length,
    published: trucks.filter(t => t.is_published).length,
    unpublished: trucks.filter(t => !t.is_published).length,
    approved: trucks.filter(t => t.status === 'approved').length,
    // A truck counts as confirmed only when paid in full (Ryan, 2026-10-07).
    paidInFull: trucks.filter(t => t.status === 'approved' && truckPaymentState(invoiceMap.get(t.id)) === 'paid').length,
    byStatus: Object.fromEntries(STATUS_FILTERS.map(f => [f, f === 'all' ? trucks.length : trucks.filter(t => t.status === f).length])) as Record<StatusFilter, number>,
  }), [trucks, invoiceMap])

  // From the day after the due date, a selected truck with a balance is flagged (092).
  const pastDue = truckBalancePastDue(todayEastern())

  const shown = useMemo(() => filter === 'all' ? trucks : trucks.filter(t => t.status === filter), [trucks, filter])

  // ── Switch and cap (events row, admin write) ─────────────
  const saveSettings = async (patch: { food_truck_applications_open?: boolean; food_truck_cap?: number }) => {
    if (!eventId) return
    const res = await guardedWrite(
      supabase.from('events').update(patch).eq('id', eventId).select('id'),
      'Food truck settings not saved',
      `admin/food-trucks settings event=${eventId}`,
    )
    if (!res.ok) { toast.error(res.error); return false }
    setSettings(s => s && {
      open: patch.food_truck_applications_open ?? s.open,
      cap: patch.food_truck_cap ?? s.cap,
    })
    const purged = await requestRevalidate({ paths: ['/apply/food-truck'], tags: ['food-trucks'] })
    if (!purged) toast('Saved. The public page may take up to a minute to update.')
    return true
  }

  const toggleOpen = async () => {
    if (!settings) return
    const next = !settings.open
    if (next && !window.confirm('Open food truck applications? The form at /apply/food-truck goes live.')) return
    if (await saveSettings({ food_truck_applications_open: next })) {
      toast.success(next ? 'Food truck applications are open' : 'Food truck applications are closed')
    }
  }

  const saveCap = async () => {
    const cap = parseCapacity(capDraft)
    if (!cap.ok) { toast.error('Enter a whole number of trucks, 1 or more'); return }
    if (await saveSettings({ food_truck_cap: cap.value })) toast.success(`Cap set to ${cap.value}`)
  }

  // ── Decisions (server route: invoice, invite and emails) ──
  const decide = async (truck: FoodTruck, decision: Decision | 'released') => {
    const verb = decision === 'approved' ? 'Select' : decision === 'waitlisted' ? 'Waitlist' : decision === 'released' ? 'Release' : 'Mark as not selected'
    const mail = decision === 'approved'
      ? 'This creates the invoice and emails them to set up their account and pay.'
      : decision === 'released'
        ? 'This unpublishes the truck, cancels its unpaid invoice and frees its spot. Payments already made stay on record and are not refunded. No email is sent.'
        : truck.decision_email_opt_out ? 'No email will be sent (don\'t send is ticked).' : 'They will be emailed.'
    if (!window.confirm(`${verb} ${truck.business_name}? ${mail}`)) return
    setDeciding(true)
    try {
      const res = await fetch('/api/admin/food-trucks/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: truck.id, decision }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; emailSent?: boolean; problems?: string[] }
      if (!res.ok) { toast.error(json.error ?? 'The decision did not save'); return }
      if (json.problems?.length) toast.error(`Saved, but ${json.problems.join('; ')}.`, { duration: 10000 })
      else toast.success(`${TRUCK_STATUS_LABELS[decision] ?? decision}${json.emailSent ? ', email sent' : ''}`)
      await loadData()
    } finally {
      setDeciding(false)
    }
  }

  // ── Permit and license (093) ──────────────────────────────
  // Signed URLs live five minutes, so each View asks for a fresh one.
  const viewDoc = async (truck: FoodTruck, kind: TruckDocKind) => {
    const tab = window.open('', '_blank')
    const res = await fetch('/api/admin/food-truck-docs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ truckId: truck.id }),
    })
    const json = (await res.json().catch(() => ({}))) as { urls?: Record<string, string | null>; error?: string }
    const url = json.urls?.[kind]
    if (!res.ok || !url) { tab?.close(); toast.error(json.error ?? `Could not open the ${TRUCK_DOC_LABELS[kind].toLowerCase()}`); return }
    if (tab) tab.location.href = url
    else window.location.href = url
  }

  const setDocVerified = async (truck: FoodTruck, kind: TruckDocKind, verified: boolean) => {
    setDocBusy(true)
    try {
      const { data, error } = await supabase.rpc('set_food_truck_doc_verified', { p_truck_id: truck.id, p_kind: kind, p_verified: verified })
      if (error) { toast.error(`${TRUCK_DOC_LABELS[kind]} not ${verified ? 'verified' : 'unverified'}: ${error.message}`); return }
      setTrucks(prev => prev.map(t => t.id === truck.id ? { ...t, [`${kind}_verified_at`]: data ?? null } : t))
      toast.success(`${TRUCK_DOC_LABELS[kind]} ${verified ? 'verified' : 'marked unverified'}`)
    } finally {
      setDocBusy(false)
    }
  }

  const toggleOptOut = async (truck: FoodTruck) => {
    const next = !truck.decision_email_opt_out
    const res = await guardedWrite(
      supabase.from('food_trucks').update({ decision_email_opt_out: next }).eq('id', truck.id).select('id'),
      '"Don\'t send" not saved',
      `admin/food-trucks optout id=${truck.id}`,
    )
    if (!res.ok) { toast.error(res.error); return }
    setTrucks(prev => prev.map(t => t.id === truck.id ? { ...t, decision_email_opt_out: next } : t))
  }

  const startAdd = () => {
    setForm(EMPTY_FORM)
    setLogoFile(null)
    setEditingId(null)
    setModalOpen(true)
  }

  const startEdit = (t: FoodTruck) => {
    setForm({
      business_name: t.business_name,
      contact_name: t.contact_name,
      email: t.email,
      phone: t.phone ?? '',
      website: t.website ?? '',
      instagram: t.instagram ?? '',
      facebook: t.facebook ?? '',
      cuisine_type: t.cuisine_type,
      description: t.description,
      days: [...t.days],
      thursday_setup: t.thursday_setup,
    })
    setLogoFile(null)
    setEditingId(t.id)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setLogoFile(null)
  }

  const toggleDay = (day: string) => {
    setForm(f => ({
      ...f,
      days: f.days.includes(day)
        ? f.days.filter(d => d !== day)
        : [...f.days, day],
    }))
  }

  const handleSave = async () => {
    if (!eventId) return
    if (!form.business_name.trim()) { toast.error('Business name is required'); return }
    if (!form.contact_name.trim()) { toast.error('Contact name is required'); return }
    if (!form.email.trim()) { toast.error('Email is required'); return }
    if (form.days.length === 0) { toast.error('Select at least one day'); return }

    setWorking(true)

    if (editingId) {
      // Update existing truck
      const updateData: Record<string, unknown> = {
        business_name: form.business_name.trim(),
        contact_name: form.contact_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        instagram: form.instagram.trim() || null,
        facebook: form.facebook.trim() || null,
        cuisine_type: form.cuisine_type.trim(),
        description: form.description.trim(),
        days: form.days,
        thursday_setup: form.thursday_setup,
      }

      // Handle logo upload
      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        const path = `${editingId}/logo.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('food-truck-logos')
          .upload(path, logoFile, { upsert: true })
        if (uploadError) {
          toast.error('Failed to upload logo')
          setWorking(false)
          return
        }
        updateData.logo_url = path
      }

      const res = await guardedWrite(
        supabase.from('food_trucks').update(updateData).eq('id', editingId).select('id'),
        'Food truck not updated',
        `admin/food-trucks update id=${editingId}`,
      )

      if (!res.ok) {
        toast.error(res.error)
        setWorking(false)
        return
      }

      // If days changed and invoice is pending, update invoice amount
      const existingTruck = trucks.find(t => t.id === editingId)
      const invoice = invoiceMap.get(editingId)
      if (existingTruck && invoice && existingTruck.days.length !== form.days.length && !truckInvoiceRepriceable(invoice)) {
        // Imported from Square, or a payment is recorded: the amount stays.
        toast(`Days changed; the invoice amount was not changed (${/^Square #/.test(invoice.payment_reference ?? '') ? 'imported from Square' : 'payments recorded or not pending'}). Adjust it in Invoices if needed.`)
      }
      if (existingTruck && invoice && truckInvoiceRepriceable(invoice)) {
        const oldDayCount = existingTruck.days.length
        const newDayCount = form.days.length
        if (oldDayCount !== newDayCount) {
          // Unchecked before. A silent failure here bills the truck for the
          // OLD number of days while the admin shows the new one - the two
          // disagree and nothing says so.
          const amtRes = await guardedWrite(
            supabase.from('invoices')
              .update({ amount: foodTruckPrice(newDayCount) })
              .eq('id', invoice.id)
              .select('id'),
            'Days changed but the invoice amount was not updated',
            `admin/food-trucks invoiceAmount id=${invoice.id}`,
          )
          if (!amtRes.ok) toast.error(amtRes.error)
        }
      }

      toast.success('Food truck updated')
      closeModal()
      await loadData()
    } else {
      // Insert new truck
      const { data: newTruck, error } = await supabase
        .from('food_trucks')
        .insert({
          event_id: eventId,
          business_name: form.business_name.trim(),
          contact_name: form.contact_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          website: form.website.trim() || null,
          instagram: form.instagram.trim() || null,
          facebook: form.facebook.trim() || null,
          cuisine_type: form.cuisine_type.trim(),
          description: form.description.trim(),
          days: form.days,
          thursday_setup: form.thursday_setup,
          is_published: false,
          // A truck the admin adds is taken: approved, counted toward the cap (091).
          ...(settings ? { status: 'approved' } : {}),
        })
        .select('*')
        .single()

      if (error || !newTruck) {
        toast.error(error?.hint === 'FOOD_TRUCK_CAP'
          ? `All spots are taken (${settings ? capLabel(counts.approved, settings.cap) : 'cap reached'}). Raise the cap to add another.`
          : error?.code === '23505' ? 'Another active truck already uses this email.' : 'Failed to add food truck')
        setWorking(false)
        return
      }

      const truck = newTruck as unknown as FoodTruck

      // Upload logo if provided
      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        const path = `${truck.id}/logo.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('food-truck-logos')
          .upload(path, logoFile)
        if (!uploadError) {
          // Was unchecked. A blocked update here leaves the file uploaded and
          // the row still pointing at nothing, which reads as a failed upload.
          await guardedWrite(
            supabase.from('food_trucks').update({ logo_url: path }).eq('id', truck.id).select('id'),
            'Logo not linked',
            `admin/food-trucks logo id=${truck.id}`,
          )
        }
      }

      // Create invoice
      // Same revenue gap as the booth and approve paths: a food truck created
      // with no invoice is never billed and appears in no queue.
      const invRes = await guardedWrite(
        supabase
        .from('invoices')
        .insert({
          food_truck_id: truck.id,
          amount: foodTruckPrice(form.days.length),
          amount_paid: 0,
          status: 'pending',
          // A truck invoiced from 092 on takes the $100 deposit (Ryan, 2026-10-08).
          deposit_rule: 'food_truck_flat',
        }).select('id'),
        'Food truck created but the invoice was not',
        `admin/food-trucks invoice truck=${truck.id}`,
      )
      if (!invRes.ok) toast.error(invRes.error)

      toast.success('Food truck added')
      closeModal()
      await loadData()
    }

    setWorking(false)
  }

  const handleDelete = async () => {
    if (!editingId) return
    if (!window.confirm('Are you sure you want to delete this food truck?')) return

    setWorking(true)

    // Delete associated invoice manually
    const invoice = invoiceMap.get(editingId)
    if (invoice) {
      await supabase.from('invoices').delete().eq('id', invoice.id)
    }

    // Guarded: the invoice above is already deleted by this point, so a
    // silently-blocked truck delete would leave the truck with its invoice gone.
    const res = await guardedWrite(
      supabase.from('food_trucks').delete().eq('id', editingId).select('id'),
      'Food truck not deleted',
      `admin/food-trucks delete id=${editingId}`,
    )
    if (!res.ok) {
      toast.error(res.error)
      setWorking(false)
      return
    }

    toast.success('Food truck deleted')
    closeModal()
    await loadData()
    setWorking(false)
  }

  const togglePublished = async (truck: FoodTruck) => {
    const newVal = !truck.is_published
    if (newVal && truck.status && truck.status !== 'approved') {
      toast.error('Only a selected truck can be published.')
      return
    }
    const res = await guardedWrite(
      supabase.from('food_trucks').update({ is_published: newVal }).eq('id', truck.id).select('id'),
      'Published status not saved',
      `admin/food-trucks publish id=${truck.id}`,
    )

    if (!res.ok) {
      toast.error(res.error)
      return
    }

    setTrucks(prev => prev.map(t => t.id === truck.id ? { ...t, is_published: newVal } : t))
    toast.success(newVal ? 'Food truck published' : 'Food truck unpublished')
  }

  const inputClass = 'w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors'
  const inputStyle = { backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a', color: '#fff' }

  // Thursday slot availability: disabled if 2 already taken (unless editing a truck that already has it)
  const thursdayDisabled = useMemo(() => {
    if (editingId) {
      const editingTruck = trucks.find(t => t.id === editingId)
      if (editingTruck?.thursday_setup) return false // This truck already has it, so it can keep it
    }
    return thursdayCount >= 2
  }, [thursdayCount, editingId, trucks])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Food Trucks</h1>
          <p className="mt-1 text-sm" style={{ color: '#999' }}>
            {counts.total} food truck{counts.total !== 1 ? 's' : ''} &middot; {counts.published} published &middot; {counts.unpublished} unpublished
            {settings && <> &middot; <span style={{ color: counts.approved >= settings.cap ? '#eab308' : '#4ade80' }}>{capLabel(counts.approved, settings.cap)}</span> &middot; {counts.paidInFull} paid in full</>}
          </p>
        </div>
        <button
          onClick={startAdd}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: '#8B7355' }}
        >
          + Add Food Truck
        </button>
      </div>

      {/* Applications: the switch and the cap (events row, 091) */}
      {settings && (
        <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl px-5 py-4" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <label className="flex cursor-pointer items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={settings.open}
              onClick={toggleOpen}
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
              style={{
                backgroundColor: settings.open ? 'rgba(34,197,94,0.3)' : '#2a2a2a',
                border: `1px solid ${settings.open ? 'rgba(34,197,94,0.5)' : '#3a3a3a'}`,
              }}
            >
              <span className="absolute top-0.5 h-4 w-4 rounded-full transition-transform" style={{ backgroundColor: settings.open ? '#22c55e' : '#666', left: settings.open ? '22px' : '3px' }} />
            </button>
            <span className="text-sm text-white">Accepting food truck applications</span>
            <span className="text-xs font-semibold" style={{ color: settings.open ? '#4ade80' : '#999' }}>{settings.open ? 'Open' : 'Closed'}</span>
          </label>
          <div className="flex items-center gap-2">
            <label htmlFor="ft-cap" className="text-sm text-white">Most trucks</label>
            <input
              id="ft-cap"
              inputMode="numeric"
              value={capDraft}
              onChange={e => setCapDraft(e.target.value)}
              className="w-16 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
              style={inputStyle}
            />
            {capDraft !== String(settings.cap) && (
              <button onClick={saveCap} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: '#8B7355' }}>Save</button>
            )}
          </div>
          <p className="text-xs" style={{ color: '#666' }}>
            Wording and emails: Content editor, &quot;Food truck application&quot;. Public form: /apply/food-truck
          </p>
        </div>
      )}

      {settings && (
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: filter === f ? 'rgba(139,115,85,0.2)' : 'transparent',
                color: filter === f ? '#C4A882' : '#999',
                border: `1px solid ${filter === f ? 'rgba(139,115,85,0.5)' : '#2a2a2a'}`,
              }}
            >
              {f === 'all' ? 'All' : TRUCK_STATUS_LABELS[f]} ({counts.byStatus[f]})
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        {trucks.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm" style={{ color: '#555' }}>
            No food trucks yet - click &quot;Add Food Truck&quot; to get started.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#2a2a2a' }}>
            {/* Table header */}
            <div className="hidden items-center gap-4 px-5 py-3 sm:flex">
              <div className="flex-1 text-xs font-bold uppercase tracking-wider" style={{ color: '#666' }}>Business Name</div>
              <div className="w-28 text-xs font-bold uppercase tracking-wider" style={{ color: '#666' }}>Cuisine</div>
              <div className="w-32 text-xs font-bold uppercase tracking-wider" style={{ color: '#666' }}>Days</div>
              <div className="w-12 text-xs font-bold uppercase tracking-wider" style={{ color: '#666' }}>Thu</div>
              {settings && <div className="w-24 text-xs font-bold uppercase tracking-wider text-center" style={{ color: '#666' }}>Status</div>}
              {settings && <div className="w-24 text-xs font-bold uppercase tracking-wider" style={{ color: '#666' }}>Docs</div>}
              <div className="w-28 text-xs font-bold uppercase tracking-wider text-center" style={{ color: '#666' }}>Payment</div>
              <div className="w-20 text-xs font-bold uppercase tracking-wider text-center" style={{ color: '#666' }}>Published</div>
              <div className="w-16" />
            </div>

            {shown.length === 0 && (
              <div className="px-5 py-10 text-center text-sm" style={{ color: '#555' }}>No trucks with this status.</div>
            )}
            {shown.map(truck => {
              const invoice = invoiceMap.get(truck.id)
              const invoiceStatus = invoice?.status ?? null

              return (
                <div key={truck.id} className="flex items-center gap-4 px-5 py-4">
                  {/* Business Name */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{truck.business_name}</p>
                    {truck.applied_at && (
                      <p className="text-xs" style={{ color: '#666' }}>Applied {new Date(truck.applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    )}
                    {/* Mobile-only info */}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
                      {settings && truck.status && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: TRUCK_STATUS_STYLE[truck.status]?.bg, color: TRUCK_STATUS_STYLE[truck.status]?.color }}>
                          {TRUCK_STATUS_LABELS[truck.status] ?? truck.status}
                        </span>
                      )}
                      {truck.status === 'approved' && pastDue && truckPaymentState(invoiceMap.get(truck.id)) !== 'paid' && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: 'rgba(248,113,113,0.15)', color: '#f87171' }}>Not paid in full</span>
                      )}
                      <span className="text-xs" style={{ color: '#999' }}>{truck.cuisine_type}</span>
                      {truck.days.map(d => (
                        <span
                          key={d}
                          className="rounded px-1.5 py-0.5 text-xs font-semibold"
                          style={{ backgroundColor: '#2a2a2a', color: '#C4A882' }}
                        >
                          {DAY_LABELS[d] ?? d}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Cuisine Type */}
                  <div className="hidden w-28 sm:block">
                    <span className="text-sm" style={{ color: '#999' }}>{truck.cuisine_type}</span>
                  </div>

                  {/* Days badges */}
                  <div className="hidden w-32 sm:flex flex-wrap gap-1">
                    {truck.days.map(d => (
                      <span
                        key={d}
                        className="rounded px-2 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: '#2a2a2a', color: '#C4A882' }}
                      >
                        {DAY_LABELS[d] ?? d}
                      </span>
                    ))}
                  </div>

                  {/* Thursday */}
                  <div className="hidden w-12 sm:block">
                    {truck.thursday_setup && (
                      <span
                        className="rounded px-2 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                      >
                        Thu
                      </span>
                    )}
                  </div>

                  {/* Status */}
                  {settings && (
                    <div className="hidden w-24 sm:flex justify-center">
                      {truck.status && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: TRUCK_STATUS_STYLE[truck.status]?.bg, color: TRUCK_STATUS_STYLE[truck.status]?.color }}>
                          {TRUCK_STATUS_LABELS[truck.status] ?? truck.status}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Docs: permit / license (093) */}
                  {settings && (
                    <div className="hidden w-24 sm:block text-xs leading-5">
                      {TRUCK_DOC_KINDS.map(kind => {
                        const st = docState(truck, kind)
                        return (
                          <div key={kind} title={`${TRUCK_DOC_LABELS[kind]}: ${DOC_STATE_STYLE[st].short}`}>
                            <span style={{ color: '#666' }}>{kind === 'permit' ? 'Permit' : 'License'}</span>{' '}
                            <span style={{ color: DOC_STATE_STYLE[st].color }}>{DOC_STATE_STYLE[st].short}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Payment */}
                  <div className="hidden w-28 sm:flex flex-col items-center gap-0.5">
                    {invoice && invoiceStatus ? (
                      <>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-bold"
                          style={{
                            backgroundColor: INVOICE_STATUS_STYLE[invoiceStatus].bg,
                            color: INVOICE_STATUS_STYLE[invoiceStatus].color,
                          }}
                          title={`Invoice ${invoiceStatus}`}
                        >
                          {formatCurrency(invoice.amount_paid ?? 0)} / {formatCurrency(invoice.amount)}
                        </span>
                        {truck.status === 'approved' && pastDue && truckPaymentState(invoice) !== 'paid' && (
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: 'rgba(248,113,113,0.15)', color: '#f87171' }}>
                            Not paid in full
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs" style={{ color: '#555' }}>--</span>
                    )}
                  </div>

                  {/* Published toggle */}
                  <div className="hidden w-20 sm:flex justify-center">
                    <button
                      onClick={() => togglePublished(truck)}
                      className="relative h-6 w-11 rounded-full transition-colors"
                      style={{
                        backgroundColor: truck.is_published ? 'rgba(34,197,94,0.3)' : '#2a2a2a',
                        border: `1px solid ${truck.is_published ? 'rgba(34,197,94,0.5)' : '#3a3a3a'}`,
                      }}
                    >
                      <span
                        className="absolute top-0.5 h-4 w-4 rounded-full transition-transform"
                        style={{
                          backgroundColor: truck.is_published ? '#22c55e' : '#666',
                          left: truck.is_published ? '22px' : '3px',
                        }}
                      />
                    </button>
                  </div>

                  {/* Edit button */}
                  <div className="w-16 flex justify-end">
                    <button
                      onClick={() => startEdit(truck)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                      style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal overlay */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {editingId ? 'Edit Food Truck' : 'Add Food Truck'}
              </h2>
              <button
                onClick={closeModal}
                className="text-lg font-bold"
                style={{ color: '#555' }}
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              {/* Business Name */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>Business Name *</label>
                <input
                  type="text"
                  value={form.business_name}
                  onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Food truck name"
                />
              </div>

              {/* Contact Name & Email */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>Contact Name *</label>
                  <input
                    type="text"
                    value={form.contact_name}
                    onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                    placeholder="Contact name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                    placeholder="email@example.com"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="(555) 555-5555"
                />
              </div>

              {/* Cuisine Type & Description */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>Cuisine Type</label>
                <input
                  type="text"
                  value={form.cuisine_type}
                  onChange={e => setForm(f => ({ ...f, cuisine_type: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="BBQ, Tacos, etc."
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Brief description of the food truck..."
                  rows={3}
                />
              </div>

              {/* Website, Instagram, Facebook */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>Website</label>
                <input
                  type="text"
                  value={form.website}
                  onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="www.example.com"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>Instagram</label>
                  <input
                    type="text"
                    value={form.instagram}
                    onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                    placeholder="@handle"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>Facebook</label>
                  <input
                    type="text"
                    value={form.facebook}
                    onChange={e => setForm(f => ({ ...f, facebook: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                    placeholder="Page name or URL"
                  />
                </div>
              </div>

              {/* Days */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>Days *</label>
                <div className="flex gap-2">
                  {DAY_OPTIONS.map(day => {
                    const active = form.days.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className="rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-colors"
                        style={{
                          backgroundColor: active ? 'rgba(139,115,85,0.2)' : 'rgba(255,255,255,0.04)',
                          color: active ? '#C4A882' : '#555',
                          border: `1px solid ${active ? 'rgba(139,115,85,0.5)' : '#2a2a2a'}`,
                        }}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
                {form.days.length > 0 && (
                  <p className="mt-2 text-sm font-medium" style={{ color: '#C4A882' }}>
                    Price: {form.days.length > 0 ? formatCurrency(foodTruckPrice(form.days.length)) : 'select days'}
                  </p>
                )}
              </div>

              {/* Thursday Setup */}
              <div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.thursday_setup}
                    disabled={thursdayDisabled && !form.thursday_setup}
                    onChange={e => setForm(f => ({ ...f, thursday_setup: e.target.checked }))}
                    className="h-4 w-4 rounded"
                    style={{ accentColor: '#8B7355' }}
                  />
                  <span className="text-sm text-white">Thursday Setup</span>
                  {thursdayDisabled && !form.thursday_setup && (
                    <span className="text-xs" style={{ color: '#666' }}>(2/2 slots taken)</span>
                  )}
                </label>
              </div>

              {/* Logo */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>Logo</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  id="food-truck-logo"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file && file.size > 5 * 1024 * 1024) {
                      toast.error('Logo must be under 5MB')
                      return
                    }
                    setLogoFile(file ?? null)
                  }}
                />
                <label
                  htmlFor="food-truck-logo"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold"
                  style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                >
                  {logoFile ? logoFile.name : 'Upload logo'}
                </label>
              </div>

              {/* Application and decision (091) */}
              {editingId && settings && (() => {
                const truck = trucks.find(t => t.id === editingId)
                if (!truck?.status) return null
                const open = truck.status !== 'approved' && truck.status !== 'released'
                return (
                  <div className="rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Application</p>
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: TRUCK_STATUS_STYLE[truck.status]?.bg, color: TRUCK_STATUS_STYLE[truck.status]?.color }}>
                        {TRUCK_STATUS_LABELS[truck.status] ?? truck.status}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: '#999' }}>
                      {truck.applied_at
                        ? <>Applied {new Date(truck.applied_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}{truck.acknowledged_at ? ', requirements acknowledged' : ''}.</>
                        : 'Added by an admin or imported (no application).'}
                      {truck.decided_at && <> Decided {new Date(truck.decided_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}{truck.decision_email_sent_at ? ', email sent' : ', no email sent'}.</>}
                    </p>
                    {(truck.logo_url || (truck.photos?.length ?? 0) > 0) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[...(truck.logo_url ? [truck.logo_url] : []), ...(truck.photos ?? [])].map(path => (
                          <a key={path} href={publicImage(path)} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={publicImage(path)} alt="" className="h-16 w-16 rounded-lg object-cover" style={{ border: '1px solid #2a2a2a' }} />
                          </a>
                        ))}
                      </div>
                    )}
                    {truck.status === 'approved' && (() => {
                      const inv = invoiceMap.get(truck.id)
                      const state = truckPaymentState(inv)
                      return (
                        <div className="mt-4">
                          <p className="text-xs" style={{ color: state === 'paid' ? '#4ade80' : pastDue ? '#f87171' : '#999' }}>
                            {state === 'paid' ? 'Paid in full: confirmed.'
                              : state === 'none' ? 'No invoice.'
                              : `${formatCurrency(inv?.amount_paid ?? 0)} of ${formatCurrency(inv?.amount ?? 0)} paid. ${pastDue ? 'Not paid in full' : 'Balance due'} by ${FINAL_DUE_LABEL}.`}
                          </p>
                          <button
                            onClick={() => decide(truck, 'released')}
                            disabled={deciding}
                            className="mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-40"
                            style={{ backgroundColor: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
                          >
                            Release
                          </button>
                          <p className="mt-2 text-xs" style={{ color: '#666' }}>Unpublishes the truck, cancels its unpaid invoice and frees its spot. No email; payments made are kept.</p>
                        </div>
                      )
                    })()}
                    {open && (
                      <>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {([['approved', 'Approve'], ['waitlisted', 'Waitlist'], ['not_selected', 'Not selected']] as const)
                            .filter(([d]) => d !== truck.status)
                            .map(([d, label]) => (
                              <button
                                key={d}
                                onClick={() => decide(truck, d)}
                                disabled={deciding || (d === 'approved' && counts.approved >= settings.cap)}
                                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-40"
                                style={d === 'approved'
                                  ? { backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }
                                  : { backgroundColor: 'transparent', color: '#ccc', border: '1px solid #3a3a3a' }}
                              >
                                {label}
                              </button>
                            ))}
                        </div>
                        {counts.approved >= settings.cap && (
                          <p className="mt-2 text-xs" style={{ color: '#eab308' }}>{capLabel(counts.approved, settings.cap)}. Raise the cap to approve more.</p>
                        )}
                        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs" style={{ color: '#999' }}>
                          <input type="checkbox" checked={!!truck.decision_email_opt_out} onChange={() => toggleOptOut(truck)} style={{ accentColor: '#8B7355' }} />
                          Don&apos;t send the waitlist / not selected email (I&apos;ll contact them myself)
                        </label>
                        <p className="mt-2 text-xs" style={{ color: '#666' }}>Approve creates the invoice and sends the &quot;you&apos;re selected, set up your account to pay&quot; email.</p>
                      </>
                    )}
                  </div>
                )
              })()}

              {/* Health permit and business license (093) */}
              {editingId && settings && (() => {
                const truck = trucks.find(t => t.id === editingId)
                if (!truck || truck.permit_path === undefined) return null
                return (
                  <div className="rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Permit and license</p>
                    <div className="space-y-3">
                      {TRUCK_DOC_KINDS.map(kind => {
                        const st = docState(truck, kind)
                        const uploadedAt = truck[`${kind}_uploaded_at`]
                        const verifiedAt = truck[`${kind}_verified_at`]
                        return (
                          <div key={kind} className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm">
                              <span className="text-white">{TRUCK_DOC_LABELS[kind]}</span>{' '}
                              <span className="text-xs font-semibold" style={{ color: DOC_STATE_STYLE[st].color }}>
                                {st === 'missing' ? 'not uploaded'
                                  : st === 'verified' ? `verified ${verifiedAt ? new Date(verifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}`
                                  : `uploaded ${uploadedAt ? new Date(uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}`}
                              </span>
                            </div>
                            {st !== 'missing' && (
                              <div className="flex gap-2">
                                <button onClick={() => viewDoc(truck, kind)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>View</button>
                                <button
                                  onClick={() => setDocVerified(truck, kind, st !== 'verified')}
                                  disabled={docBusy}
                                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-40"
                                  style={st === 'verified'
                                    ? { color: '#999', border: '1px solid #3a3a3a' }
                                    : { backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}
                                >
                                  {st === 'verified' ? 'Unverify' : 'Mark verified'}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <p className="mt-3 text-xs" style={{ color: '#666' }}>The truck uploads these on the form or in its portal. A replacement clears the verification.</p>
                  </div>
                )
              })()}

              {/* Portal access (Invite & link, 090) */}
              {editingId && (() => {
                const truck = trucks.find(t => t.id === editingId)
                if (!truck) return null
                return (
                  <div className="rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Portal access</p>
                    <InviteLinkControl
                      kind="food_truck"
                      id={truck.id}
                      linked={!!truck.user_id}
                      defaultEmail={truck.email}
                      onChange={userId => setTrucks(prev => prev.map(t => t.id === truck.id ? { ...t, user_id: userId } : t))}
                    />
                  </div>
                )
              })()}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={working}
                  className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: '#8B7355' }}
                >
                  {working ? 'Saving...' : editingId ? 'Update Food Truck' : 'Add Food Truck'}
                </button>
                <button
                  onClick={closeModal}
                  className="rounded-lg px-5 py-2.5 text-sm font-semibold"
                  style={{ color: '#555', border: '1px solid #2a2a2a' }}
                >
                  Cancel
                </button>
                {editingId && (
                  <button
                    onClick={handleDelete}
                    disabled={working}
                    className="ml-auto rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
                    style={{ backgroundColor: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
