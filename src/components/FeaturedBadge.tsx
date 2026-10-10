/**
 * "Featured": an artist attending the Gold Star VIP Meet & Greet (098). A
 * span, not a link: it sits inside cards that are links themselves.
 */
export default function FeaturedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Featured at the Gold Star VIP Meet & Greet"
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${className}`}
      style={{ backgroundColor: 'rgba(139,115,85,0.2)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.5)' }}
    >
      Featured
    </span>
  )
}
