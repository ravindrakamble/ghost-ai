import type { NodeProps } from "@xyflow/react"
import { ShapeVisual } from "@/components/editor/shape-visual"
import { type CanvasNode as CanvasNodeType } from "@/types/canvas"

/**
 * Custom node renderer registered for `CANVAS_NODE_TYPE`. Shape-correct
 * rendering (CSS for rectangle/pill/circle, inline SVG for diamond/hexagon/
 * cylinder) is delegated to the shared `ShapeVisual` — see spec 13's
 * Analyst Brief, Open Questions #3 — so this component only owns the
 * label/placeholder content and the `selected` → border-brightness wiring
 * (React Flow's `NodeProps.selected`, already available with zero new
 * wiring).
 */
export function CanvasNode({ data, selected }: NodeProps<CanvasNodeType>) {
  return (
    <ShapeVisual shape={data.shape} color={data.color} selected={selected}>
      {data.label ? (
        <span className="truncate">{data.label}</span>
      ) : (
        <span className="text-copy-faint">Untitled</span>
      )}
    </ShapeVisual>
  )
}
