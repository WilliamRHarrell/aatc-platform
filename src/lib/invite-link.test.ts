import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canInvite, isActivated, planInviteLink, ACTIVE_APPLICATION_STATUSES } from './invite-link'
import { accountInviteEmail, portalLinkedEmail } from './email-templates'

const used = { id: 'u1', email_confirmed_at: '2026-09-01T00:00:00Z', last_sign_in_at: null }
const invitedOnly = { id: 'u2', email_confirmed_at: null, last_sign_in_at: null }

describe('who may invite (Ryan, 2026-09-28)', () => {
  it('sponsorships: admin and sponsorship_manager', () => {
    expect(canInvite('sponsorship', 'admin')).toBe(true)
    expect(canInvite('sponsorship', 'sponsorship_manager')).toBe(true)
    expect(canInvite('sponsorship', 'content_editor')).toBe(false)
  })
  it('applications: admin only', () => {
    expect(canInvite('application', 'admin')).toBe(true)
    expect(canInvite('application', 'sponsorship_manager')).toBe(false)
    expect(canInvite('application', null)).toBe(false)
  })
})

describe('planInviteLink', () => {
  it('existing, used account: link + portal notice', () => {
    expect(planInviteLink(null, used)).toEqual({ action: 'link_existing', userId: 'u1' })
  })
  it('invited but never used: resend a set-password link', () => {
    expect(isActivated(invitedOnly)).toBe(false)
    expect(planInviteLink(null, invitedOnly)).toEqual({ action: 'resend_invite', userId: 'u2' })
  })
  it('no account: create by invitation', () => {
    expect(planInviteLink(null, null)).toEqual({ action: 'invite_new' })
  })
  it('already linked to the same account: allowed (resend)', () => {
    expect(planInviteLink('u1', used)).toEqual({ action: 'link_existing', userId: 'u1' })
  })
  it('linked to someone else: refused, never moved', () => {
    expect(planInviteLink('other', used)).toEqual({ action: 'conflict' })
    expect(planInviteLink('other', null)).toEqual({ action: 'conflict' })
  })
})

describe('one active application', () => {
  it('uses the same statuses as the 079 index', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '079_server_price_and_one_active_application.sql'), 'utf8')
    const m = sql.match(/applications_one_active_per_user_event[\s\S]*?status in \(([^)]*)\)/)
    expect(m).not.toBeNull()
    const statuses = m![1].split(',').map(s => s.trim().replace(/'/g, ''))
    expect([...ACTIVE_APPLICATION_STATUSES].sort()).toEqual(statuses.sort())
  })
})

describe('emails', () => {
  it('invite carries the action link and names the record', () => {
    const html = accountInviteEmail({ name: 'ZZ Test Co', what: 'sponsorship', actionUrl: 'https://example.invalid/verify?token=abc&type=invite' })
    expect(html).toContain('https://example.invalid/verify?token=abc&amp;type=invite')
    expect(html).toContain('ZZ Test Co')
    expect(html).toContain('sponsorship')
  })
  it('linked notice points at the portal and escapes the name', () => {
    const html = portalLinkedEmail({ name: 'ZZ <b>Co</b>', what: 'booth application' })
    expect(html).toContain('/auth/login?redirect=/portal')
    expect(html).toContain('ZZ &lt;b&gt;Co&lt;/b&gt;')
    expect(html).toContain('booth application')
  })
})

describe('food truck invites (090)', () => {
  it('admin only', () => {
    expect(canInvite('food_truck', 'admin')).toBe(true)
    expect(canInvite('food_truck', 'content_editor')).toBe(false)
    expect(canInvite('food_truck', 'sponsorship_manager')).toBe(false)
  })
})
