import { describe, it, expect } from 'vitest'
import { applicationReceiptFacts } from '@/lib/application-receipt'

const vendor = {
  business_name: 'Skin Reserve', contact_name: 'Ryan', email: 'r@x.com', phone: null,
  exhibitor_type: 'vendor' as const, booth_size: null,
  artist_single_qty: 0, artist_double_qty: 0, vendor_single_qty: 1, vendor_double_qty: 0, corner_count: 1,
  artist_count: 0, is_veteran: false, total_amount: 60000,
}

describe('applicationReceiptFacts', () => {
  it('describes a vendor application with the list price in dollars', () => {
    const f = applicationReceiptFacts(vendor)
    expect(f.kind).toBe('Vendor')
    expect(f.booths).toContain('1')
    expect(f.total).toBe('$600.00')
    expect(f.veteranClaimed).toBe(false)
    expect(f.artistCount).toBe(0)
  })
  it('describes an artist application and its claimed veteran discount', () => {
    const f = applicationReceiptFacts({ ...vendor, exhibitor_type: 'artist', artist_single_qty: 2, vendor_single_qty: 0, artist_count: 3, is_veteran: true, total_amount: 155000 })
    expect(f.kind).toBe('Artist')
    expect(f.artistCount).toBe(3)
    expect(f.veteranClaimed).toBe(true)
    expect(f.total).toBe('$1,550.00')
  })
})
