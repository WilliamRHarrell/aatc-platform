
describe('addOnLines (admin display, 2026-10-09)', () => {
  it('lists what was ordered with the same prices the total charges', () => {
    const addOns = [
      { kind: 'tattoo_bed' as const, term: 'weekend' as const, qty: 2 },
      { kind: 'extra_table' as const, term: null, qty: 1 },
      { kind: 'arm_rest' as const, term: 'daily' as const, qty: 0 },
    ]
    const lines = addOnLines(addOns)
    expect(lines.map(l => l.label)).toEqual(['Tattoo Bed weekend (2 × $150)', 'Extra Table (1 × $50)'])
    const p = calculatePricing({ exhibitorType: 'vendor', artistSingleQty: 0, artistDoubleQty: 0, vendorSingleQty: 1, vendorDoubleQty: 0, cornerCount: 0, artistCount: 0, isVeteran: false, addOns } as never)
    expect(p.addOnsTotal).toBe(lines.reduce((s, l) => s + l.amount, 0))
  })
  it('tolerates a missing or malformed column', () => {
    expect(addOnLines(null)).toEqual([])
    expect(addOnLines([{ kind: 'nope', term: null, qty: 3 }] as never)).toEqual([])
  })
})
