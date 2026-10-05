/**
 * When editing a food truck's days may re-price its invoice to the day-based
 * price (admin/food-trucks PRICING). Never for an invoice imported from Square
 * (payment_reference "Square #N ...": its amount is what was invoiced and is
 * grandfathered, Ryan 2026-10-05) or one with any payment recorded: changing
 * the amount under a payment is a billing change, made in Invoices.
 */
export function truckInvoiceRepriceable(inv: { status: string; amount_paid: number | null; payment_reference: string | null }): boolean {
  return inv.status === 'pending' && (inv.amount_paid ?? 0) === 0 && !/^Square #/.test(inv.payment_reference ?? '')
}
