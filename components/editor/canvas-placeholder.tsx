/**
 * Static stand-in for the canvas surface. No React Flow, no Liveblocks —
 * that lands in spec 10+. Fills the remaining space beside the AI sidebar.
 */
export function CanvasPlaceholder() {
  return (
    <div className="flex flex-1 items-center justify-center bg-base">
      <p className="text-sm text-copy-muted">Canvas coming soon</p>
    </div>
  )
}
