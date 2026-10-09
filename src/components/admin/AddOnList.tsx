import { addOnLines, type AddOn } from '@/lib/pricing'
import { formatCurrency } from '@/lib/utils'

/**
 * What an exhibitor ordered beyond the booth (applications.add_ons), priced by
 * the same loop the total uses (lib/pricing.ts addOnLines). Shown in the
 * applications drawer and on the booth detail page; before 2026-10-09 the
 * add-ons were counted in the total but shown nowhere in admin.
 */
export default function AddOnList({ addOns, labelColor = '#8B7355' }: { addOns: unknown; labelColor?: string }) {
  const lines = addOnLines(Array.isArray(addOns) ? (addOns as AddOn[]) : [])
  return (
    <div className="col-span-full">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: labelColor }}>Add-ons</p>
      {lines.length === 0 ? (
        <p className="mt-0.5 text-sm" style={{ color: '#666' }}>None</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {lines.map(l => (
            <li key={l.label} className="flex justify-between gap-4 text-sm text-white">
              <span>{l.label}</span>
              <span style={{ color: '#C4A882' }}>{formatCurrency(l.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
