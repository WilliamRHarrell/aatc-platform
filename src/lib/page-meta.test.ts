import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pageMetadata, atTheShow, DEFAULT_SOCIAL_IMAGE } from '@/lib/page-meta'

describe('pageMetadata', () => {
  it('title, description, og (url, site name, image) and a twitter card', () => {
    const m = pageMetadata('/tickets', { title: 'T', description: 'D' })
    expect(m.title).toBe('T')
    expect(m.openGraph).toMatchObject({ title: 'T', description: 'D', url: '/tickets', images: [DEFAULT_SOCIAL_IMAGE] })
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', images: [DEFAULT_SOCIAL_IMAGE.url] })
    expect(m.alternates).toHaveProperty('canonical')
  })
  it('descriptions name the show, dates and venue from event-config', () => {
    expect(atTheShow('X')).toMatch(/^X at the All American Tattoo Convention 2027, .+ at the Crown Complex Event Center in Fayetteville, NC\.$/)
  })
})

/**
 * Every public page has its own title, description, canonical and social
 * preview (2026-10-09). A page sets it with pageMetadata('<its own path>'),
 * in page.tsx or, for a client component, in the layout.tsx beside it.
 * Home and the Tattoo Battle pages build theirs by hand (their own images).
 */
describe('every public page has social metadata for its own path', () => {
  const OWN = ['/', '/tattoo-battle']
  const pages: string[] = []
  const walk = (dir: string, route: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (!statSync(full).isDirectory()) { if (name === 'page.tsx') pages.push(route || '/'); continue }
      if (['admin', 'portal', 'auth', 'api'].includes(name) && route === '') continue
      walk(full, `${route}/${name}`)
    }
  }
  walk(join(process.cwd(), 'src', 'app'), '')
  it('each one calls pageMetadata with its path (or builds metadata itself)', () => {
    const missing: string[] = []
    for (const route of pages) {
      if (OWN.includes(route) || route === '/tattoo-battle/[bucket]' || route.startsWith('/tattoo-battle/entry')) continue
      const dir = join(process.cwd(), 'src', 'app', ...route.split('/').filter(Boolean))
      const text = ['page.tsx', 'layout.tsx'].filter(f => existsSync(join(dir, f))).map(f => readFileSync(join(dir, f), 'utf8')).join('\n')
      const dynamic = route.includes('[')
      const ok = dynamic ? /generateMetadata[\s\S]*pageMetadata\(/.test(text) : text.includes(`pageMetadata('${route}'`)
      if (!ok) missing.push(route)
    }
    expect(missing).toEqual([])
  })
})
