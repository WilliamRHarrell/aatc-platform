import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Safe markdown renderer for editable page content.
 *
 * Server component on purpose: CMS prose must land in the server HTML so it is
 * indexable. react-markdown's default export is the synchronous `Markdown`
 * (the hook-based variant is the separate `MarkdownHooks` export), so this
 * renders fine without a client boundary. Do not add 'use client' here - it
 * would drag every page that renders CMS copy back into the client bundle.
 *
 * - No raw HTML execution (rehype-raw intentionally NOT used).
 * - `inline`: render children without a block <p> wrapper (for headings/labels).
 */
export default function Markdown({
  children,
  inline = false,
  className,
}: {
  children: string
  inline?: boolean
  className?: string
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (inline ? <>{children}</> : <p className={className}>{children}</p>),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: '#C4A882' }}
          >
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
        strong: ({ children }) => <strong style={{ color: '#fff' }}>{children}</strong>,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
