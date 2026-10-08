import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DECISIONS, DECISION_EMAIL_KEYS, decisionRefusal, isDecision, capLabel, capReached, releaseRefusal } from '@/lib/food-truck-decision'
import { defaultsFor } from '@/content/registry'

describe('food truck decisions', () => {
  it('moves pending, waitlisted and not selected trucks to any other decision', () => {
    for (const from of ['pending', 'waitlisted', 'not_selected']) {
      for (const to of DECISIONS) {
        if (from === to) expect(decisionRefusal(from, to), `${from} -> ${to}`).toBeTruthy()
        else expect(decisionRefusal(from, to), `${from} -> ${to}`).toBeNull()
      }
    }
  })
  it('never moves an approved or released truck from here (Release is PR 2)', () => {
    for (const to of DECISIONS) {
      expect(decisionRefusal('approved', to)).toBeTruthy()
      expect(decisionRefusal('released', to)).toBeTruthy()
    }
  })
  it('releases only a selected truck', () => {
    expect(releaseRefusal('approved')).toBeNull()
    for (const from of ['pending', 'waitlisted', 'not_selected', 'released']) expect(releaseRefusal(from), from).toBeTruthy()
  })
  it('accepts only the three decisions', () => {
    expect(isDecision('approved')).toBe(true)
    expect(isDecision('pending')).toBe(false)
    expect(isDecision('released')).toBe(false)
  })
  it('every decision email has its subject and body in the content editor', () => {
    const c = defaultsFor('foodTruckApply')
    for (const d of DECISIONS) {
      expect(c[DECISION_EMAIL_KEYS[d].subject], d).toBeTruthy()
      expect(c[DECISION_EMAIL_KEYS[d].body], d).toBeTruthy()
    }
  })
  it('the cap counts approved trucks and stops at the cap', () => {
    expect(capLabel(6, 8)).toBe('6 of 8 selected')
    expect(capLabel(8, 8)).toBe('8 of 8 selected (full)')
    expect(capReached(7, 8)).toBe(false)
    expect(capReached(8, 8)).toBe(true)
  })
  it('the route maps the trigger hint FOOD_TRUCK_CAP that 091 raises', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/091_food_truck_applications.sql'), 'utf8')
    const route = readFileSync(join(process.cwd(), 'src/app/api/admin/food-trucks/decision/route.ts'), 'utf8')
    expect(sql).toContain("hint = 'FOOD_TRUCK_CAP'")
    expect(route).toContain("'FOOD_TRUCK_CAP'")
    expect(sql).toContain("check (status in ('pending', 'approved', 'waitlisted', 'not_selected', 'released'))")
  })
})
