import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Every admin-made account link goes through /auth/confirm (2026-10-09). */
describe('admin account links use /auth/confirm', () => {
  const files = ['src/lib/invite-link-server.ts', 'src/app/api/admin/reset-user-password/route.ts', 'src/app/api/send-email/route.ts']
  it('no caller hands out generateLink action_link any more', () => {
    for (const f of files) {
      const s = readFileSync(join(process.cwd(), f), 'utf8')
      expect(s, f).toContain('adminConfirmLink(')
      expect(s, f).not.toContain('action_link')
    }
  })
  it('the helper builds the link from hashed_token, invites marked for the heading', () => {
    const s = readFileSync(join(process.cwd(), 'src/lib/admin-auth-link.ts'), 'utf8')
    expect(s).toContain('hashed_token')
    expect(s).toContain("'/auth/reset-password?invited=1'")
    expect(readFileSync(join(process.cwd(), 'src/app/auth/reset-password/page.tsx'), 'utf8')).toContain("get('invited') === '1'")
  })
})
