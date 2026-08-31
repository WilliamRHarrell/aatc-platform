/**
 * Sponsor presentation credit for a schedule item or panel.
 *
 * The value comes pre-resolved from `schedule_items_public` / `panels_public`,
 * which since migration 065 coalesce THREE sources in this order:
 *
 *   confirmed sponsorship -> confirmed presentation credit -> text fallback
 *
 * That ordering matters and is enforced in the view, not here. Two reasons,
 * and neither is stylistic:
 *
 *   - Nothing UNCONFIRMED may publish, in either table. Confirming is the sole
 *     publish gate everywhere else on the site, so the schedule must not become
 *     a back door that announces a sponsor or a buyer early.
 *   - The sponsorship outranks the credit because it is the only source that
 *     also carries `website`. If a credit's name could outrank it, an item
 *     holding both would render one company's name linked to another company's
 *     site, and nothing would catch it.
 *
 * Three render states, all valid:
 *   linked - a confirmed sponsorship is attached; render the name as a link
 *   plain text - the credit is agreed, as a `presentation_credits` row or as
 *              the older text fallback, but no sponsorship is linked; render it
 *              as text so the schedule ships rather than breaking
 *   none - no credit; render nothing at all, not an empty slot
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
