import ReactMarkdown, { type Components } from "react-markdown"
import { cn } from "@/lib/utils"

/**
 * Renders a project's latest generated spec Markdown on the public
 * `/share/[token]` page (spec 34). Mirrors (does not import)
 * `spec-preview-modal.tsx`'s `react-markdown` + token-mapped `components`
 * approach — that modal is coupled to the authenticated download route and
 * shadcn `Dialog` chrome this page doesn't use, per spec 34's Analyst
 * Brief, Dependencies. No `"use client"` needed: `react-markdown` renders
 * synchronously with no browser APIs, so this stays a plain Server
 * Component like the rest of this page.
 */
const PUBLIC_MARKDOWN_COMPONENTS: Components = {
  h1: ({ ...props }) => <h1 className="mt-4 mb-2 text-lg font-semibold text-copy-primary first:mt-0" {...props} />,
  h2: ({ ...props }) => <h2 className="mt-4 mb-2 text-base font-semibold text-copy-primary first:mt-0" {...props} />,
  h3: ({ ...props }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold text-copy-primary first:mt-0" {...props} />,
  p: ({ ...props }) => <p className="mb-3 text-sm leading-relaxed text-copy-secondary last:mb-0" {...props} />,
  ul: ({ ...props }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-copy-secondary" {...props} />,
  ol: ({ ...props }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-copy-secondary" {...props} />,
  li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
  a: ({ ...props }) => <a className="text-brand underline underline-offset-2" {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold text-copy-primary" {...props} />,
  blockquote: ({ ...props }) => (
    <blockquote className="mb-3 border-l-2 border-surface-border pl-3 text-sm text-copy-muted" {...props} />
  ),
  code: ({ className, children, ...props }) => (
    <code
      className={cn("rounded-xl bg-subtle px-1 py-0.5 font-mono text-xs text-copy-primary", className)}
      {...props}
    >
      {children}
    </code>
  ),
  pre: ({ ...props }) => (
    <pre
      className="mb-3 overflow-x-auto rounded-2xl border border-surface-border bg-subtle p-3 font-mono text-xs text-copy-primary"
      {...props}
    />
  ),
}

interface PublicSpecViewProps {
  markdown: string
}

export function PublicSpecView({ markdown }: PublicSpecViewProps) {
  return (
    <div className="rounded-2xl border border-surface-border bg-elevated p-4">
      <ReactMarkdown components={PUBLIC_MARKDOWN_COMPONENTS}>{markdown}</ReactMarkdown>
    </div>
  )
}
