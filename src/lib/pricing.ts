export type BoothSize = 'single' | 'double' | 'triple' | 'quad'
export type ExhibitorType = 'artist' | 'vendor'

export type AddOnKind =
  | 'extra_table'
  | 'extra_chairs'
  | 'tattoo_bed'
  | 'arm_rest'
  | 'tattoo_light'

export type AddOnTerm = 'daily' | 'weekend' | 'weekly' | null

export interface AddOn {
  kind: AddOnKind
  term: AddOnTerm
  qty: number
}

export interface PricingLineItem {
  label: string
  amount: number
}

export interface PricingBreakdown {
  boothBase: number
  permitFees: number
  cornerFee: number
  addOnsTotal: number
  veteranDiscount: number
  total: number
  itemized: PricingLineItem[]
}

export const ARTIST_SINGLE_PRICE = 80000
export const ARTIST_DOUBLE_PRICE = 120000
export const VENDOR_SINGLE_PRICE = 50000
export const VENDOR_DOUBLE_PRICE = 80000
export const CORNER_FEE = 10000
export const PERMIT_FEE_PER_ARTIST = 5000
export const VETERAN_DISCOUNT = 15000

const ADDON_PRICES: Record<AddOnKind, Record<string, number>> = {
  extra_table: { _flat: 5000 },
  extra_chairs: { _flat: 5000 },
  tattoo_bed: { daily: 5000, weekend: 15000 },
  arm_rest: { daily: 4000, weekly: 8000 },
  tattoo_light: { daily: 4000, weekend: 8000 },
}

const ADDON_LABELS: Record<AddOnKind, string> = {
  extra_table: 'Extra Table',
  extra_chairs: '2 Extra Chairs',
  tattoo_bed: 'Tattoo Bed',
  arm_rest: 'Arm Rest',
  tattoo_light: 'Tattoo Light',
}

export interface PricingOptions {
  exhibitorType: ExhibitorType
  artistSingleQty: number
  artistDoubleQty: number
  vendorSingleQty: number
  vendorDoubleQty: number
  cornerCount: number
  artistCount: number
  isVeteran: boolean
  addOns: AddOn[]
}

export function calculatePricing(o: PricingOptions): PricingBreakdown {
  const itemized: PricingLineItem[] = []

  let boothBase = 0
  if (o.exhibitorType === 'artist') {
    if (o.artistSingleQty > 0) {
      const amt = o.artistSingleQty * ARTIST_SINGLE_PRICE
      boothBase += amt
      itemized.push({ label: `Artist Single (${o.artistSingleQty} × $${ARTIST_SINGLE_PRICE / 100})`, amount: amt })
    }
    if (o.artistDoubleQty > 0) {
      const amt = o.artistDoubleQty * ARTIST_DOUBLE_PRICE
      boothBase += amt
      itemized.push({ label: `Artist Double (${o.artistDoubleQty} × $${ARTIST_DOUBLE_PRICE / 100})`, amount: amt })
    }
  } else {
    if (o.vendorSingleQty > 0) {
      const amt = o.vendorSingleQty * VENDOR_SINGLE_PRICE
      boothBase += amt
      itemized.push({ label: `Vendor Single (${o.vendorSingleQty} × $${VENDOR_SINGLE_PRICE / 100})`, amount: amt })
    }
    if (o.vendorDoubleQty > 0) {
      const amt = o.vendorDoubleQty * VENDOR_DOUBLE_PRICE
      boothBase += amt
      itemized.push({ label: `Vendor Double (${o.vendorDoubleQty} × $${VENDOR_DOUBLE_PRICE / 100})`, amount: amt })
    }
  }

  const totalBooths =
    o.artistSingleQty + o.artistDoubleQty + o.vendorSingleQty + o.vendorDoubleQty
  const maxPermitArtists = Math.max(0, totalBooths * 4)
  const clampedArtistCount =
    o.exhibitorType === 'artist'
      ? Math.min(Math.max(0, o.artistCount), maxPermitArtists)
      : 0
  const permitFees = clampedArtistCount * PERMIT_FEE_PER_ARTIST
  if (permitFees > 0) {
    itemized.push({
      label: `Artist permit fees (${clampedArtistCount} × $${PERMIT_FEE_PER_ARTIST / 100})`,
      amount: permitFees,
    })
  }

  const clampedCorners = Math.max(0, Math.min(o.cornerCount, totalBooths))
  const cornerFee = clampedCorners * CORNER_FEE
  if (cornerFee > 0) {
    itemized.push({ label: `Corner booths (${clampedCorners} × $${CORNER_FEE / 100})`, amount: cornerFee })
  }

  let addOnsTotal = 0
  for (const a of o.addOns) {
    const qty = Math.max(0, Math.floor(a.qty))
    if (qty === 0) continue
    const priceMap = ADDON_PRICES[a.kind]
    if (!priceMap) continue
    const unit = a.term && priceMap[a.term] !== undefined ? priceMap[a.term] : priceMap._flat
    if (unit === undefined) continue
    const amt = qty * unit
    addOnsTotal += amt
    const termLabel = a.term ? ` ${a.term}` : ''
    itemized.push({
      label: `${ADDON_LABELS[a.kind]}${termLabel} (${qty} × $${unit / 100})`,
      amount: amt,
    })
  }

  const veteranDiscount = o.isVeteran ? VETERAN_DISCOUNT : 0
  if (veteranDiscount > 0) {
    itemized.push({ label: 'Veteran discount', amount: -veteranDiscount })
  }

  const total = boothBase + permitFees + cornerFee + addOnsTotal - veteranDiscount

  return {
    boothBase,
    permitFees,
    cornerFee,
    addOnsTotal,
    veteranDiscount,
    total,
    itemized,
  }
}

// Legacy shim — given a 2026 application row's stored fields, return its total.
// Used by admin views / reports that read historical (pre-2027) applications.
export function legacyPriceFor(opts: {
  exhibitorType: ExhibitorType
  boothSize: BoothSize
  artistCount: number
  isCorner: boolean
  isVeteran: boolean
}): number {
  const PRICES: Record<ExhibitorType, Record<BoothSize, number>> = {
    artist: { single: 70000, double: 110000, triple: 180000, quad: 220000 },
    vendor: { single: 40000, double: 70000, triple: 110000, quad: 140000 },
  }
  const max: Record<BoothSize, number> = { single: 2, double: 4, triple: 6, quad: 8 }
  const base = PRICES[opts.exhibitorType][opts.boothSize]
  const permit =
    opts.exhibitorType === 'artist'
      ? Math.min(opts.artistCount, max[opts.boothSize]) * 5000
      : 0
  const corner = opts.isCorner ? 5000 : 0
  const vet = opts.isVeteran ? 15000 : 0
  return base + permit + corner - vet
}

export function getMaxArtists(opts: {
  artistSingleQty: number
  artistDoubleQty: number
}): number {
  return opts.artistSingleQty * 2 + opts.artistDoubleQty * 4
}
