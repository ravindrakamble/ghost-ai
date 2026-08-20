import { Download, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Specs tab (spec 20) — a "Generate Spec" button (enabled-looking, no wired
 * handler yet — specs 27/29 wire real generation and persistence) and
 * exactly one static demo spec card illustrating the future spec-list
 * layout. No data fetching, no real spec list: spec 29 explicitly says to
 * reuse this "existing sidebar layout, do not redesign."
 */
export function SpecsTab() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Button type="button" className="w-full">
        Generate Spec
      </Button>

      <div className="flex items-start gap-3 rounded-2xl border border-surface-border bg-elevated p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-subtle text-ai-text">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-copy-primary">System Design Spec</p>
          <p className="line-clamp-2 text-xs text-copy-muted">
            Architecture overview, data flow, and API contracts derived from the canvas.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" disabled>
          <Download />
          <span className="sr-only">Download spec</span>
        </Button>
      </div>
    </div>
  )
}
