'use client'

/**
 * Honeypot input. Renders off-screen, NOT with display:none.
 *
 * Three things make it safe for someone using a screen reader or a keyboard,
 * which matters because the penalty for touching it is a silently rejected
 * submission:
 *
 *   aria-hidden on the wrapper  - assistive tech never announces it
 *   tabIndex={-1}               - it cannot be reached by tabbing
 *   a real <label>              - if the CSS ever fails to load, the field
 *                                 appears on screen with "Leave this blank"
 *                                 next to it rather than as a mystery input
 *
 * aria-hidden on a focusable element would itself be a defect, which is why the
 * tabIndex is not optional here - the two go together.
 *
 * Off-screen rather than display:none on purpose: a bot that renders CSS skips
 * hidden inputs, so display:none catches less. Off-screen also degrades more
 * honestly if styling is stripped.
 *
 * autoComplete is off so a browser's saved-address feature cannot fill it in
 * and lock a real person out of the form.
 */
export default function HoneypotField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}
    >
      <label htmlFor="website-url">Leave this blank</label>
      <input
        id="website-url"
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}
