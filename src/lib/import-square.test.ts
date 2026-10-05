import { describe, it, expect } from 'vitest'
import { join } from 'node:path'

/**
 * scripts/import-square-2027.mjs, against a made-up sheet (no customer data):
 * parsing, the 25% deposit rule dated by the payment that crossed it, the
 * override, and the refusals. The SQL itself is exercised with verify:local.
 */
const HDR = 'Invoice #,Issued,Contact,Business / display name,Email,Phone,Type,Artist single,Artist double,Vendor single,Vendor double,Food truck,Corners,Permits (artists),Add-ons,Line items as invoiced,Discounts,Invoiced ($),Paid ($),Balance ($),"Payments (date, method, amount)",Balance due,Flag / question,YOUR DECISION'
const sheet = (...rows: string[]) => ['Title,,', '"Instructions, with a comma",,', ',,', HDR, ...rows, ',,,,,,,,,,,,,,,,Totals,$1,,,,,,'].join('\n')
const row = (o: Partial<Record<string, string>>) => {
  const d: Record<string, string> = { inv: '#1', issued: '2026-04-20', contact: 'Test Person', biz: 'Test Shop', email: 'test@example.com', type: 'artist', as: '1', ad: '0', vs: '0', vd: '0', ft: '0', corners: '0', permits: '1', addons: '', invoiced: '$850.00', paid: '$250.00', balance: '$600.00', payments: '2026-04-21 Visa $200.00; 2026-04-25 Visa $50.00', due: '2027-01-01', decision: 'import', ...o }
  return [d.inv, d.issued, d.contact, d.biz, d.email, '', d.type, d.as, d.ad, d.vs, d.vd, d.ft, d.corners, d.permits, `"${d.addons}"`, '"lines"', '', `"${d.invoiced}"`, `"${d.paid}"`, `"${d.balance}"`, `"${d.payments}"`, d.due, '', d.decision].join(',')
}
const load = async () => (await import(/* @vite-ignore */ join(process.cwd(), 'scripts/import-square-2027.mjs'))) as {
  buildRows: (csv: string, ov: unknown) => { rows: Array<Record<string, unknown>>; problems: string[] }
}

describe('Square import generator', () => {
  it('deposit at 25% (rounded up), dated by the payment that crossed it', async () => {
    const { buildRows } = await load()
    const { rows, problems } = buildRows(sheet(row({})), { rows: {} })
    expect(problems).toEqual([])
    // $850: 25% = $212.50. $200 on 04-21 is short; $250 total on 04-25 crosses it.
    expect(rows[0]).toMatchObject({ depositAt: '2026-04-25', finalAt: null, invoiced: 85000, paid: 25000 })
  })
  it('an override honours a smaller deposit, and names can be corrected', async () => {
    const { buildRows } = await load()
    const { rows } = buildRows(sheet(row({ biz: 'Shop (confirm name)', payments: '2026-04-27 Visa $250.00' })), { rows: { '#1': { business_name: 'Shop', deposit_paid_at: '2026-04-27' } } })
    expect(rows[0]).toMatchObject({ business: 'Shop', depositAt: '2026-04-27' })
  })
  it('add-ons map to our kinds; food trucks and the totals row are handled', async () => {
    const { buildRows } = await load()
    const { rows, problems } = buildRows(sheet(
      row({ addons: 'Armrest weekend x1 ($80); Tattoo bed weekend x1 ($150)' }),
      row({ inv: '#2', email: 'truck@example.com', type: 'food truck', as: '0', ft: '1', permits: '0', invoiced: '$250.00', paid: '$0.00', balance: '$250.00', payments: 'none' }),
      row({ inv: '#3', email: 'skip@example.com', decision: 'skip' }),
    ), { rows: {} })
    expect(problems).toEqual([])
    expect(rows.map(r => r.invoice)).toEqual(['#1', '#2'])
    expect(rows[0].addOns).toEqual([{ kind: 'arm_rest', qty: 1, term: 'weekend' }, { kind: 'tattoo_bed', qty: 1, term: 'weekend' }])
    expect(rows[1]).toMatchObject({ kind: 'food_truck', depositAt: null })
  })
  it('refuses unresolved names, totals that do not add up, payments that do not match, unknown add-ons', async () => {
    const { buildRows } = await load()
    const bad = buildRows(sheet(
      row({ biz: 'Name?' }),
      row({ inv: '#2', email: 'b@example.com', balance: '$500.00' }),
      row({ inv: '#3', email: 'c@example.com', payments: '2026-04-21 Visa $10.00' }),
      row({ inv: '#4', email: 'd@example.com', addons: 'Hot tub x1' }),
      row({ inv: '#5', email: 'test@example.com' }),
    ), { rows: {} })
    expect(bad.rows).toEqual([])
    expect(bad.problems.join('\n')).toMatch(/#5: same email as another imported row/)
    expect(bad.problems.join('\n')).toMatch(/#1: business name still unresolved/)
    expect(bad.problems.join('\n')).toMatch(/#2: paid .* \+ balance .* != invoiced/)
    expect(bad.problems.join('\n')).toMatch(/#3: payments add up to/)
    expect(bad.problems.join('\n')).toMatch(/#4: unknown add-on/)
  })
})
