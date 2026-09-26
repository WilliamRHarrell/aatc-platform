import { describe, it, expect } from 'vitest'
import { graphicsEligibility } from '@/lib/graphics-eligibility'

const app = (o: Partial<{ id: string; status: string; comped_at: string | null; directory_override: boolean }>) =>
  ({ id: 'a1', status: 'approved', comped_at: null, directory_override: false, ...o })

describe('graphicsEligibility', () => {
  it('no application: explain, do not error', () => {
    expect(graphicsEligibility([], [])).toBe('no-application')
  })
  it('pending or waitlisted: not yet', () => {
    expect(graphicsEligibility([app({ status: 'pending' })], [])).toBe('not-approved')
    expect(graphicsEligibility([app({ status: 'waitlisted' })], [])).toBe('not-approved')
  })
  it('approved but no deposit recorded: not yet', () => {
    expect(graphicsEligibility([app({})], [{ application_id: 'a1', deposit_paid_at: null }])).toBe('no-deposit')
  })
  it('approved with the deposit recorded: eligible', () => {
    expect(graphicsEligibility([app({})], [{ application_id: 'a1', deposit_paid_at: '2026-09-01T00:00:00Z' }])).toBe('eligible')
  })
  it('approved and comped: eligible (the comp settles the invoice)', () => {
    expect(graphicsEligibility([app({ comped_at: '2026-09-24T00:00:00Z' })], [])).toBe('eligible')
  })
  it('directory override counts, same as the public directory', () => {
    expect(graphicsEligibility([app({ directory_override: true })], [])).toBe('eligible')
  })
  it('one eligible application among several is enough', () => {
    expect(graphicsEligibility([app({ id: 'x', status: 'rejected' }), app({ id: 'y', comped_at: 'now' })], [])).toBe('eligible')
  })
})
