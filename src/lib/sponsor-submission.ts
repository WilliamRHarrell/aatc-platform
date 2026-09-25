/**
 * Sponsor application submission - the pure rules the route enforces.
 * Amounts come from SPONSOR_TIERS (the one home for prices) and never from the
 * client. Field names match what /apply/sponsor posts.
 */
import { SPONSOR_TIERS, type SponsorTier } from '@/lib/sponsor-tiers'

const TIER_KEYS = Object.keys(SPONSOR_TIERS) as SponsorTier[]
const isTier = (v: unknown): v is SponsorTier => typeof v === 'string' && (TIER_KEYS as string[]).includes(v)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function computeSponsorAmount(tier: SponsorTier | null, items: SponsorTier[]): number {
  const unique = [...new Set(items)]
  return (tier ? SPONSOR_TIERS[tier].amount : 0) + unique.reduce((sum, i) => sum + SPONSOR_TIERS[i].amount, 0)
}

/** The row's tier column: the main tier, or the most expensive item. */
export function primaryTier(tier: SponsorTier | null, items: SponsorTier[]): SponsorTier {
  if (tier) return tier
  return [...items].sort((a, b) => SPONSOR_TIERS[b].amount - SPONSOR_TIERS[a].amount)[0]
}

export interface SponsorSubmissionValues {
  sponsor_name: string
  contact_name: string
  email: string
  phone: string | null
  website: string | null
  instagram: string | null
  facebook: string | null
  tier: SponsorTier
  additionalItems: SponsorTier[]
  amount: number
  logo_url: string | null
  notes: string | null
}

export type SponsorValidation =
  | { ok: true; values: SponsorSubmissionValues }
  | { ok: false; fieldErrors: Record<string, string> }

export function validateSponsorSubmission(body: Record<string, unknown>): SponsorValidation {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const sponsorName = str(body.sponsorName)
  const contactName = str(body.contactName)
  const email = str(body.email)
  const tierRaw = body.tier ?? null
  const itemsRaw = Array.isArray(body.items) ? body.items : []

  const fieldErrors: Record<string, string> = {}
  if (!sponsorName) fieldErrors.sponsorName = 'Company/Sponsor name is required.'
  if (!contactName) fieldErrors.contactName = 'Contact name is required.'
  if (!email) fieldErrors.email = 'Email is required.'
  else if (!EMAIL.test(email)) fieldErrors.email = 'That email address does not look right.'

  const tier = tierRaw === null ? null : isTier(tierRaw) ? tierRaw : undefined
  const items = itemsRaw.every(isTier) ? (itemsRaw as SponsorTier[]) : undefined
  if (tier === undefined || items === undefined) fieldErrors.tier = 'Please choose from the listed sponsorship tiers and items.'
  else if (!tier && items.length === 0) fieldErrors.tier = 'Please select at least one sponsorship tier or item.'

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  const okTier = tier as SponsorTier | null
  const okItems = [...new Set(items as SponsorTier[])]

  const logoRaw = str(body.logoUrl)
  const publicBucket = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/exhibitor-media/`
  const logo_url = logoRaw && publicBucket.length > 30 && logoRaw.startsWith(publicBucket) ? logoRaw : null

  return {
    ok: true,
    values: {
      sponsor_name: sponsorName,
      contact_name: contactName,
      email,
      phone: str(body.phone) || null,
      website: str(body.websiteUrl) || null,
      instagram: str(body.instagram) || null,
      facebook: str(body.facebook) || null,
      tier: primaryTier(okTier, okItems),
      additionalItems: okItems,
      amount: computeSponsorAmount(okTier, okItems),
      logo_url,
      notes: str(body.notes) || null,
    },
  }
}
