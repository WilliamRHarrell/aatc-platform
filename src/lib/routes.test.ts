import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROUTES } from './routes'

describe('ROUTES', () => {
  it('every route is a real page (no link to nothing)', () => {
    const missing = Object.entries(ROUTES).filter(([, href]) => {
      const path = href.split(/[?#]/)[0]
      return !existsSync(join(process.cwd(), 'src', 'app', ...path.split('/').filter(Boolean), 'page.tsx'))
    })
    expect(missing).toEqual([])
  })
})
