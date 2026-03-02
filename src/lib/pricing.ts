export type BoothSize = 'single' | 'double' | 'triple' | 'quad'
export type ExhibitorType = 'artist' | 'vendor'

export interface PricingBreakdown {
  boothBase: number
  permitFees: number
  cornerFee: number
  veteranDiscount: number
  total: number
  itemized: PricingLineItem[]
}

export interface PricingLineItem {
  label: string
  amount: number
}

const ARTIST_BOOTH_PRICES: Record<BoothSize, number> = {
  single: 70000,
  double: 110000,
  triple: 180000,
  quad: 220000,
}

const VENDOR_BOOTH_PRICES: Record<BoothSize, number> = {
  single: 40000,
  double: 70000,
  triple: 110000,
  quad: 140000,
}

const MAX_ARTISTS_PER_SIZE: Record<BoothSize, number> = {
  single: 2,
  double: 4,
  triple: 6,
  quad: 8,
}

const PERMIT_FEE_PER_ARTIST = 5000 // $50 in cents
const CORNER_FEE = 5000 // $50 in cents
const VETERAN_DISCOUNT = 15000 // $150 in cents

export interface PricingOptions {
  exhibitorType: ExhibitorType
  boothSize: BoothSize
  artistCount: number
  isCorner: boolean
  isVeteran: boolean
}

export function calculatePricing(options: PricingOptions): PricingBreakdown {
  const { exhibitorType, boothSize, artistCount, isCorner, isVeteran } = options

  const boothPrices =
    exhibitorType === 'artist' ? ARTIST_BOOTH_PRICES : VENDOR_BOOTH_PRICES
  const boothBase = boothPrices[boothSize]

  const maxArtists = MAX_ARTISTS_PER_SIZE[boothSize]
  const clampedArtistCount = Math.min(Math.max(0, artistCount), maxArtists)
  const permitFees =
    exhibitorType === 'artist' ? clampedArtistCount * PERMIT_FEE_PER_ARTIST : 0

  const cornerFee = isCorner ? CORNER_FEE : 0
  const veteranDiscount = isVeteran ? VETERAN_DISCOUNT : 0

  const total = boothBase + permitFees + cornerFee - veteranDiscount

  const itemized: PricingLineItem[] = [
    {
      label: `${exhibitorType === 'artist' ? 'Artist' : 'Vendor'} ${boothSize} booth`,
      amount: boothBase,
    },
  ]

  if (permitFees > 0) {
    itemized.push({
      label: `Artist permit fees (${clampedArtistCount} × $50)`,
      amount: permitFees,
    })
  }

  if (cornerFee > 0) {
    itemized.push({ label: 'Corner booth fee', amount: cornerFee })
  }

  if (veteranDiscount > 0) {
    itemized.push({ label: 'Veteran discount', amount: -veteranDiscount })
  }

  return { boothBase, permitFees, cornerFee, veteranDiscount, total, itemized }
}

export function getMaxArtists(boothSize: BoothSize): number {
  return MAX_ARTISTS_PER_SIZE[boothSize]
}
