/**
 * Food truck vendor fee by number of days. The one home of these prices
 * (Ryan, 2026-10-05: 1 day $100, 2 days $200, the full weekend $250).
 *
 * supabase/verify/reconcile_approved_without_invoice.sql block G repeats them
 * (SQL cannot import TypeScript); food-truck-pricing.test.ts fails if the two
 * disagree. Invoices imported from Square keep their invoiced amount.
 */
export const FOOD_TRUCK_PRICE_BY_DAYS: Readonly<Record<number, number>> = { 1: 10000, 2: 20000, 3: 25000 }

export function foodTruckPrice(dayCount: number): number {
  const p = FOOD_TRUCK_PRICE_BY_DAYS[dayCount]
  if (p === undefined) throw new Error(`no food truck price for ${dayCount} day(s)`)
  return p
}
