"use client"

import { useEffect, useState } from "react"
import { Download, Loader2 } from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import { buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { ProjectSpecSummary } from "@/hooks/use-project-specs"

interface SpecPreviewModalProps {
  projectId: string
  /** The spec to preview, or `null` to keep the dialog closed. Passing a new
   * spec while the dialog is already open (not currently reachable from
   * `SpecsTab`'s own click handling, which always closes first) is also
   * handled correctly -- the fetch effect keys off `spec.id`. */
  spec: ProjectSpecSummary | null
  onOpenChange: (open: boolean) => void
}

/** Fetched-content cache, tagged with the spec id it belongs to -- lets
 * `isLoading`/`markdown`/`error` all be derived instead of requiring a
 * separate, effect-body-synchronous `setIsLoading(true)` call (see this
 * component's docblock below). */
interface SpecContentState {
  specId: string
  markdown: string | null
  error: string | null
}

/** Small, token-based element overrides so rendered Markdown reads as
 * genuinely formatted content (headings, lists, code blocks visually
 * distinct from body text) rather than react-markdown's browser-default
 * styling -- no `@tailwindcss/typography` plugin is installed in this
 * codebase, so this is a deliberately minimal manual mapping instead of
 * pulling in a second styling dependency for one modal. */
const MARKDOWN_COMPONENTS: Components = {
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
      className={cn(
        "rounded-xl bg-subtle px-1 py-0.5 font-mono text-xs text-copy-primary",
        className
      )}
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

/**
 * Preview modal for a single generated spec (spec 29). Opens when `spec`
 * becomes non-null (a spec list item was clicked), fetches that spec's
 * Markdown content through the existing, access-checked download route
 * (`GET /api/projects/[projectId]/specs/[specId]/download`, spec 28) via a
 * plain `fetch()` call, and renders it as real formatted Markdown via
 * `react-markdown` -- not an unrendered `<pre>` dump. The same route also
 * backs the actual file-save download action below, via a real
 * `<a href download>` navigation rather than a second `fetch()` -- one
 * route, two client-side invocation mechanisms, per this spec's Analyst
 * Brief, Open Questions #2. The client never constructs a Blob URL or reads
 * `ProjectSpec.filePath` directly.
 *
 * Built on the same `components/ui/dialog.tsx` primitives
 * `starter-templates-modal.tsx`/`share-dialog.tsx` already use -- Escape,
 * backdrop click, and focus trapping come for free from that file's
 * underlying `@base-ui/react` `Dialog` primitive, no extra keyboard
 * handling needed here.
 *
 * Fetched content lives only in this component's own local state
 * (`SpecContentState`, tagged by spec id) for as long as the modal stays
 * open or has been opened this session -- discarded/reset on close, never
 * cached in a persistent store (Scope Limit: "do not store spec content in
 * frontend state long-term").
 */
export function SpecPreviewModal({ projectId, spec, onOpenChange }: SpecPreviewModalProps) {
  const [content, setContent] = useState<SpecContentState | null>(null)

  const isOpen = spec !== null
  const downloadUrl = spec ? `/api/projects/${projectId}/specs/${spec.id}/download` : null

  // Derived, not stored: avoids ever needing a direct, pre-`await`
  // `setIsLoading(true)` inside the effect body below (the exact pattern
  // `hooks/use-project-specs.ts`'s docblock explains gets flagged by
  // `react-hooks/set-state-in-effect`). `content` only ever reflects the
  // most recently *completed* fetch, tagged with the spec id it's for.
  const isCurrent = spec !== null && content !== null && content.specId === spec.id
  const markdown = isCurrent ? content.markdown : null
  const loadError = isCurrent ? content.error : null
  const isLoading = spec !== null && !isCurrent

  useEffect(() => {
    if (!spec) {
      return
    }

    let cancelled = false
    const specId = spec.id

    async function loadContent() {
      try {
        const response = await fetch(`/api/projects/${projectId}/specs/${specId}/download`)
        if (cancelled) return

        if (!response.ok) {
          setContent({
            specId,
            markdown: null,
            error: "Failed to load this spec. It may still be finishing generation -- try again shortly.",
          })
          return
        }

        const text = await response.text()
        if (!cancelled) {
          setContent({ specId, markdown: text, error: null })
        }
      } catch {
        if (!cancelled) {
          setContent({
            specId,
            markdown: null,
            error: "Failed to load this spec. Please check your connection and try again.",
          })
        }
      }
    }

    void loadContent()

    return () => {
      cancelled = true
    }
  }, [spec, projectId])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setContent(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl rounded-3xl">
        <DialogHeader>
          <DialogTitle className="truncate text-copy-primary">
            {spec?.filename ?? "Spec preview"}
          </DialogTitle>
          <DialogDescription className="text-copy-secondary">
            {spec ? `Generated ${new Date(spec.createdAt).toLocaleString()}` : ""}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 rounded-2xl border border-surface-border bg-elevated">
          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-copy-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading spec…
              </div>
            ) : loadError ? (
              <p className="py-6 text-center text-sm text-state-error">{loadError}</p>
            ) : (
              <ReactMarkdown components={MARKDOWN_COMPONENTS}>{markdown}</ReactMarkdown>
            )}
          </div>
        </ScrollArea>

        {downloadUrl && (
          <a
            href={downloadUrl}
            download
            className={cn(buttonVariants({ variant: "outline" }), "w-full justify-center gap-1.5")}
          >
            <Download />
            Download
          </a>
        )}
      </DialogContent>
    </Dialog>
  )
}
