import { Resend } from 'resend'

const FROM = process.env.RESEND_FROM_EMAIL ?? 'AATC 2027 <onboarding@resend.dev>'

/**
 * One Resend call for the intake routes. Throws on a send error so the caller
 * decides what a failure means; for a submission receipt the rule is: log
 * loudly, never fail the request (the row is the source of truth).
 */
export async function sendTransactional(to: string, subject: string, html: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({ from: FROM, to, subject, html })
  if (error) throw new Error(String(error.message ?? error))
}
