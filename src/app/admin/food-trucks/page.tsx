'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { guardedWrite } from '@/lib/db-write'

const DAY_OPTIONS = ['friday', 'saturday', 'sunday'] as const
const DAY_LABELS: Record<string, string> = { friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }
const PRICING: Record<number, number> = { 1: 6000, 2: 12000, 3: 16000 }

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
}

interface FoodTruckInvoice {
  id: string
  food_truck_id: string
  amount: number
  amount_paid: number
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

  const loadData = async () => {
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('is_active', true)
      .single()

    if (!event) { setLoading(false); return }
    setEventId(event.id)

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
      .select('id, food_truck_id, amount, amount_paid, status')
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
  }), [trucks])

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
      if (existingTruck && invoice && invoice.status === 'pending') {
        const oldDayCount = existingTruck.days.length
        const newDayCount = form.days.length
        if (oldDayCount !== newDayCount) {
          await supabase
            .from('invoices')
            .update({ amount: PRICING[newDayCount] })
            .eq('id', invoice.id)
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
        })
        .select('*')
        .single()

      if (error || !newTruck) {
        toast.error('Failed to add food truck')
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
      await supabase
        .from('invoices')
        .insert({
          food_truck_id: truck.id,
          amount: PRICING[form.days.length],
          amount_paid: 0,
          status: 'pending',
        })

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
              <div className="w-16 text-xs font-bold uppercase tracking-wider text-center" style={{ color: '#666' }}>Payment</div>
              <div className="w-20 text-xs font-bold uppercase tracking-wider text-center" style={{ color: '#666' }}>Published</div>
              <div className="w-16" />
            </div>

            {trucks.map(truck => {
              const invoice = invoiceMap.get(truck.id)
              const invoiceStatus = invoice?.status ?? null

              return (
                <div key={truck.id} className="flex items-center gap-4 px-5 py-4">
                  {/* Business Name */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{truck.business_name}</p>
                    {/* Mobile-only info */}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
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

                  {/* Payment */}
                  <div className="hidden w-16 sm:flex justify-center">
                    {invoiceStatus ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-bold"
                        style={{
                          backgroundColor: INVOICE_STATUS_STYLE[invoiceStatus].bg,
                          color: INVOICE_STATUS_STYLE[invoiceStatus].color,
                        }}
                      >
                        $
                      </span>
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
                    Price: {formatCurrency(PRICING[form.days.length])}
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
