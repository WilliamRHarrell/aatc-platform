import { getContent } from '@/content/getContent'
import { getPriceVisibility } from '@/lib/sponsor-price-visibility'
import { shownPrices } from '@/lib/sponsor-prices'
import PackagesClient from './PackagesClient'
import { pageMetadata, titled, atTheShow } from '@/lib/page-meta'
import type { Metadata } from 'next'

export const metadata: Metadata = pageMetadata('/sponsors/packages', {
  title: titled('Become a Sponsor'),
  description: atTheShow('Sponsorship packages'),
})

// The price table stays on the server: the client component receives only the
// prices of tiers set to show (084), so a hidden package price is in neither
// the HTML nor the JavaScript. Purged by the admin toggle and content editor.
export const revalidate = 60

export default async function SponsorPackagesPage() {
  const [visibility, wording] = await Promise.all([getPriceVisibility(), getContent('sponsorPricing')])
  return <PackagesClient shown={shownPrices(visibility)} contactForPricing={wording.contact_for_pricing} />
}
