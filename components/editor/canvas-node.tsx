import type { NodeProps } from "@xyflow/react"
import { DEFAULT_NODE_TEXT_COLOR, type CanvasNode as CanvasNodeType } from "@/types/canvas"

/**
 * Custom node renderer registered for `CANVAS_NODE_TYPE`. For this unit,
 * every shape renders as a bordered rectangle with the label centered —
 * shape-specific inline-SVG visuals (diamond, hexagon, cylinder, etc., per
 * `ui-context.md`'s Canvas > Node Shapes) are explicitly out of scope for
 * spec 12 and land in a later spec.
 */
export function CanvasNode({ data }: NodeProps<CanvasNodeType>) {
  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-xl border border-surface-border px-3 text-center text-sm"
      style={{ backgroundColor: data.color, color: DEFAULT_NODE_TEXT_COLOR }}
    >
      {data.label ? (
        <span className="truncate">{data.label}</span>
      ) : (
        <span className="text-copy-faint">Untitled</span>
      )}
    </div>
  )
}
