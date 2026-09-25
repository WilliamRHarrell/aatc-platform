import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 075: the public read of applications is the view
 * applications_public, never the table. Three rules, read from source:
 *  1. the directory pages read the view;
 *  2. the view's column list (parsed from the migration) covers every column
 *     the directory pages select or filter on, and carries none of the
 *     withheld ones;
 *  3. only the known owner/admin/server files read the table directly.
 */
const ROOT = process.cwd()
const DIRECTORY = ['src/app/directory/page.tsx', 'src/app/directory/artists/page.tsx', 'src/app/directory/[id]/page.tsx']
const WITHHELD = ['email', 'contact_name', 'notes', 'total_amount', 'id_doc_url', 'veteran_id_url', 'user_id', 'comped_at', 'comped_by',
  'approved_at', 'deposit_due_at', 'final_due_at', 'veteran_doc_verified_at', 'veteran_doc_verified_by', 'other_links', 'add_ons',
  'artists_ids_later', 'is_veteran', 'needs_roster', 'directory_override']

function viewColumns(): string[] {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/075_applications_public_view.sql'), 'utf8')
  const body = sql.slice(sql.indexOf('create or replace view public.applications_public'), sql.indexOf('from public.applications a'))
  // Columns appear as `a.name` or `... end as name`.
  const cols = new Set<string>()
  for (const m of body.matchAll(/\ba\.([a-z_]+)/g)) cols.add(m[1])
  for (const m of body.matchAll(/\bas ([a-z_]+)/g)) cols.add(m[1])
  return [...cols]
}

function selectedColumns(file: string): string[] {
  const text = readFileSync(join(ROOT, file), 'utf8')
  // The applications query only: from its .from( to the next .from( (the booths read).
  const start = text.indexOf(".from('applications_public')")
  const nextFrom = text.indexOf('.from(', start + 1)
  const query = text.slice(start, nextFrom === -1 ? undefined : nextFrom)
  const i = query.indexOf('.select(')
  const list = query.slice(i + 8, query.indexOf(')', i)).replace(/['"`\s]/g, '')
  const filters = [...query.matchAll(/\.eq\('([a-z_]+)'/g)].map(m => m[1])
  return [...new Set([...list.split(','), ...filters])].filter(Boolean)
}

describe('directory reads the view', () => {
  for (const f of DIRECTORY) {
    it(`${f} reads applications_public and not the table`, () => {
      const text = readFileSync(join(ROOT, f), 'utf8')
      expect(text).toContain(".from('applications_public')")
      expect(text).not.toContain(".from('applications')")
    })
  }
})

describe('the view is the directory column list', () => {
  const cols = viewColumns()
  it('covers every column the directory selects or filters on', () => {
    for (const f of DIRECTORY) for (const c of selectedColumns(f)) expect(cols, `${f}: ${c}`).toContain(c)
  })
  it('carries none of the withheld columns', () => {
    for (const c of WITHHELD) expect(cols, c).not.toContain(c)
  })
  it('has 20 columns', () => { expect(cols).toHaveLength(20) })
})

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(p)
  }
  return out
}

describe('only owner, admin and server code reads the applications table', () => {
  it('no public-facing file reads the table directly', () => {
    // /apply/artist and /apply/vendor INSERT as the signed-in owner ("applications: own insert"); not a read.
    const allowed = [/^src\/app\/admin\//, /^src\/app\/api\//, /^src\/app\/portal\//, /^src\/app\/apply\//, /^src\/components\/admin\//, /^src\/components\/portal\//, /^src\/lib\/db-write\.ts$/, /^src\/lib\/placement-check\.ts$/]
    const offenders = walk(join(ROOT, 'src'))
      .map(f => f.replace(ROOT + '/', ''))
      .filter(f => readFileSync(join(ROOT, f), 'utf8').includes(".from('applications')"))
      .filter(f => !allowed.some(re => re.test(f)))
    expect(offenders).toEqual([])
  })
})
