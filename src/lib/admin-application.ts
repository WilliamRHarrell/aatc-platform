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
 *   - needs_roster true until every listed artist has an ID (or is marked ID
 *     later); the directory only shows rows with needs_roster false.
 * Document paths (vendor ID, veteran ID) are written only when the input carries
 * the key, so an edit that does not touch them keeps what is there.
 * Money (Ryan's four choices): standard, a custom total (agreed_total, 096;
 * below list needs the same second confirmation as a large discount, above
 * list does not), comp booth, comp booth + permits (set_comp, 089).
 */
import { calculatePricing, type AddOn } from '@/lib/pricing'
import { artistCapacity } from '@/lib/artist-roster'

export type MoneyChoice =
  | { mode: 'standard' }
  | { mode: 'custom'; totalCents: number; confirmedBelowList?: boolean }
  | { mode: 'comp_booth' }
  | { mode: 'comp_all' }

export interface EditorArtist {
  name: string
  nickname?: string
  instagram?: string
  styles?: string[]
  bio?: string
  /** Public URL (exhibitor-media): a headshot uploaded by admin; falls back to the first portfolio image. */
  photo_url?: string | null
  /** This artist's TV credit; the application's tv_show is used only for a one-artist roster. */
  tv_credit?: string
  portfolio_urls?: string[]
  /** Private storage path (application-docs), never public. */
  id_url?: string | null
  id_later?: boolean
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
  status: 'pending' | 'approved'
  money: MoneyChoice
}

export const BIO_MAX = 600
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0)
const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const orNull = (v: string) => v || null

export interface EditorPlan {
  row: Record<string, unknown>
  listCents: number
  /** What Approve will invoice (null: comp decides, via set_comp). */
  invoiceCents: number | null
  comp: { booth: boolean; permits: boolean } | null
}

export type EditorValidation = { ok: true; plan: EditorPlan } | { ok: false; errors: Record<string, string>; needsConfirm?: true }

export function planApplication(input: EditorInput): EditorValidation {
  const errors: Record<string, string> = {}
  const type = input.exhibitor_type
  if (type !== 'artist' && type !== 'vendor') errors.exhibitor_type = 'Choose artist or vendor.'
  const business_name = text(input.business_name, 200)
  const contact_name = text(input.contact_name, 200)
  const email = text(input.email, 254).toLowerCase()
  if (!business_name) errors.business_name = 'Business / shop name is required.'
  if (!contact_name) errors.contact_name = 'Contact name is required.'
  if (!EMAIL.test(email)) errors.email = 'A valid email is required.'
  if (input.status !== 'pending' && input.status !== 'approved') errors.status = 'Status must be pending or approved.'

  const isArtist = type === 'artist'
  const q = {
    artist_single_qty: isArtist ? int(input.artist_single_qty) : 0,
    artist_double_qty: isArtist ? int(input.artist_double_qty) : 0,
    vendor_single_qty: isArtist ? 0 : int(input.vendor_single_qty),
    vendor_double_qty: isArtist ? 0 : int(input.vendor_double_qty),
  }
  const booths = q.artist_single_qty + q.artist_double_qty + q.vendor_single_qty + q.vendor_double_qty
  if (booths === 0) errors.booths = 'Choose at least one booth.'
  const corner_count = Math.min(int(input.corner_count), booths)
  const add_ons = Array.isArray(input.add_ons) ? input.add_ons.filter(a => a && int(a.qty) > 0) : []

  const capacity = isArtist ? artistCapacity({ booth_size: null, ...q }) : 0
  const artist_count = isArtist ? int(input.artist_count) : 0
  if (isArtist && artist_count < 1) errors.artist_count = 'At least one artist.'
  if (isArtist && artist_count > capacity) errors.artist_count = `At most ${capacity} artists for these booths (2 per single, 4 per double).`

  const artists = isArtist ? (input.artists ?? []).map(a => ({
    name: text(a.name, 120),
    nickname: text(a.nickname, 120),
    instagram: text(a.instagram, 120).replace(/^@/, ''),
    styles: Array.isArray(a.styles) ? a.styles.map(s => text(s, 60)).filter(Boolean).slice(0, 12) : [],
    bio: text(a.bio, BIO_MAX),
    photo_url: a.photo_url || null,
    tv_credit: text(a.tv_credit, 120),
    portfolio_urls: Array.isArray(a.portfolio_urls) ? a.portfolio_urls.filter(u => typeof u === 'string' && u).slice(0, 10) : [],
    id_url: a.id_url || null,
    id_later: !!a.id_later && !a.id_url,
  })) : []
  if (artists.length > artist_count) errors.artists = `The roster lists ${artists.length} artists but the application is for ${artist_count}.`
  artists.forEach((a, i) => { if (!a.name) errors[`artists.${i}.name`] = `Artist ${i + 1}: legal name is required.` })

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
  if (!m || !['standard', 'custom', 'comp_booth', 'comp_all'].includes(m.mode)) errors.money = 'Choose how this application is priced.'
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

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  // needs_roster: every listed artist has an ID or is marked "ID later", and the roster is full.
  const rosterComplete = !isArtist || (artists.length >= artist_count && artists.every(a => a.id_url || a.id_later))
  const tvFeatured = isArtist && typeof input.tv_show_featured === 'boolean' ? input.tv_show_featured : null

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
        tv_show_featured: tvFeatured,
        tv_show: tvFeatured ? orNull(text(input.tv_show, 120)) : null,
        logo_url: input.logo_url || null,
        artists: isArtist ? artists : null,
        artists_ids_later: isArtist && artists.some(a => a.id_later),
        ...('id_doc_url' in input ? { id_doc_url: isArtist ? null : input.id_doc_url || null } : {}),
        ...('veteran_id_url' in input ? { veteran_id_url: is_veteran ? input.veteran_id_url || null : null } : {}),
        needs_roster: !rosterComplete,
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
