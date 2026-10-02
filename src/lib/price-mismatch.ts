/**
 * The database refuses an applicant total that is not the list price
 * (application_list_price, migration 079). The only way a real applicant hits
 * that is a form opened before a price change: its total was computed with the
 * old prices, and retrying from the same tab fails every time. Say so.
 */
export const PRICE_CHANGED_MESSAGE =
  'Prices changed since this page was opened. Reload the page to see the current total, then submit again.'

export function isPriceMismatchError(err: { message?: string } | null | undefined): boolean {
  return !!err?.message && /does not match the list price/i.test(err.message)
}
