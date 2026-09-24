import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Supabase grants EXECUTE on every new function in `public` to anon,
 * authenticated and service_role via ALTER DEFAULT PRIVILEGES. `revoke all
 * ... from public` does NOT remove anon's grant. Migrations 035, 039 and 072
 * shipped that way and verify_072 caught it live on 2026-09-24: anon could
 * execute expire_application and cancel_application, which had no internal
 * guard. Migration 073 fixed the live grants; this test stops the pattern
 * from shipping again.
 *
 * RULE (migrations numbered >= 073): every non-trigger function a migration
 * creates must, in the same file, either
 *   - `revoke execute on function public.<name>(...) from ... anon ...`, or
 *   - `grant execute on function public.<name>(...) to ... anon ...`
 *     (explicitly anon-callable, which verify_073's allow-list must then list).
 * A migration that only says `revoke all ... from public` fails here.
 */
const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')
const RULE_FROM = 73

function migrationsSince(n: number): Array<{ file: string; sql: string }> {
  return readdirSync(MIGRATIONS)
    .filter(f => /^\d{3}_.*\.sql$/.test(f) && Number(f.slice(0, 3)) >= n)
    .sort()
    .map(file => ({ file, sql: readFileSync(join(MIGRATIONS, file), 'utf8') }))
}

/** Function names created (non-trigger) in one migration file. */
export function createdFunctions(sql: string): string[] {
  const out = new Set<string>()
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*returns\s+([a-z_]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql))) {
    if (m[3].toLowerCase() === 'trigger') continue
    out.add(m[1].toLowerCase())
  }
  return [...out]
}

/** Does the file settle anon's EXECUTE for this function, one way or the other? */
export function anonSettled(sql: string, fn: string): boolean {
  const lower = sql.toLowerCase()
  const revoke = new RegExp(`revoke\\s+(?:execute|all)\\s+on\\s+function\\s+(?:public\\.)?${fn}\\s*\\([^)]*\\)\\s+from\\s+[^;]*\\banon\\b`, 'i')
  const grant = new RegExp(`grant\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${fn}\\s*\\([^)]*\\)\\s+to\\s+[^;]*\\banon\\b`, 'i')
  return revoke.test(lower) || grant.test(lower)
}

describe('function grants in migrations', () => {
  it(`every non-trigger function created in a migration >= ${String(RULE_FROM).padStart(3, '0')} settles anon EXECUTE in the same file`, () => {
    const offenders: string[] = []
    for (const { file, sql } of migrationsSince(RULE_FROM)) {
      for (const fn of createdFunctions(sql)) {
        if (!anonSettled(sql, fn)) offenders.push(`${file}: ${fn}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the parser sees the shapes this repo uses (positive control)', () => {
    const sql = `
      create or replace function public.demo(p uuid) returns void language plpgsql as $$ begin end $$;
      create or replace function public.trg() returns trigger language plpgsql as $$ begin return new; end $$;
      revoke all on function public.demo(uuid) from public;`
    expect(createdFunctions(sql)).toEqual(['demo'])
    // "revoke all from public" alone is the shape that shipped broken: NOT settled.
    expect(anonSettled(sql, 'demo')).toBe(false)
    expect(anonSettled(sql + '\nrevoke execute on function public.demo(uuid) from public, anon;', 'demo')).toBe(true)
    expect(anonSettled(sql + '\ngrant execute on function public.demo(uuid) to anon, authenticated;', 'demo')).toBe(true)
  })

  it('073 itself settles every function it touches', () => {
    const { sql } = migrationsSince(73)[0]
    for (const fn of ['comp_application', 'uncomp_application', 'has_role', 'owns_invoice', 'set_tattoo_battle_champion', 'expire_application', 'cancel_application']) {
      expect(anonSettled(sql, fn), fn).toBe(true)
    }
  })
})
