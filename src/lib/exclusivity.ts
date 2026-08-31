/**
 * Negotiated exclusives. INTERNAL ONLY - never rendered, never public.
 *
 * ⚠  ADDING A CATEGORY IS A CODE CHANGE, IN TWO PLACES.
 *
 * The list below AND the check constraint in
 * supabase/migrations/062_exclusivity_grants.sql must agree. Adding one here
 * without a migration means the admin offers a category the database refuses;
 * adding it there without this means the admin never offers it.
 *
 * That duplication is deliberate. A free-text category cannot be checked for a
 * conflict - the whole mechanism is a unique index on (event_id, category), and
 * an index cannot tell that 'tattoo_battle' and 'Tattoo Battle' are the same
 * exclusive. A controlled list is what makes the guarantee possible.
 *
 * If Ryan sells a new exclusive in 2028: add it here, add it to the constraint
 * in a new migration, and the admin picks it up with no further work.
 */
export const EXCLUSIVITY_CATEGORIES = [
  { value: 'on_site_supplier',        label: 'On-site supplier' },
  { value: 'accounting_presentation', label: 'Accounting / bookkeeping presentation' },
  { value: 'tattoo_battle',           label: 'Tattoo Battle sponsor' },
] as const

export type ExclusivityCategory = (typeof EXCLUSIVITY_CATEGORIES)[number]['value']

export function exclusivityLabel(value: string): string {
  return EXCLUSIVITY_CATEGORIES.find(c => c.value === value)?.label ?? value
}
