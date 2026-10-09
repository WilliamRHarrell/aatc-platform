/**
 * The admin application editor (Ryan, 2026-10-09): build or edit a whole
 * application on someone's behalf (recruits, Ink Master artists). Pure rules;
 * /api/admin/applications/editor does the I/O.
 *
 * It enforces what the database and the public form enforce, so an admin row
 * looks like an applicant's:
 *   - prices with calculatePricing (the one home; application_list_price()
 *     mirrors it), total_amount = the LIST price, as for every application;
 *   - at least one booth of the exhibitor's own type;
 *   - artist_count within the 2 per single / 4 per double cap (088), and the
 *     roster no longer than artist_count (088's roster guard);
 *   - needs_roster true until every artist is listed (IDs do not count, Ryan
 *     2026-10-09); the directory only shows rows with needs_roster false.
 * Document paths (vendor ID, veteran ID) and the application-level TV answer
 * are written only when the input carries the key, so an edit that does not
 * touch them keeps what is there.
 * Money (Ryan's four choices): standard, a custom total (agreed_total, 096;
 * below list needs the same second confirmation as a large discount, above
 * list does not), comp booth, comp booth + permits (set_comp, 089).
 */
import { calculatePricing, type AddOn } from '@/lib/pricing'
import { artistCapacity } from '@/lib/artist-roster'
import { TATTOO_STYLES } from '@/lib/tattoo-styles'

export type MoneyChoice =
  | { mode: 'standard' }
  | { mode: 'custom'; totalCents: number; confirmedBelowList?: boolean }
  | { mode: 'comp_booth' }
  | { mode: 'comp_all' }
  /** Permits comped, booth charged (089 allows it; set in the drawer). Offered only to a row that already has it. */
  | { mode: 'comp_permits' }

export interface EditorArtist {
  name: string
  nickname?: string
  instagram?: string
  styles?: string[]
  bio?: string
  /** Public URL (exhibitor-media): a headshot uploaded by admin; falls back to the first portfolio image. */
  photo_url?: string | null
  /** Featured on a tattoo TV show (the Yes/No); the artist is the source of truth (lib/tv-show.ts). */
  tv_featured?: boolean | null
  /** The show, kept only with Yes; the application's tv_show is used only for a one-artist roster. */
  tv_credit?: string
  portfolio_urls?: string[]
  /** Private storage path (application-docs), never public. */
  id_url?: string | null
  id_later?: boolean
  /** Keys the editor does not edit (e.g. a future artist uid), carried through unchanged. */
  extra?: Record<string, unknown>
}

export interface EditorInput {
  exhibitor_type: 'artist' | 'vendor'
  business_name: string
  contact_name: string
  email: string
  phone?: string
  website?: string
  instagram?: string
  facebook?: string
  other_links?: string
  notes?: string
  artist_single_qty?: number
  artist_double_qty?: number
  vendor_single_qty?: number
  vendor_double_qty?: number
  corner_count?: number
  add_ons?: AddOn[]
  artist_count?: number
  is_veteran?: boolean
  tv_show_featured?: boolean | null
  tv_show?: string
  logo_url?: string | null
  /** Vendor's ID document, private path (application-docs). Optional here: admin often enters a vendor before having it. */
  id_doc_url?: string | null
  /** Veteran ID document, private path (application-docs). */
  veteran_id_url?: string | null
  artists?: EditorArtist[]
  /** 'keep' (editing only): leave the status as it is, e.g. rejected or waitlisted. */
  status: 'pending' | 'approved' | 'keep'
  money: MoneyChoice
}

export const BIO_MAX = 600
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0)
const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const orNull = (v: string) => v || null
const omit = (o: Record<string, unknown> | undefined, keys: string[]) =>
  Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k]) => !keys.includes(k)))

/** The columns the price is computed from. */
export interface PricingInputs {
  exhibitor_type: string
  artist_single_qty: number | null
  artist_double_qty: number | null
  vendor_single_qty: number | null
  vendor_double_qty: number | null
  corner_count: number | null
  artist_count: number | null
  is_veteran: boolean | null
  add_ons: unknown
}

const addOnKey = (v: unknown) => JSON.stringify(
  (Array.isArray(v) ? v : [])
    .filter((a): a is AddOn => !!a && typeof a === 'object' && Math.floor(Number((a as AddOn).qty) || 0) > 0)
    .map(a => [a.kind, a.term ?? null, Math.floor(Number(a.qty))])
    .sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
)

/**
 * Did the order change? Compared on what was ordered, not on the recomputed
 * total: 9 of 26 rows (2026-10-09) carry a total from older prices or an
 * import, so "recompute and compare" would call every save a price change and
 * refuse it on a paid row. Unchanged: keep the stored price, comp and invoice.
 */
export function samePricingInputs(a: PricingInputs, b: PricingInputs): boolean {
  const n = (v: number | null | undefined) => v ?? 0
  return a.exhibitor_type === b.exhibitor_type
    && n(a.artist_single_qty) === n(b.artist_single_qty) && n(a.artist_double_qty) === n(b.artist_double_qty)
    && n(a.vendor_single_qty) === n(b.vendor_single_qty) && n(a.vendor_double_qty) === n(b.vendor_double_qty)
    && n(a.corner_count) === n(b.corner_count) && n(a.artist_count) === n(b.artist_count)
    && !!a.is_veteran === !!b.is_veteran
    && addOnKey(a.add_ons) === addOnKey(b.add_ons)
}

export interface EditorPlan {
  row: Record<string, unknown>
  listCents: number
  /** What Approve will invoice (null: comp decides, via set_comp). */
  invoiceCents: number | null
  comp: { booth: boolean; permits: boolean } | null
}

export type EditorValidation = { ok: true; plan: EditorPlan } | { ok: false; errors: Record<string, string>; needsConfirm?: true }

/** The stored row, when editing: what planApplication must not overturn. */
export interface EditorExisting {
  needs_roster: boolean
  artist_count: number | null
  /** The stored order. When the input matches it, its values are kept verbatim
   *  (2 rows, 2026-10-09: an artist row that also holds a vendor booth, and a
   *  row with more corners than booths), so a plain save changes nothing. */
  order?: PricingInputs
}

export function planApplication(input: EditorInput, existing?: EditorExisting): EditorValidation {
  const errors: Record<string, string> = {}
  const type = input.exhibitor_type
  if (type !== 'artist' && type !== 'vendor') errors.exhibitor_type = 'Choose artist or vendor.'
  const business_name = text(input.business_name, 200)
  const contact_name = text(input.contact_name, 200)
  const email = text(input.email, 254).toLowerCase()
  if (!business_name) errors.business_name = 'Business / shop name is required.'
  if (!contact_name) errors.contact_name = 'Contact name is required.'
  if (!EMAIL.test(email)) errors.email = 'A valid email is required.'
  if (!['pending', 'approved', 'keep'].includes(input.status)) errors.status = 'Status must be pending, approved or unchanged.'

  const isArtist = type === 'artist'
  const asGiven: PricingInputs = {
    exhibitor_type: type,
    artist_single_qty: int(input.artist_single_qty), artist_double_qty: int(input.artist_double_qty),
    vendor_single_qty: int(input.vendor_single_qty), vendor_double_qty: int(input.vendor_double_qty),
    corner_count: int(input.corner_count), artist_count: int(input.artist_count), is_veteran: !!input.is_veteran, add_ons: input.add_ons,
  }
  const keepOrder = !!existing?.order && samePricingInputs(existing.order, asGiven)
  const q = keepOrder ? {
    artist_single_qty: int(existing!.order!.artist_single_qty), artist_double_qty: int(existing!.order!.artist_double_qty),
    vendor_single_qty: int(existing!.order!.vendor_single_qty), vendor_double_qty: int(existing!.order!.vendor_double_qty),
  } : {
    artist_single_qty: isArtist ? int(input.artist_single_qty) : 0,
    artist_double_qty: isArtist ? int(input.artist_double_qty) : 0,
    vendor_single_qty: isArtist ? 0 : int(input.vendor_single_qty),
    vendor_double_qty: isArtist ? 0 : int(input.vendor_double_qty),
  }
  const booths = q.artist_single_qty + q.artist_double_qty + q.vendor_single_qty + q.vendor_double_qty
  if (booths === 0) errors.booths = 'Choose at least one booth.'
  const corner_count = keepOrder ? int(existing!.order!.corner_count) : Math.min(int(input.corner_count), booths)
  const add_ons = Array.isArray(input.add_ons) ? input.add_ons.filter(a => a && int(a.qty) > 0) : []

  const capacity = isArtist ? artistCapacity({ booth_size: null, ...q }) : 0
  const artist_count = isArtist ? int(input.artist_count) : 0
  // An existing row with no artist count yet (some imports) may stay at 0;
  // adding artists to it is a real order change.
  const keepsZero = !!existing && (existing.artist_count ?? 0) === 0 && artist_count === 0
  if (isArtist && artist_count < 1 && !keepsZero) errors.artist_count = 'At least one artist.'
  if (isArtist && artist_count > capacity) errors.artist_count = `At most ${capacity} artists for these booths (2 per single, 4 per double).`

  const artists = isArtist ? (input.artists ?? []).map(a => ({
    // Unknown keys first, so the editor's own keys always win. Verification
    // keys are the database's (088) and never come from here.
    ...omit(a.extra, ['id_verified_at', 'id_verified_by']),
    name: text(a.name, 120),
    nickname: text(a.nickname, 120),
    instagram: text(a.instagram, 120).replace(/^@/, ''),
    styles: Array.isArray(a.styles) ? a.styles.map(s => text(s, 60)).filter(Boolean).slice(0, TATTOO_STYLES.length) : [],
    bio: text(a.bio, BIO_MAX),
    photo_url: a.photo_url || null,
    tv_featured: typeof a.tv_featured === 'boolean' ? a.tv_featured : null,
    tv_credit: a.tv_featured === false ? '' : text(a.tv_credit, 120),
    portfolio_urls: Array.isArray(a.portfolio_urls) ? a.portfolio_urls.filter(u => typeof u === 'string' && u).slice(0, 10) : [],
    id_url: a.id_url || null,
    id_later: !!a.id_later && !a.id_url,
  })) : []
  if (artists.length > artist_count) errors.artists = `The roster lists ${artists.length} artists but the application is for ${artist_count}.`
  // Required for a new application. When editing, a name already missing (3
  // stored artists, 2026-10-09) does not block saving a photo or a document.
  if (!existing) artists.forEach((a, i) => { if (!a.name) errors[`artists.${i}.name`] = `Artist ${i + 1}: legal name is required.` })

  const is_veteran = !!input.is_veteran
  const listCents = booths === 0 ? 0 : calculatePricing({
    exhibitorType: type, ...{ artistSingleQty: q.artist_single_qty, artistDoubleQty: q.artist_double_qty, vendorSingleQty: q.vendor_single_qty, vendorDoubleQty: q.vendor_double_qty },
    cornerCount: corner_count, artistCount: artist_count, isVeteran: is_veteran, addOns: add_ons,
  }).total

  // ── money ──
  let agreed_total: number | null = null
  let comp: EditorPlan['comp'] = null
  let invoiceCents: number | null = listCents
  const m = input.money
  if (!m || !['standard', 'custom', 'comp_booth', 'comp_all', 'comp_permits'].includes(m.mode)) errors.money = 'Choose how this application is priced.'
  else if (m.mode === 'custom') {
    const t = typeof m.totalCents === 'number' && Number.isFinite(m.totalCents) ? Math.round(m.totalCents) : -1
    if (t < 0) errors.money = 'Enter the agreed total.'
    else {
      agreed_total = t
      invoiceCents = t
      if (t < listCents && !m.confirmedBelowList && Object.keys(errors).length === 0) {
        return { ok: false, needsConfirm: true, errors: { money: `The agreed total is below the list price. Confirm to continue.` } }
      }
    }
  } else if (m.mode === 'comp_booth') { comp = { booth: true, permits: false }; invoiceCents = null }
  else if (m.mode === 'comp_all') { comp = { booth: true, permits: true }; invoiceCents = null }
  else if (m.mode === 'comp_permits') { comp = { booth: false, permits: true }; invoiceCents = null }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  // needs_roster: the roster is complete when every artist the application is
  // for is listed. ID documents do NOT count, for artists or vendors (Ryan,
  // 2026-10-09: an ID never affects the directory, especially for the Square
  // imports). A vendor has no roster, so it is always complete.
  // Editing only ever CLEARS it: 8 approved rows (2026-10-09) carry a value the
  // rule would overturn (listed rosters from before the rule, imports waiting
  // on documents), and a save that only adds a photo must not move them.
  const rosterComplete = !isArtist || (artist_count > 0 && artists.length >= artist_count)
  const needs_roster = existing ? existing.needs_roster && !rosterComplete : !rosterComplete
  // The application-level TV answer (094) is written only when sent: the editor
  // asks per artist, and an edit must not wipe an older application's answer.
  const tvFeatured = isArtist && typeof input.tv_show_featured === 'boolean' ? input.tv_show_featured : null
  const appTv = 'tv_show_featured' in input || 'tv_show' in input
    ? { tv_show_featured: tvFeatured, tv_show: tvFeatured ? orNull(text(input.tv_show, 120)) : null }
    : {}

  return {
    ok: true,
    plan: {
      listCents,
      invoiceCents,
      comp,
      row: {
        exhibitor_type: type,
        business_name, contact_name, email,
        phone: orNull(text(input.phone, 40)),
        website: orNull(text(input.website, 300)),
        instagram: orNull(text(input.instagram, 120).replace(/^@/, '')),
        facebook: orNull(text(input.facebook, 300)),
        other_links: orNull(text(input.other_links, 1000)),
        notes: orNull(text(input.notes, 2000)),
        booth_size: null,
        ...q,
        corner_count,
        is_corner: corner_count > 0,
        add_ons,
        artist_count,
        is_veteran,
        ...appTv,
        logo_url: input.logo_url || null,
        artists: isArtist ? artists : null,
        artists_ids_later: isArtist && artists.some(a => a.id_later),
        // Vendors only: on an artist row id_doc_url is the booth holder's ID from
        // the portal's roster completion, which this form neither shows nor edits.
        ...('id_doc_url' in input && !isArtist ? { id_doc_url: input.id_doc_url || null } : {}),
        ...('veteran_id_url' in input ? { veteran_id_url: is_veteran ? input.veteran_id_url || null : null } : {}),
        needs_roster,
        total_amount: listCents,
        agreed_total,
      },
    },
  }
}

/** For a LIKE query on an email: escape the wildcards a real address may contain. */
export function likeExact(s: string): string {
  return s.replace(/[\\%_]/g, c => `\\${c}`)
}
