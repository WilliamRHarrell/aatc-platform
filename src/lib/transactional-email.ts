import { Resend } from 'resend'

const FROM = process.env.RESEND_FROM_EMAIL ?? 'AATC 2027 <onboarding@resend.dev>'

/**
 * One Resend call for the intake routes. Throws on a send error so the caller
 * decides what a failure means; for a submission receipt the rule is: log
 * loudly, never fail the request (the row is the source of truth).
 */
const ONE_ADDRESS = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/

export async function sendTransactional(to: string, subject: string, html: string): Promise<void> {
  // Exactly one syntactically valid string address. Resend accepts an array
  // of up to 50 recipients; a caller that forwards an unvalidated body value
  // must never be able to turn one request into fifty branded emails.
  if (typeof to !== 'string' || !ONE_ADDRESS.test(to.trim())) throw new Error('sendTransactional: recipient must be one email address')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({ from: FROM, to: to.trim(), subject: subject.replace(/[\r\n]+/g, ' ').slice(0, 200), html })
  if (error) throw new Error(String(error.message ?? error))
}
