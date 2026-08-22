"use client"

import { useState } from "react"
import { Download, FileText, Loader2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SpecPreviewModal } from "@/components/editor/spec-preview-modal"
import { useProjectSpecs, type ProjectSpecSummary } from "@/hooks/use-project-specs"
import { cn } from "@/lib/utils"

interface SpecsTabProps {
  /** The current project's ID -- needed for `useProjectSpecs`' own `GET
   * /api/projects/[projectId]/specs` call and every download/preview URL
   * built below. Threaded down from `AiSidebar` (spec 29). */
  projectId: string
}

/** Formats a spec's ISO `createdAt` for display next to its filename. Locale
 * pinned to `"en-US"` for a deterministic format *shape* across
 * environments, same convention `ai-architect-tab.tsx#formatMessageTimestamp`
 * already established for chat bubble timestamps. */
function formatCreatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
}

/**
 * Specs tab (spec 20's static shell, rewritten by spec 29): a real, fetched
 * list of the current project's generated specs (`useProjectSpecs`, backed
 * by spec 28's `GET /api/projects/[projectId]/specs`), rendered as a
 * compact, scrollable shadcn `ScrollArea` list inside the existing sidebar
 * shell -- only this tab's own internal content changes, `ai-sidebar.tsx`'s
 * header/tab structure stays as spec 20 built it (only the wrapping
 * `TabsContent`'s className was adjusted to match the AI Architect tab's own
 * proven `flex flex-1 flex-col overflow-hidden` layout, needed so this
 * component's internal `ScrollArea` gets a real bounded height to scroll
 * within).
 *
 * Clicking a list item opens `SpecPreviewModal`. Each item also carries its
 * own real `<a href download>` download action pointed at spec 28's
 * download route -- the same route the preview modal's own download button
 * uses, and the same route the modal's `fetch()`-based preview reads from
 * (spec 29's Analyst Brief, Open Questions #2). No Blob URL is ever read or
 * constructed client-side.
 *
 * The "Generate Spec" button stays exactly as spec 20 left it: present,
 * enabled-looking, no wired handler. Wiring it to actually trigger a new
 * spec-generation run is out of scope for this pass -- see this spec's
 * Analyst Brief, Open Questions #1 (flagged again in this spec's Dev Notes
 * as a real, visible gap for the Product Owner).
 */
export function SpecsTab({ projectId }: SpecsTabProps) {
  const { specs, isLoading, error, refetch } = useProjectSpecs(projectId)
  const [previewSpec, setPreviewSpec] = useState<ProjectSpecSummary | null>(null)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-3 p-4">
        <Button type="button" className="w-full">
          Generate Spec
        </Button>
      </div>

      <div className="min-h-0 flex-1 px-4 pb-4">
        {error ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-xs text-state-error">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-copy-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading specs…
          </div>
        ) : specs.length === 0 ? (
          <p className="py-6 text-center text-sm text-copy-muted">No specs generated yet.</p>
        ) : (
          <ScrollArea className="h-full">
            <ul className="flex flex-col gap-2 pr-3">
              {specs.map((spec) => (
                <li key={spec.id}>
                  <div className="flex items-start gap-2 rounded-2xl border border-surface-border bg-elevated p-3">
                    <button
                      type="button"
                      onClick={() => setPreviewSpec(spec)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-subtle text-ai-text">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-copy-primary">{spec.filename}</p>
                        <p className="truncate text-xs text-copy-muted">{formatCreatedAt(spec.createdAt)}</p>
                      </div>
                    </button>
                    <a
                      href={`/api/projects/${projectId}/specs/${spec.id}/download`}
                      download
                      className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "shrink-0")}
                    >
                      <Download />
                      <span className="sr-only">Download {spec.filename}</span>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>

      <SpecPreviewModal
        projectId={projectId}
        spec={previewSpec}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewSpec(null)
          }
        }}
      />
    </div>
  )
}
