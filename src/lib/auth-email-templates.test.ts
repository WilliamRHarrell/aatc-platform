import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { authConfirmSignupEmail, authResetPasswordEmail } from './email-templates'

/**
 * supabase/templates/*.html are GENERATED from email-templates.ts (one home
 * for the branding) and pasted into the Supabase dashboard. This fails when a
 * committed file no longer matches; WRITE_AUTH_TEMPLATES=1 regenerates:
 *   WRITE_AUTH_TEMPLATES=1 npx vitest run src/lib/auth-email-templates.test.ts
 */
const DIR = join(process.cwd(), 'supabase', 'templates')
const FILES: Array<[string, () => string]> = [
  ['confirm_signup.html', authConfirmSignupEmail],
  ['reset_password.html', authResetPasswordEmail],
]

describe('Supabase Auth email templates', () => {
  for (const [file, make] of FILES) {
    const html = make()
    it(`${file}: uses Supabase's link variable and leaves no JS template residue`, () => {
      expect(html.match(/\{\{ \.ConfirmationURL \}\}/g)?.length).toBe(3) // button href, fallback href, fallback text
      expect(html).not.toMatch(/\$\{|undefined|NaN/)
      expect(html).not.toMatch(new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)) // em/en dash, built from code points because the prebuild guard scans src/ for every spelling
    })
    it(`${file}: committed file matches the generator`, () => {
      const path = join(DIR, file)
      if (process.env.WRITE_AUTH_TEMPLATES === '1') { mkdirSync(DIR, { recursive: true }); writeFileSync(path, html) }
      expect(existsSync(path), `${file} missing - run with WRITE_AUTH_TEMPLATES=1`).toBe(true)
      expect(readFileSync(path, 'utf8')).toBe(html)
    })
  }
})
