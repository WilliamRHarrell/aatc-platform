import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { boothSlotCount } from '@/lib/booth-display'

/**
 * assign_booths() (migration 086) caps an assignment at the slots paid for,
 * computed in SQL. boothSlotCount() computes the same number for the slot
 * inputs on /admin/booths/[id]. If the two drift, the page offers slots the
 * database refuses (or the reverse). This pins them together.
 */
const sql = readFileSync(join(process.cwd(), 'supabase/migrations/086_assign_booths.sql'), 'utf8').toLowerCase()
const page = readFileSync(join(process.cwd(), 'src/app/admin/booths/[id]/page.tsx'), 'utf8')

const base = { booth_size: null, artist_single_qty: 0, artist_double_qty: 0, vendor_single_qty: 0, vendor_double_qty: 0 }

describe('booth slot count: SQL and TypeScript agree', () => {
  it('2026 rows: booth_size single/double/triple/quad = 1/2/3/4 in both', () => {
    for (const [size, n] of [['single', 1], ['double', 2], ['triple', 3], ['quad', 4]] as const) {
      expect(boothSlotCount({ ...base, booth_size: size })).toBe(n)
      expect(sql).toMatch(new RegExp(`when '${size}' then ${n}\\b`))
    }
  })
  it('2027 rows: singles count 1, doubles count 2, in both', () => {
    expect(boothSlotCount({ ...base, artist_single_qty: 1, artist_double_qty: 2, vendor_single_qty: 3, vendor_double_qty: 1 })).toBe(1 + 4 + 3 + 2)
    expect(sql).toContain('coalesce(v_app.artist_single_qty, 0) + coalesce(v_app.artist_double_qty, 0) * 2')
    expect(sql).toContain('coalesce(v_app.vendor_single_qty, 0) + coalesce(v_app.vendor_double_qty, 0) * 2')
  })
  it('only MORE booths than slots is refused (a partial assignment saves)', () => {
    expect(sql).toContain('if cardinality(v_nums) > v_slots then')
  })
})

describe('Assign Booth writes only through assign_booths()', () => {
  it('the page calls the function and never updates booths rows itself', () => {
    expect(page).toContain(".rpc('assign_booths'")
    expect(page).not.toMatch(/from\('booths'\)\s*\.update\(/)
  })
  it('the function is event-scoped and refuses not-sellable booths', () => {
    expect(sql).toContain('b.event_id = v_app.event_id')
    expect(sql).toContain('not b.is_sellable')
  })
})
