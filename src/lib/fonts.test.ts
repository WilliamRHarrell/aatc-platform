import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every font is self-hosted (src/fonts). next/font/google fetches from
 * fonts.gstatic.com at build time, and builds failed on it twice (Oswald,
 * #44; a timeout on the rest, 2026-09-29). A new Google import fails here.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(p)
  }
  return out
}
const SRC = join(process.cwd(), 'src')

describe('fonts', () => {
  it('nothing imports next/font/google', () => {
    const offenders = walk(SRC).filter(f => /from ['"]next\/font\/google['"]/.test(readFileSync(f, 'utf8'))).map(f => f.replace(SRC, 'src'))
    expect(offenders).toEqual([])
  })
  it('every self-hosted font ships with its licence', () => {
    for (const name of ['Inter', 'Playfair-Display', 'Rubik-Dirt', 'Rye', 'Oswald']) {
      expect(existsSync(join(SRC, 'fonts', `OFL-${name}.txt`)), name).toBe(true)
    }
  })
})
