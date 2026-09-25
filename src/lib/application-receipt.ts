/**
 * What a booth application receipt says about the application. Pure; both
 * the applicant receipt and the internal notice read from this so the two
 * never disagree. total is the list price (comps and discounts are admin
 * actions that come later, with their own emails).
 */
import { describeBooths } from '@/lib/booth-display'

type ReceiptApp = Parameters<typeof describeBooths>[0] & {
  business_name: string
  contact_name: string
  email: string
  phone: string | null
  exhibitor_type: 'artist' | 'vendor'
  artist_count: number
  is_veteran: boolean
  total_amount: number
}

export interface ReceiptFacts {
  businessName: string
  contactName: string
  email: string
  phone: string | null
  kind: 'Artist' | 'Vendor'
  booths: string
  artistCount: number
  veteranClaimed: boolean
  total: string
}

export function applicationReceiptFacts(app: ReceiptApp): ReceiptFacts {
  return {
    businessName: app.business_name,
    contactName: app.contact_name,
    email: app.email,
    phone: app.phone,
    kind: app.exhibitor_type === 'artist' ? 'Artist' : 'Vendor',
    booths: describeBooths(app),
    artistCount: app.artist_count,
    veteranClaimed: app.is_veteran,
    total: (app.total_amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
  }
}
