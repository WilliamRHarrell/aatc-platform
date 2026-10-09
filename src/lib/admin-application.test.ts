import { describe, it, expect } from 'vitest'
import { planApplication, likeExact, type EditorInput } from '@/lib/admin-application'
import { calculatePricing } from '@/lib/pricing'

const base: EditorInput = {
  exhibitor_type: 'artist', business_name: ' Shop ', contact_name: 'Sam', email: 'Sam@Example.com',
  artist_single_qty: 1, artist_count: 2, status: 'pending', money: { mode: 'standard' },
  artists: [{ name: 'A One', id_url: 'admin/x/a1.jpg' }, { name: 'B Two', id_later: true }],
}
const list = calculatePricing({ exhibitorType: 'artist', artistSingleQty: 1, artistDoubleQty: 0, vendorSingleQty: 0, vendorDoubleQty: 0, cornerCount: 0, artistCount: 2, isVeteran: false, addOns: [] }).total

describe('planApplication', () => {
  it('prices from the shared pricing, keeps total_amount at list, lowercases email, trims', () => {
    const r = planApplication(base)
    expect(r.ok).toBe(true); if (!r.ok) return
    expect(r.plan.row).toMatchObject({ business_name: 'Shop', email: 'sam@example.com', total_amount: list, agreed_total: null, needs_roster: false })
    expect(r.plan.invoiceCents).toBe(list)
  })
  it('enforces the 2-per-single cap and the roster length', () => {
    const over = planApplication({ ...base, artist_count: 3 })
    expect(!over.ok && over.errors.artist_count).toMatch(/At most 2/)
    const long = planApplication({ ...base, artist_count: 1 })
    expect(!long.ok && long.errors.artists).toBeTruthy()
  })
  it('needs_roster until every artist has an ID or ID later and the roster is full', () => {
    const r = planApplication({ ...base, artists: [{ name: 'A One' }] })
    expect(r.ok && r.plan.row.needs_roster).toBe(true)
  })
  it('custom total below list asks for confirmation; confirmed or above list goes through', () => {
    const ask = planApplication({ ...base, money: { mode: 'custom', totalCents: list - 1 } })
    expect(!ask.ok && ask.needsConfirm).toBe(true)
    const yes = planApplication({ ...base, money: { mode: 'custom', totalCents: list - 1, confirmedBelowList: true } })
    expect(yes.ok && yes.plan.row.agreed_total).toBe(list - 1)
    const above = planApplication({ ...base, money: { mode: 'custom', totalCents: list + 5000 } })
    expect(above.ok && above.plan.invoiceCents).toBe(list + 5000)
  })
  it('comp choices hand the invoice to set_comp', () => {
    const c = planApplication({ ...base, money: { mode: 'comp_all' } })
    expect(c.ok && c.plan.comp).toEqual({ booth: true, permits: true })
    expect(c.ok && c.plan.invoiceCents).toBeNull()
    expect(c.ok && c.plan.row.agreed_total).toBeNull()
  })
  it('a vendor has no roster and no artist fields', () => {
    const v = planApplication({ ...base, exhibitor_type: 'vendor', vendor_single_qty: 1, artists: [{ name: 'x' }] })
    expect(v.ok && v.plan.row).toMatchObject({ artists: null, artist_count: 0, artist_single_qty: 0, tv_show_featured: null, needs_roster: false })
  })
  it('TV show name is kept only with Yes', () => {
    const r = planApplication({ ...base, tv_show_featured: false, tv_show: 'Ink Master' })
    expect(r.ok && r.plan.row.tv_show).toBeNull()
  })
  it('escapes LIKE wildcards in an email', () => {
    expect(likeExact('a_b%c@x.com')).toBe('a\\_b\\%c@x.com')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
describe('Approve and the editor route honour agreed_total (096)', () => {
  it('the drawer invoices the agreed total and hides the discount box for it', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/admin/applications/page.tsx'), 'utf8')
    expect(page).toContain('const agreed = !comped && app.agreed_total != null ? app.agreed_total : null')
    expect(page).toContain('{!comped && agreed === null && <div')
  })
  it('the route is admin-only, checks the email for duplicates and comps through set_comp', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/admin/applications/editor/route.ts'), 'utf8')
    expect(route).toContain("profile?.role !== 'admin'")
    expect(route).toContain(".ilike('email', likeExact(")
    expect(route).toContain("rpc('set_comp'")
    expect(route).toContain('user_id: null')
  })
})
