/**
 * Public "Veteran" badge (100): a text label with a small American flag in
 * our gold. The flag is decorative (aria-hidden); the text carries the
 * meaning. No stars are drawn: a gold star means a Gold Star family, and the
 * badge must not read as one or as the Gold Star VIP Meet & Greet (Ryan,
 * 2026-10-10). A span, not a link: it sits inside cards that are links.
 */
export default function VeteranBadge({ label, className = '' }: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${className}`}
      style={{ backgroundColor: 'rgba(196,168,130,0.12)', color: '#C4A882', border: '1px solid rgba(196,168,130,0.45)' }}
    >
      <svg aria-hidden="true" focusable="false" width="14" height="10" viewBox="0 0 14 10" className="shrink-0">
        {/* 7 stripes: gold on alternate rows; the canton is a plain block */}
        {[0, 2, 4, 6].map(i => <rect key={i} x="0" y={i * (10 / 7)} width="14" height={10 / 7} fill="#C4A882" />)}
        <rect x="0" y="0" width="6" height={4 * (10 / 7)} fill="#8B7355" />
      </svg>
      {label}
    </span>
  )
}
