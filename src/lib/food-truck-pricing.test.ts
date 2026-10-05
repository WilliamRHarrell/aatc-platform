import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FOOD_TRUCK_PRICE_BY_DAYS, foodTruckPrice } from '@/lib/food-truck-pricing'

describe('food truck pricing', () => {
  it('1 day $100, 2 days $200, the full weekend $250 (2026-10-05)', () => {
    expect([1, 2, 3].map(foodTruckPrice)).toEqual([10000, 20000, 25000])
    expect(() => foodTruckPrice(0)).toThrow()
  })
  it('reconcile block G uses the same prices (both case expressions)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/verify/reconcile_approved_without_invoice.sql'), 'utf8')
    const g = sql.slice(sql.indexOf('select t.id'), sql.indexOf('-- ── H.'))
    const blocks = [...g.matchAll(/case array_length\(t\.days, 1\)([\s\S]*?)end/g)].map(m => m[1])
    expect(blocks).toHaveLength(2)
    for (const b of blocks) {
      const pairs = Object.fromEntries([...b.matchAll(/when (\d) then (\d+)/g)].map(m => [Number(m[1]), Number(m[2])]))
      expect(pairs).toEqual(FOOD_TRUCK_PRICE_BY_DAYS)
    }
  })
  it('the admin page has no price map of its own', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/admin/food-trucks/page.tsx'), 'utf8')
    expect(page).not.toMatch(/\{\s*1:\s*\d+,\s*2:\s*\d+,\s*3:\s*\d+\s*\}/)
  })
})
