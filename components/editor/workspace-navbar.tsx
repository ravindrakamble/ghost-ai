import { LayoutTemplate, MessageSquareText, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface WorkspaceNavbarProps {
  projectName: string
  isAiSidebarOpen: boolean
  onToggleAiSidebar: () => void
  onOpenShare: () => void
  onOpenTemplates: () => void
}

/**
 * Second-level bar rendered inside this route's own workspace shell (not the
 * shared `EditorNavbar`) — see spec 08's Open Questions #1. Share opens the
 * Share dialog (spec 09); the AI sidebar toggle is real local UI state
 * controlling the placeholder's visibility; Templates opens the starter
 * templates modal (spec 18), mirroring `onOpenShare`'s prop shape.
 */
export function WorkspaceNavbar({
  projectName,
  isAiSidebarOpen,
  onToggleAiSidebar,
  onOpenShare,
  onOpenTemplates,
}: WorkspaceNavbarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border bg-surface px-4">
      <h1 className="truncate text-sm font-semibold text-copy-primary">{projectName}</h1>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpenTemplates}>
          <LayoutTemplate />
          Templates
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpenShare}>
          <Share2 />
          Share
        </Button>
        <Button
          variant={isAiSidebarOpen ? "secondary" : "ghost"}
          size="icon-sm"
          aria-pressed={isAiSidebarOpen}
          onClick={onToggleAiSidebar}
        >
          <MessageSquareText />
          <span className="sr-only">Toggle AI sidebar</span>
        </Button>
      </div>
    </header>
  )
}
