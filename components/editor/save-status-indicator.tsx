import { AlertCircle, Check, Loader2 } from "lucide-react"
import type { CanvasSaveStatus } from "@/hooks/use-canvas-autosave"

interface SaveStatusIndicatorProps {
  status: CanvasSaveStatus
}

/**
 * Small, non-interactive save-status element for `WorkspaceNavbar`. This
 * repo has no manual "Save" button anywhere (confirmed via grep across
 * `components/`) and spec 21's own text only describes automatic, debounced
 * autosave — no manual "Save Now" trigger exists to attach a status to. This
 * renders in the slot a manual Save button might otherwise occupy, not as a
 * clickable action itself. See spec 21's Analyst Brief, Open Questions #1.
 *
 * Renders nothing for `"idle"` (no save attempted yet this session), so the
 * navbar doesn't show a stale/misleading status before any change has
 * happened.
 */
export function SaveStatusIndicator({ status }: SaveStatusIndicatorProps) {
  if (status === "idle") {
    return null
  }

  if (status === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-copy-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Saving…
      </span>
    )
  }

  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-state-error">
        <AlertCircle className="h-4 w-4" />
        Save failed
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-state-success">
      <Check className="h-4 w-4" />
      Saved
    </span>
  )
}
