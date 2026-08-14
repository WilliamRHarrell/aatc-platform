/**
 * Sponsor presentation credit for a schedule item or panel.
 *
 * The value comes pre-resolved from `schedule_items_public` / `panels_public`,
 * which coalesce a CONFIRMED sponsorship's name over the plain-text fallback.
 * That ordering matters and is enforced in the view, not here: an unconfirmed
 * sponsorship must never publish through the schedule, because confirming is
 * the sole publish gate everywhere else on the site.
 *
 * Three states, all valid:
 *   linked   — a confirmed sponsorship is attached; render the name as a link
 *   fallback — the credit is agreed but no sponsorship row exists yet; render
 *              it as plain text so the schedule ships rather than breaking
 *   none     — no credit; render nothing at all, not an empty slot
 */
interface PresentedByProps {
  name: string | null
  website?: string | null
  linked?: boolean
  className?: string
}

export default function PresentedBy({
  name,
  website,
  linked = false,
  className = '',
}: PresentedByProps) {
  if (!name) return null

  const label = <span className="font-semibold">{name}</span>

  return (
    <p className={`text-xs italic ${className}`} style={{ color: '#8B7355' }}>
      Presented by{' '}
      {linked && website ? (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="underline underline-offset-2 transition-colors hover:text-white"
        >
          {label}
        </a>
      ) : (
        label
      )}
    </p>
  )
}
