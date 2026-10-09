import type { Metadata } from 'next'
import Link from 'next/link'
import { CONFIRM_LABEL, isConfirmType, safeNext } from '@/lib/auth-confirm'

export const metadata: Metadata = { title: 'Continue | All American Tattoo Convention', robots: { index: false } }

// Opening this page verifies NOTHING (lib/auth-confirm.ts): the Continue
// button POSTs to /auth/confirm/verify, so a mail scanner that opens the link
// does not use it up, and the session is set on whichever device taps it.
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const type = isConfirmType(one('type')) ? (one('type') as keyof typeof CONFIRM_LABEL) : null
  const tokenHash = one('token_hash')
  const failed = one('error') !== '' || !type || (!tokenHash && one('error') === '')
  const label = type ? CONFIRM_LABEL[type] : { heading: 'Continue', button: 'Continue' }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <div className="mb-3 flex justify-center gap-2 text-sm" style={{ color: '#8B7355' }}>
          {['★', '★', '★', '★', '★'].map((s, i) => <span key={i}>{s}</span>)}
        </div>
        <Link href="/apply">
          <h1 className="font-display text-2xl font-bold text-white"><span className="text-emboss">ALL AMERICAN</span></h1>
          <p className="font-display text-sm font-semibold" style={{ color: '#8B7355' }}><span className="text-emboss">TATTOO CONVENTION</span></p>
        </Link>
      </div>
      <div className="w-full max-w-md rounded-2xl p-8" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <h2 className="font-display mb-1 text-2xl font-bold text-white">{label.heading}</h2>
        {failed ? (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: '#999999' }}>This link has expired or was already used.</p>
            <p className="text-sm leading-relaxed" style={{ color: '#999999' }}>
              Links work once and expire. Ask for a new one below; you can open it on any device.
            </p>
            <Link href="/auth/forgot-password" className="block w-full rounded-lg py-3 text-center text-sm font-semibold text-white" style={{ backgroundColor: '#8B7355' }}>
              Send a new link
            </Link>
            <Link href="/auth/login" className="block text-center text-sm" style={{ color: '#C4A882' }}>Back to sign in</Link>
          </div>
        ) : (
          <form method="post" action="/auth/confirm/verify" className="space-y-4">
            <p className="text-sm" style={{ color: '#999999' }}>Tap Continue to finish. This link works once.</p>
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type ?? ''} />
            <input type="hidden" name="next" value={safeNext(one('next'), type!)} />
            <button type="submit" className="w-full rounded-lg py-3 text-sm font-semibold text-white" style={{ backgroundColor: '#8B7355' }}>
              {label.button}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
