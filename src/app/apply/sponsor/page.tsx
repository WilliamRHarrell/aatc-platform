import { getContent } from '@/content/getContent'
import { getPriceVisibility } from '@/lib/sponsor-price-visibility'
import { shownPrices } from '@/lib/sponsor-prices'
import SponsorApplyClient from './SponsorApplyClient'

// Prices stay on the server; the form receives only shown tiers' prices (084).
export const revalidate = 60

export default async function SponsorApplicationPage() {
  const [visibility, wording] = await Promise.all([getPriceVisibility(), getContent('sponsorPricing')])
  return <SponsorApplyClient shown={shownPrices(visibility)} followUp={wording.follow_up_pricing} />
}
