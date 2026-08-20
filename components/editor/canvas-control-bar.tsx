"use client"

import { Maximize, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface CanvasControlBarProps {
  /** Calls the real React Flow instance's `zoomIn` (with a duration). */
  onZoomIn: () => void
  /** Calls the real React Flow instance's `zoomOut` (with a duration). */
  onZoomOut: () => void
  /** Calls the real React Flow instance's `fitView` (with a duration). */
  onFitView: () => void
  /** Calls Liveblocks' `useUndo()` handler. */
  onUndo: () => void
  /** Calls Liveblocks' `useRedo()` handler. */
  onRedo: () => void
  /** From Liveblocks' `useCanUndo()` — disables/dims the undo button when `false`. */
  canUndo: boolean
  /** From Liveblocks' `useCanRedo()` — disables/dims the redo button when `false`. */
  canRedo: boolean
}

/**
 * Floating pill-shaped control bar: zoom controls (zoom out / fit view /
 * zoom in) in one group, a thin divider, then history controls (undo /
 * redo) in a second group. Bottom-left, positioned above `ShapePanel`
 * (bottom-center) so the two floating toolbars never overlap — see spec
 * 17's Analyst Brief, Concrete deliverables. Same floating-overlay visual
 * language as `ShapePanel` (`rounded-full`, `bg-elevated`/
 * `border-surface-border`).
 *
 * Rendered by `CanvasFlow` (`components/editor/canvas.tsx`) as a sibling of
 * `<ReactFlow>`, inside the same context-provider-only ancestor chain
 * (`RoomProvider`/`ClientSideSuspense`/`ReactFlowProvider` render no DOM of
 * their own), so it resolves its `absolute` positioning against `Canvas`'s
 * outer `relative` wrapper — the same positioning context `ShapePanel`
 * itself uses. Zoom/undo/redo handlers and the two `can*` booleans are read
 * from the real React Flow instance and Liveblocks' history hooks in
 * `CanvasFlow` and passed down as plain props, not read from a new context
 * — see spec 17's Analyst Brief, Open Questions #4.
 *
 * Undo/redo buttons use the shadcn `Button`'s native `disabled` prop —
 * `buttonVariants` already ships `disabled:opacity-50 disabled:pointer-events-none`,
 * satisfying "keep disabled buttons visually dimmed" with no custom CSS —
 * see spec 17's Analyst Brief, Concrete deliverables.
 */
export function CanvasControlBar({
  onZoomIn,
  onZoomOut,
  onFitView,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: CanvasControlBarProps) {
  return (
    <div className="pointer-events-none absolute bottom-24 left-6 z-10">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-surface-border bg-elevated p-1.5 shadow-lg">
        <Button variant="ghost" size="icon-lg" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
          <ZoomOut />
        </Button>
        <Button variant="ghost" size="icon-lg" onClick={onFitView} title="Fit view" aria-label="Fit view">
          <Maximize />
        </Button>
        <Button variant="ghost" size="icon-lg" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in">
          <ZoomIn />
        </Button>
        {/*
          Thin single-token divider between the two button groups — see spec
          17's Analyst Brief, Open Questions #3: `border-surface-border`'s
          paired `--color-surface-border` token, applied as a 1px background
          fill rather than a new visual element/token.
        */}
        <div aria-hidden className="mx-1 h-5 w-px bg-surface-border" />
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
          aria-label="Undo"
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
          aria-label="Redo"
        >
          <Redo2 />
        </Button>
      </div>
    </div>
  )
}
