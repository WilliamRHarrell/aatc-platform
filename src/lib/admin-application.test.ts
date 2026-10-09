import { describe, it, expect } from 'vitest'
import { planApplication, likeExact, samePricingInputs, type EditorInput } from '@/lib/admin-application'
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
  it('needs_roster until every artist is listed; ID documents do not count', () => {
    const r = planApplication({ ...base, artists: [{ name: 'A One' }] })
    expect(r.ok && r.plan.row.needs_roster).toBe(true)
    const noIds = planApplication({ ...base, artists: [{ name: 'A One' }, { name: 'B Two' }] })
    expect(noIds.ok && noIds.plan.row.needs_roster).toBe(false)
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
    // a vendor ID never affects the directory (Ryan, 2026-10-09; reverts #102)
    expect(v.ok && v.plan.row).toMatchObject({ artists: null, artist_count: 0, artist_single_qty: 0, needs_roster: false })
  })
  it('editing only ever clears needs_roster', () => {
    const incomplete = { ...base, artists: [{ name: 'A One', id_url: 'p' }] }
    // a listed row whose roster predates the rule stays listed
    expect((r => r.ok && r.plan.row.needs_roster)(planApplication(incomplete, { needs_roster: false, artist_count: 2 }))).toBe(false)
    // completing the roster clears it
    expect((r => r.ok && r.plan.row.needs_roster)(planApplication(base, { needs_roster: true, artist_count: 2 }))).toBe(false)
    // still incomplete: stays set
    expect((r => r.ok && r.plan.row.needs_roster)(planApplication(incomplete, { needs_roster: true, artist_count: 2 }))).toBe(true)
  })
  it('an existing artist row with no artist count may stay at 0; a new one may not', () => {
    const zero = { ...base, artist_count: 0, artists: [] }
    expect(planApplication(zero).ok).toBe(false)
    const kept = planApplication(zero, { needs_roster: true, artist_count: 0 })
    expect(kept.ok && kept.plan.row).toMatchObject({ artist_count: 0, needs_roster: true })
  })
  it('keeps artist keys the editor does not edit, never verification keys', () => {
    const r = planApplication({ ...base, artists: [{ name: 'A One', id_url: 'p', extra: { uid: 'u1', id_verified_at: 'x', id_verified_by: 'y' } }, { name: 'B', id_later: true }] })
    const a0 = r.ok ? (r.plan.row.artists as Record<string, unknown>[])[0] : {}
    expect(a0).toMatchObject({ uid: 'u1', name: 'A One' })
    expect(a0).not.toHaveProperty('id_verified_at')
    expect(a0).not.toHaveProperty('id_verified_by')
  })
  it('keeps every style an artist picked (the public form allows all of them)', () => {
    const styles = ['American Traditional', 'Neo-Traditional', 'Japanese', 'Realism', 'Watercolor', 'Blackwork', 'Dotwork', 'Geometric', 'Tribal',
      'New School', 'Illustrative', 'Fine Line', 'Surrealism', 'Horror / Dark Art', 'Biomechanical', 'Lettering / Script', 'Floral', 'Minimalist']
    const r = planApplication({ ...base, artists: [{ name: 'A', id_later: true, styles }, { name: 'B', id_later: true }] })
    expect(r.ok && (r.plan.row.artists as { styles: string[] }[])[0].styles).toHaveLength(18)
  })
  it("'keep' is a status the planner accepts (the route allows it only when editing)", () => {
    expect(planApplication({ ...base, status: 'keep' }).ok).toBe(true)
  })
  it('TV show name is kept only with Yes', () => {
    const r = planApplication({ ...base, tv_show_featured: false, tv_show: 'Ink Master' })
    expect(r.ok && r.plan.row.tv_show).toBeNull()
  })
  it('the application-level TV answer is written only when sent (the editor asks per artist)', () => {
    const r = planApplication(base)
    expect(r.ok && 'tv_show_featured' in r.plan.row).toBe(false)
    expect(r.ok && 'tv_show' in r.plan.row).toBe(false)
  })
  it('per-artist TV: Yes/No kept, the show dropped with No', () => {
    const r = planApplication({ ...base, artists: [{ name: 'A', tv_featured: true, tv_credit: 'Ink Master' }, { name: 'B', tv_featured: false, tv_credit: 'stale' }] })
    const roster = r.ok ? (r.plan.row.artists as { tv_featured: boolean | null; tv_credit: string }[]) : []
    expect(roster[0]).toMatchObject({ tv_featured: true, tv_credit: 'Ink Master' })
    expect(roster[1]).toMatchObject({ tv_featured: false, tv_credit: '' })
  })
  it('artists_ids_later follows the roster; a vendor never has it', () => {
    const r = planApplication(base)
    expect(r.ok && r.plan.row.artists_ids_later).toBe(true)
    const none = planApplication({ ...base, artists: [{ name: 'A One', id_url: 'p1' }, { name: 'B Two', id_url: 'p2' }] })
    expect(none.ok && none.plan.row.artists_ids_later).toBe(false)
  })
  it('document paths are written only when the input carries them', () => {
    const omit = planApplication({ ...base, exhibitor_type: 'vendor', vendor_single_qty: 1 })
    expect(omit.ok && 'id_doc_url' in omit.plan.row).toBe(false)
    expect(omit.ok && 'veteran_id_url' in omit.plan.row).toBe(false)
    const vendor = planApplication({ ...base, exhibitor_type: 'vendor', vendor_single_qty: 1, id_doc_url: 'admin/x/id.jpg', is_veteran: true, veteran_id_url: 'admin/x/vet.pdf' })
    expect(vendor.ok && vendor.plan.row).toMatchObject({ id_doc_url: 'admin/x/id.jpg', veteran_id_url: 'admin/x/vet.pdf' })
    // an artist row's id_doc_url (booth holder ID from the portal) is never written; a veteran doc is dropped when the box is unticked
    const artist = planApplication({ ...base, id_doc_url: 'admin/x/id.jpg', veteran_id_url: 'admin/x/vet.pdf' })
    expect(artist.ok && 'id_doc_url' in artist.plan.row).toBe(false)
    expect(artist.ok && artist.plan.row.veteran_id_url).toBeNull()
  })
  it('the vendor ID is optional for admin', () => {
    expect(planApplication({ ...base, exhibitor_type: 'vendor', vendor_single_qty: 1, id_doc_url: null }).ok).toBe(true)
  })
  it('samePricingInputs compares the order, not a recomputed total', () => {
    const a = { exhibitor_type: 'artist', artist_single_qty: 1, artist_double_qty: 0, vendor_single_qty: 0, vendor_double_qty: 0, corner_count: 0, artist_count: 2, is_veteran: false,
      add_ons: [{ kind: 'tattoo_bed', term: 'weekend', qty: 1 }, { kind: 'extra_table', term: null, qty: 1 }] }
    expect(samePricingInputs(a, { ...a, artist_double_qty: null, add_ons: [{ kind: 'extra_table', qty: 1 }, { kind: 'tattoo_bed', term: 'weekend', qty: 1 }, { kind: 'arm_rest', term: 'daily', qty: 0 }] })).toBe(true)
    expect(samePricingInputs(a, { ...a, corner_count: 1 })).toBe(false)
    expect(samePricingInputs(a, { ...a, add_ons: [] })).toBe(false)
    expect(samePricingInputs(a, { ...a, is_veteran: true })).toBe(false)
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

describe('the editor form (PR 2)', () => {
  const form = readFileSync(join(process.cwd(), 'src/components/admin/ApplicationEditorForm.tsx'), 'utf8')
  it('saves through the editor route and resends a below-list total only after Confirm', () => {
    expect(form).toContain("fetch('/api/admin/applications/editor'")
    expect(form).toContain('if (json.needsConfirm)')
    expect(form).toContain('setConfirmedBelowList(true); void save(true)')
  })
  it('keeps IDs private under admin/<id>/ and media public under <id>/', () => {
    expect(form).toContain("from('application-docs').upload(path, f)")
    expect(form).toContain('`admin/${id}/artist-${i + 1}-id-${ts}')
    expect(form).toContain('`admin/${id}/id-${ts}')
    expect(form).toContain('`admin/${id}/veteran-id-${ts}')
    expect(form).toContain('`${id}/artists/${i}/photo-${ts}')
    expect(form).toContain('`${id}/artists/${i}/${ts}-${j}')
    expect(form).not.toMatch(/upsert:\s*true/)
  })
  it('verifies IDs only through set_artist_id_verified', () => {
    expect(form).toContain("rpc('set_artist_id_verified'")
    expect(form).not.toContain('id_verified_at:')
  })
  it('is reachable from /admin/applications, which opens ?open=<id>', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/admin/applications/page.tsx'), 'utf8')
    expect(page).toContain('href="/admin/applications/new"')
    expect(page).toContain(".get('open')")
  })
})

describe('tattoo styles have one home', () => {
  it('no page carries its own list', () => {
    for (const f of ['src/app/apply/artist/ArtistApplyForm.tsx', 'src/app/portal/page.tsx', 'src/app/admin/booths/[id]/page.tsx', 'src/app/directory/artists/page.tsx', 'src/components/admin/ApplicationEditorForm.tsx']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).not.toContain('const TATTOO_STYLES')
      expect(src, f).toContain("from '@/lib/tattoo-styles'")
    }
  })
})

describe('editor PR 3: edit any application', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
  it('the drawer (every application) and the booth page link to the editor', () => {
    expect(read('src/app/admin/applications/page.tsx')).toContain('href={`/admin/applications/${app.id}/edit`}')
    expect(read('src/app/admin/booths/[id]/page.tsx')).toContain('href={`/admin/applications/${app.id}/edit`}')
    expect(read('src/app/admin/applications/[id]/edit/page.tsx')).toContain('<ApplicationEditorForm key={initial.id} initial={initial} />')
  })
  it('the route keeps the stored price, comp and invoice while the order is unchanged', () => {
    const route = read('src/app/api/admin/applications/editor/route.ts')
    expect(route).toContain('if (existing && !orderChanged) { delete row.total_amount; delete row.agreed_total }')
    expect(route).toContain('if (orderChanged && (comp || hadComp)) {')
    expect(route).toContain('} else if (orderChanged && current && !comped && current.amount !== amount) {')
    expect(route).toContain("if (body.input.status === 'keep' && !id)")
    expect(route).toContain('order: stored } : undefined)')
  })
  it('the form locks the order once money is recorded and carries unedited artist keys', () => {
    const form = read('src/components/admin/ApplicationEditorForm.tsx')
    expect(form).toContain('const priceLocked = (initial?.invoice?.amount_paid ?? 0) > 0')
    expect(form).toContain('extra: a.extra')
    expect(form).toContain("...(isArtist ? {} : { id_doc_url: refs.idDoc })")
  })
})
