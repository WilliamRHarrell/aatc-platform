'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { EXCLUSIVITY_CATEGORIES, exclusivityLabel } from '@/lib/exclusivity'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

// Presentation credits and exclusivity. Both are commercial records, neither is
// rendered wholesale: a credit exposes only buyer_name through
// presentation_credits_public, and exclusivity is never public at all.
//
// TWO THINGS THIS SCREEN HAS TO GET RIGHT:
//
// 1. A credit is ONE SALE ACROSS MANY ITEMS. Whole Life Aftercare presents the
//    Tattoo Battle, which is three schedule_items rows. If this UI presented
//    those as three separable credits the join table would be pointless, so a
//    credit is one card listing every item it covers, with one price.
//
// 2. AN EXCLUSIVITY CONFLICT IS SHOWN BEFORE SUBMIT. The unique index is the
//    guarantee, but a constraint violation reaching the operator as a generic
//    failure teaches them to retry - the recordPayment lesson. The category
//    picker marks what is already taken and by whom, so the conflict is visible
//    at the moment of sale rather than after it.

interface Credit {
  id: string
  buyer_name: string
  amount: number
  based_on_tier: string | null
  is_in_kind: boolean
  status: string
  notes: string | null
}
interface CreditItem { id: string; credit_id: string; schedule_item_id: string | null; panel_id: string | null }
interface Grant { id: string; category: string; buyer_name: string; notes: string | null }
interface Item { id: string; label: string; kind: 'schedule' | 'panel' }

export default function AdminCreditsPage() {
  const supabase = createClient()
  const [eventId, setEventId] = useState<string | null>(null)
  const [credits, setCredits] = useState<Credit[] | null>(null)
  const [creditItems, setCreditItems] = useState<CreditItem[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [newBuyer, setNewBuyer] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newInKind, setNewInKind] = useState(false)
  const [newTier, setNewTier] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const [grantCategory, setGrantCategory] = useState('')
  const [grantBuyer, setGrantBuyer] = useState('')

  const load = async () => {
    const { data: ev } = await supabase.from('events').select('id').eq('is_active', true).maybeSingle()
    if (!ev) { setFailed('No active event.'); return }
    setEventId(ev.id)

    const [c, ci, si, pn, gr] = await Promise.all([
      supabase.from('presentation_credits').select('id, buyer_name, amount, based_on_tier, is_in_kind, status, notes').eq('event_id', ev.id).order('buyer_name'),
      supabase.from('presentation_credit_items').select('id, credit_id, schedule_item_id, panel_id'),
      supabase.from('schedule_items').select('id, title, day_date, start_time').eq('event_id', ev.id).order('day_date').order('start_time'),
      supabase.from('panels').select('id, title').eq('event_id', ev.id).order('title'),
      supabase.from('exclusivity_grants').select('id, category, buyer_name, notes').eq('event_id', ev.id),
    ])
    if (c.error) {
      setFailed(c.error.code === '42P01'
        ? 'presentation_credits does not exist yet - migration 060 has not been applied.'
        : `Could not load credits (${c.error.code}).`)
      return
    }
    if (gr.error && gr.error.code === '42P01') {
      setFailed('exclusivity_grants does not exist yet - migration 062 has not been applied.')
      return
    }
    setFailed(null)
    setCredits((c.data ?? []) as Credit[])
    setCreditItems((ci.data ?? []) as CreditItem[])
    setGrants((gr.data ?? []) as Grant[])
    setItems([
      ...((si.data ?? []) as { id: string; title: string; day_date: string; start_time: string }[]).map(r => ({
        id: r.id, kind: 'schedule' as const,
        label: `${new Date(r.day_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })} ${r.start_time.slice(0, 5)}  ${r.title}`,
      })),
      ...((pn.data ?? []) as { id: string; title: string }[]).map(r => ({ id: r.id, kind: 'panel' as const, label: `Seminar  ${r.title}` })),
    ])
  }
  useEffect(() => { void Promise.resolve().then(load) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Which item is already committed, and to whom. Shown on the picker so a
  // double-sale is visible while choosing rather than after submitting.
  const itemTakenBy = useMemo(() => {
    const m = new Map<string, string>()
    for (const ci of creditItems) {
      const c = credits?.find(x => x.id === ci.credit_id)
      const key = ci.schedule_item_id ?? ci.panel_id
      if (key && c) m.set(key, c.buyer_name)
    }
    return m
  }, [creditItems, credits])

  const takenCategory = useMemo(() => new Map(grants.map(g => [g.category, g.buyer_name])), [grants])

  const addCredit = async () => {
    if (!eventId) return
    if (!newBuyer.trim()) { toast.error('Enter the buyer name.'); return }
    if (picked.size === 0) { toast.error('Tick at least one item this credit covers.'); return }
    const clash = [...picked].filter(id => itemTakenBy.has(id))
    if (clash.length > 0) {
      toast.error(`Already committed: ${clash.map(id => `${items.find(i => i.id === id)?.label} (${itemTakenBy.get(id)})`).join('; ')}`)
      return
    }
    setBusy('new')
    const res = await guardedWrite(
      supabase.from('presentation_credits').insert({
        event_id: eventId,
        buyer_name: newBuyer.trim(),
        amount: newInKind ? Math.round(Number(newAmount || 0) * 100) : Math.round(Number(newAmount || 0) * 100),
        is_in_kind: newInKind,
        based_on_tier: newTier.trim() || null,
        status: 'confirmed',
      }).select('id'),
      'Credit not created', 'admin/credits addCredit',
    )
    if (!res.ok) { setBusy(null); toast.error(res.error); return }
    const creditId = (res.data as { id: string }[])[0].id
    const rows = [...picked].map(id => {
      const it = items.find(i => i.id === id)!
      return { credit_id: creditId, schedule_item_id: it.kind === 'schedule' ? id : null, panel_id: it.kind === 'panel' ? id : null }
    })
    const itemsRes = await guardedWrite(
      supabase.from('presentation_credit_items').insert(rows).select('id'),
      'Credit created but its items were not attached', `admin/credits items credit=${creditId}`,
    )
    setBusy(null)
    if (!itemsRes.ok) {
      // Roll the credit back rather than leaving one that covers nothing - a
      // credit with no items renders nowhere and reads as a sale never made.
      await supabase.from('presentation_credits').delete().eq('id', creditId)
      toast.error(`${itemsRes.error} The credit was removed rather than left empty.`)
      return
    }
    setNewBuyer(''); setNewAmount(''); setNewTier(''); setNewInKind(false); setPicked(new Set())
    toast.success('Credit created'); load()
  }

  const removeCredit = async (c: Credit) => {
    if (!window.confirm(`Remove the credit for ${c.buyer_name}? Its items are released.`)) return
    setBusy(c.id)
    const res = await guardedWrite(
      supabase.from('presentation_credits').delete().eq('id', c.id).select('id'),
      'Credit not removed', `admin/credits remove id=${c.id}`,
    )
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Credit removed'); load()
  }

  const addGrant = async () => {
    if (!eventId) return
    if (!grantCategory) { toast.error('Choose a category.'); return }
    if (!grantBuyer.trim()) { toast.error('Enter the buyer name.'); return }
    // Checked BEFORE submit. The unique index is the guarantee; this is so the
    // operator sees the conflict while deciding, not as a failure afterwards.
    const held = takenCategory.get(grantCategory)
    if (held) { toast.error(`${exclusivityLabel(grantCategory)} is already held by ${held}. Remove that grant first if it has changed hands.`); return }
    setBusy('grant')
    const res = await guardedWrite(
      supabase.from('exclusivity_grants').insert({ event_id: eventId, category: grantCategory, buyer_name: grantBuyer.trim() }).select('id'),
      'Exclusive not recorded', `admin/credits addGrant ${grantCategory}`,
    )
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    setGrantCategory(''); setGrantBuyer('')
    toast.success('Exclusive recorded'); load()
  }

  const removeGrant = async (g: Grant) => {
    if (!window.confirm(`Release ${exclusivityLabel(g.category)} from ${g.buyer_name}?`)) return
    setBusy(g.id)
    const res = await guardedWrite(
      supabase.from('exclusivity_grants').delete().eq('id', g.id).select('id'),
      'Exclusive not released', `admin/credits removeGrant id=${g.id}`,
    )
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Released'); load()
  }

  const card = { backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }
  const input = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none'
  const inputStyle = { backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }

  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-bold text-white">Presentation Credits</h1>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed" style={{ color: '#999' }}>
        A credit is <strong className="text-white">one sale covering one or more items</strong>. The Tattoo Battle
        is three schedule rows and one credit, not three. Only the buyer name is ever public; amount, tier and
        notes are internal.
      </p>

      {failed && <p className="mt-6 rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>{failed}</p>}

      {!failed && (
        <>
          {/* ── existing credits ── */}
          <div className="mt-6 space-y-3">
            {(credits ?? []).map(c => {
              const mine = creditItems.filter(ci => ci.credit_id === c.id)
              return (
                <div key={c.id} className="rounded-2xl p-5" style={card}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-base font-bold text-white">{c.buyer_name}</p>
                    <span className="text-xs" style={{ color: '#C4A882' }}>
                      {c.is_in_kind ? `${formatCurrency(c.amount)} in kind` : formatCurrency(c.amount)}
                      {c.based_on_tier && ` · based on ${c.based_on_tier}`}
                    </span>
                  </div>
                  {/* ONE credit, N items - stated as a count so the relationship
                      is visible rather than implied by a list. */}
                  <p className="mt-2 text-xs font-semibold" style={{ color: '#999' }}>
                    Presents {mine.length} item{mine.length !== 1 ? 's' : ''}:
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {mine.map(ci => (
                      <li key={ci.id} className="text-xs" style={{ color: '#bbb' }}>
                        {items.find(i => i.id === (ci.schedule_item_id ?? ci.panel_id))?.label ?? '(item removed)'}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => removeCredit(c)} disabled={busy === c.id}
                          className="mt-3 text-xs underline disabled:opacity-50" style={{ color: '#fca5a5' }}>Remove credit</button>
                </div>
              )
            })}
            {credits?.length === 0 && <p className="text-sm" style={{ color: '#999' }}>No credits recorded.</p>}
          </div>

          {/* ── new credit ── */}
          <div className="mt-6 rounded-2xl p-5" style={card}>
            <p className="mb-3 text-sm font-semibold text-white">Record a credit</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={newBuyer} onChange={e => setNewBuyer(e.target.value)} placeholder="Buyer name" className={input} style={inputStyle} />
              <input value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="Value in dollars" className={input} style={inputStyle} />
              <input value={newTier} onChange={e => setNewTier(e.target.value)} placeholder="Based on tier (optional)" className={input} style={inputStyle} />
              <label className="flex items-center gap-2 text-xs" style={{ color: '#999' }}>
                <input type="checkbox" checked={newInKind} onChange={e => setNewInKind(e.target.checked)} />
                In kind (goods or services, no invoice)
              </label>
            </div>
            <p className="mt-4 mb-2 text-xs font-semibold" style={{ color: '#999' }}>
              Items this ONE credit covers - tick every row it presents
            </p>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg p-3" style={{ backgroundColor: '#141414' }}>
              {items.map(i => {
                const taken = itemTakenBy.get(i.id)
                return (
                  <label key={i.id} className="flex items-start gap-2 text-xs" style={{ color: taken ? '#666' : '#bbb' }}>
                    <input type="checkbox" disabled={Boolean(taken)} checked={picked.has(i.id)}
                           onChange={e => { const n = new Set(picked); if (e.target.checked) n.add(i.id); else n.delete(i.id); setPicked(n) }} />
                    <span>
                      {i.label}
                      {taken && <span style={{ color: '#C4A882' }}> - already presented by {taken}</span>}
                    </span>
                  </label>
                )
              })}
            </div>
            <button onClick={addCredit} disabled={busy === 'new'}
                    className="mt-4 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ backgroundColor: '#8B7355' }}>
              {busy === 'new' ? 'Saving...' : `Create credit covering ${picked.size} item${picked.size !== 1 ? 's' : ''}`}
            </button>
          </div>

          {/* ── exclusivity ── */}
          <h2 className="mt-10 font-display text-xl font-bold text-white">Exclusivity</h2>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed" style={{ color: '#999' }}>
            <strong className="text-white">Internal only.</strong> Never shown on the site and never in a public
            view. Recorded so the same exclusive cannot be sold twice - most likely next year, by someone who does
            not remember this one.
          </p>

          <div className="mt-4 space-y-2">
            {EXCLUSIVITY_CATEGORIES.map(cat => {
              const g = grants.find(x => x.category === cat.value)
              return (
                <div key={cat.value} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3" style={card}>
                  <span className="text-sm text-white">{cat.label}</span>
                  {g ? (
                    <span className="flex items-center gap-3">
                      <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: 'rgba(196,168,130,0.15)', color: '#C4A882' }}>
                        Held by {g.buyer_name}
                      </span>
                      <button onClick={() => removeGrant(g)} disabled={busy === g.id}
                              className="text-xs underline disabled:opacity-50" style={{ color: '#fca5a5' }}>Release</button>
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: '#4ade80' }}>Available</span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-4 rounded-2xl p-5" style={card}>
            <p className="mb-3 text-sm font-semibold text-white">Grant an exclusive</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <select value={grantCategory} onChange={e => setGrantCategory(e.target.value)} className={input} style={inputStyle}>
                <option value="">Choose a category</option>
                {EXCLUSIVITY_CATEGORIES.map(cat => {
                  const held = takenCategory.get(cat.value)
                  return (
                    <option key={cat.value} value={cat.value} disabled={Boolean(held)}>
                      {cat.label}{held ? ` - taken by ${held}` : ''}
                    </option>
                  )
                })}
              </select>
              <input value={grantBuyer} onChange={e => setGrantBuyer(e.target.value)} placeholder="Buyer name" className={input} style={inputStyle} />
            </div>
            <button onClick={addGrant} disabled={busy === 'grant'}
                    className="mt-3 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ backgroundColor: '#8B7355' }}>
              {busy === 'grant' ? 'Saving...' : 'Record exclusive'}
            </button>
            <p className="mt-3 text-xs" style={{ color: '#666' }}>
              A taken category cannot be chosen. Adding a NEW category is a code change in two places - see
              src/lib/exclusivity.ts.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
