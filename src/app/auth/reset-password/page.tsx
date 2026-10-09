'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { parseAuthLanding, AUTH_LINK_TIMEOUT_MS, type AuthLanding } from '@/lib/auth-link'
import toast from 'react-hot-toast'

// What the emailed link left in the URL, read once at load (lib/auth-link.ts
// says why). Admin links (Reset password, Invite & link) bring the session in
// the hash, which the PKCE browser client refuses, so the page sets it itself.
const LANDING: AuthLanding = typeof window === 'undefined' ? { kind: 'none' } : parseAuthLanding(window.location.href)
// An admin invitation: cosmetic only (the heading). Old invite links carry
// type=invite in the hash; /auth/confirm invites arrive with ?invited=1.
const OPENED_FROM_INVITE = (LANDING.kind === 'tokens' && LANDING.type === 'invite')
  || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('invited') === '1')

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  // The link could not start a session: used, expired, or (a ?code= link)
  // opened in a different browser from the one that asked for it.
  const [failed, setFailed] = useState(false)
  // false on the server render, the load-time value on the client: no mismatch.
  const invited = useSyncExternalStore(() => () => {}, () => OPENED_FROM_INVITE, () => false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let done = false
    const ok = () => { done = true; setReady(true) }
    const fail = (why: string) => {
      if (done) return
      done = true
      console.warn(`[reset-password] link did not start a session: ${why}`)
      setFailed(true)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) ok()
    })

    if (LANDING.kind === 'error') {
      fail(LANDING.code ?? LANDING.description ?? 'error in link')
    } else if (LANDING.kind === 'tokens') {
      // Keep the tokens out of the address bar (history, screenshots, sharing).
      window.history.replaceState(null, '', window.location.pathname)
      supabase.auth.setSession({ access_token: LANDING.accessToken, refresh_token: LANDING.refreshToken })
        .then(({ data, error }) => (error || !data.session ? fail(error?.message ?? 'no session') : ok()))
    } else {
      // A ?code= link is exchanged by the client on load; or the visitor is
      // already signed in. Either way a session shows up here or never does.
      supabase.auth.getSession().then(({ data: { session } }) => { if (session) ok() })
    }

    const timer = window.setTimeout(() => fail(`no session after ${AUTH_LINK_TIMEOUT_MS / 1000}s (${LANDING.kind})`), AUTH_LINK_TIMEOUT_MS)
    return () => { window.clearTimeout(timer); subscription.unsubscribe() }
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    toast.success('Password updated')
    router.push('/portal')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <div className="mb-3 flex justify-center gap-2 text-sm" style={{ color: '#8B7355' }}>
          {['★', '★', '★', '★', '★'].map((s, i) => <span key={i}>{s}</span>)}
        </div>
        <Link href="/apply">
          <h1 className="font-display text-2xl font-bold text-white"><span className="text-emboss">ALL AMERICAN</span></h1>
          <p className="font-display text-sm font-semibold" style={{ color: '#8B7355' }}>
            <span className="text-emboss">TATTOO CONVENTION</span>
          </p>
        </Link>
      </div>

      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
      >
        <h2 className="font-display mb-1 text-2xl font-bold text-white">{invited ? 'Create your password' : 'Set new password'}</h2>
        <p className="mb-6 text-sm" style={{ color: '#999999' }}>
          {ready
            ? 'Choose a new password for your account.'
            : failed
              ? 'This link has expired or was already used.'
              : 'Verifying your reset link…'}
        </p>

        {ready && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white" htmlFor="password">
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-white" htmlFor="confirm">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg py-3 text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50"
              style={{ backgroundColor: '#8B7355' }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.backgroundColor = '#C4A882' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#8B7355' }}
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        {!ready && failed && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed" style={{ color: '#999999' }}>
              Links work once and expire. A link requested from this site also has to be opened in the
              same browser that requested it.
            </p>
            <Link
              href="/auth/forgot-password"
              className="block w-full rounded-lg py-3 text-center text-sm font-semibold text-white"
              style={{ backgroundColor: '#8B7355' }}
            >
              Send a new link
            </Link>
          </div>
        )}

        {!ready && !failed && (
          <div className="flex justify-center py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
          </div>
        )}

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1" style={{ backgroundColor: '#2a2a2a' }} />
          <span className="text-xs" style={{ color: '#555555' }}>or</span>
          <div className="h-px flex-1" style={{ backgroundColor: '#2a2a2a' }} />
        </div>

        <p className="text-center text-sm" style={{ color: '#999999' }}>
          <Link
            href="/auth/login"
            className="font-medium transition-colors"
            style={{ color: '#C4A882' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#8B7355')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
          >
            Back to sign in
          </Link>
        </p>
      </div>

      <p className="mt-8 text-xs" style={{ color: '#555555' }}>
        <span className="text-emboss">© {new Date().getFullYear()} All American Tattoo Convention</span>
      </p>
    </div>
  )
}
