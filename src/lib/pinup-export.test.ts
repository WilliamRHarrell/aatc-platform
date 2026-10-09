import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PINUP_FIELDS, PINUP_SELECT, csvCell, pinupCsv, type PinupEntry } from '@/lib/pinup-export'

const ENTRY: PinupEntry = {
  id: 'e1', event_id: 'ev', full_name: 'Test Entrant', stage_name: null, email: 't@example.com', phone: '(910) 555-0100',
  address: null, notes: null, age_confirmed: true, likeness_release: true, likeness_release_at: '2026-10-08T23:00:00Z',
  marketing_opt_in: true, marketing_opt_in_at: '2026-10-08T23:00:00Z', marketing_opt_in_source: 'pinup_form',
  status: 'confirmed', created_at: '2026-10-08T23:00:00Z', updated_at: '2026-10-08T23:00:00Z',
}

describe('pinup fields', () => {
  it('every column the migrations give pinup_entries is listed, selected and exported', () => {
    const dir = join(process.cwd(), 'supabase/migrations')
    const sql = readdirSync(dir).filter(f => /^\d+/.test(f)).map(f => readFileSync(join(dir, f), 'utf8')).join('\n')
    const cols = new Set<string>()
    const create = sql.slice(sql.indexOf('create table if not exists public.pinup_entries'))
    for (const m of create.slice(0, create.indexOf(');')).matchAll(/^\s+([a-z_]+)\s+(uuid|text|boolean|timestamptz|int)/gm)) cols.add(m[1])
    for (const m of sql.matchAll(/alter table (?:public\.)?pinup_entries\s+add column if not exists ([a-z_]+)/g)) cols.add(m[1])
    for (const m of sql.matchAll(/alter table (?:public\.)?pinup_entries[^;]*?add column if not exists ([a-z_]+)[^;]*?(?:,\s*add column if not exists ([a-z_]+))?/g)) { cols.add(m[1]); if (m[2]) cols.add(m[2]) }
    expect(cols.has('likeness_release_at')).toBe(true)
    const listed = new Set(PINUP_FIELDS.map(f => f.key))
    const selected = new Set(PINUP_SELECT.split(',').map(s => s.trim()))
    for (const c of cols) {
      if (c === 'event_id') continue // one event; not useful to the stage manager
      expect(listed.has(c), `field list misses ${c}`).toBe(true)
      expect(selected.has(c), `select misses ${c}`).toBe(true)
    }
  })
})

describe('CSV', () => {
  it('a header and one row per entry, empty optional fields stay empty', () => {
    const csv = pinupCsv([ENTRY])
    expect(csv.startsWith('﻿Full name,Stage name,Status,')).toBe(true)
    const [, row] = csv.slice(1).split('\r\n')
    expect(row.startsWith('Test Entrant,,confirmed,t@example.com,(910) 555-0100,,,Yes,Yes,')).toBe(true)
  })
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('12 Main St, Apt 3')).toBe('"12 Main St, Apt 3"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })
  it('neutralises spreadsheet formulas typed into the public form', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1 910 555 0100')).toBe(`"'+1 910 555 0100"`)
    expect(csvCell('@stage')).toBe(`"'@stage"`)
    expect(csvCell('Miss Rosie')).toBe('Miss Rosie')
  })
})

describe('panel', () => {
  it('notes appear only when an entry has them (the public form has no notes field)', () => {
    const notes = PINUP_FIELDS.find(f => f.key === 'notes')!
    expect(notes.onlyIfSet).toBe(true)
    expect(notes.value(ENTRY)).toBe('')
    expect(notes.value({ ...ENTRY, notes: 'arrives late' })).toBe('arrives late')
    const page = readFileSync(join(process.cwd(), 'src/app/admin/pinup/page.tsx'), 'utf8')
    expect(page).toContain('!f.onlyIfSet || f.value(open)')
  })
})
