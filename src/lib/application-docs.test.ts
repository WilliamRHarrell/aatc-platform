import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  normalizeDocPath, listDocRefs, docKind, veteranNeedsVerification, splitPath, SIGNED_URL_TTL_SECONDS,
} from '@/lib/application-docs'

describe('normalizeDocPath', () => {
  it('returns an object path unchanged', () => {
    expect(normalizeDocPath('u1/123-id.jpg')).toBe('u1/123-id.jpg')
  })
  it('strips a legacy full URL down to the object path', () => {
    expect(normalizeDocPath('https://x.supabase.co/storage/v1/object/public/application-docs/u1/123-id.jpg')).toBe('u1/123-id.jpg')
  })
})

describe('listDocRefs', () => {
  it('lists the vendor ID when artists is null', () => {
    expect(listDocRefs({ id_doc_url: 'u1/1-id.jpg', veteran_id_url: null, artists: null }))
      .toEqual([{ key: 'id', label: 'Government ID', path: 'u1/1-id.jpg' }])
  })
  it('lists per-artist IDs in order and skips artists without one', () => {
    const refs = listDocRefs({
      id_doc_url: null, veteran_id_url: null,
      artists: [{ name: 'A', id_url: 'u1/1-artist-1-id.png' }, { name: 'B', id_url: null }, { name: 'C', id_url: 'u1/1-artist-3-id.png' }],
    })
    expect(refs.map(r => r.key)).toEqual(['artist-1', 'artist-3'])
    expect(refs[0].label).toBe('Artist 1 - A')
  })
  it('lists the veteran document last', () => {
    const refs = listDocRefs({ id_doc_url: 'u1/1-id.jpg', veteran_id_url: 'u1/1-veteran-id.pdf', artists: null })
    expect(refs.at(-1)).toEqual({ key: 'veteran', label: 'Veteran proof of service', path: 'u1/1-veteran-id.pdf' })
  })
  it('never returns an empty path', () => {
    expect(listDocRefs({ id_doc_url: '', veteran_id_url: null, artists: [{ id_url: '' }] })).toEqual([])
  })
})

describe('docKind', () => {
  it('image mime types are images', () => { expect(docKind('image/jpeg')).toBe('image') })
  it('pdf is pdf', () => { expect(docKind('application/pdf')).toBe('pdf') })
  it('falls back to the extension', () => {
    expect(docKind('u1/1-id.PNG')).toBe('image')
    expect(docKind('u1/1-id.pdf')).toBe('pdf')
  })
  it('unknown is other', () => { expect(docKind(null)).toBe('other') })
})

describe('veteranNeedsVerification', () => {
  it('true when the discount is claimed and nothing is verified', () => {
    expect(veteranNeedsVerification({ is_veteran: true, veteran_doc_verified_at: null })).toBe(true)
  })
  it('false when verified', () => {
    expect(veteranNeedsVerification({ is_veteran: true, veteran_doc_verified_at: '2026-09-24T00:00:00Z' })).toBe(false)
  })
  it('false when the discount is not claimed', () => {
    expect(veteranNeedsVerification({ is_veteran: false, veteran_doc_verified_at: null })).toBe(false)
  })
})

describe('splitPath', () => {
  it('splits folder and file name', () => {
    expect(splitPath('admin/app1/artist-2-id-1.jpg')).toEqual({ folder: 'admin/app1', fileName: 'artist-2-id-1.jpg' })
  })
  it('a bare file name has an empty folder', () => {
    expect(splitPath('file.jpg')).toEqual({ folder: '', fileName: 'file.jpg' })
  })
})

describe('signed url ttl', () => {
  it('is five minutes', () => { expect(SIGNED_URL_TTL_SECONDS).toBe(300) })
})

/**
 * Signing has ONE home. Before 2026-09-24 the drawer and the booth detail page
 * each minted one-hour signed URLs in the browser; the admin route mints
 * five-minute ones after a role check. A second caller fails the suite.
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

describe('signing has one home', () => {
  it('createSignedUrl is called from the admin application-docs route only', () => {
    const offenders = walk(SRC)
      .filter(f => readFileSync(f, 'utf8').includes('createSignedUrl('))
      .map(f => f.replace(SRC, 'src'))
      .sort()
    expect(offenders).toEqual(['src/app/api/admin/application-docs/route.ts'])
  })
})
