import type { Edge, Node } from "@xyflow/react"

/**
 * Shared canvas vocabulary for the Liveblocks-backed React Flow canvas.
 *
 * Spec 11 (base canvas) only pins this shape down so later specs don't each
 * invent their own — it does not build or register any node/edge visual
 * components. Nothing in this spec's rendering path references
 * `CANVAS_NODE_TYPE`/`CANVAS_EDGE_TYPE` yet (the canvas starts empty and
 * uses React Flow's default node/edge rendering); a future spec registers
 * them via `nodeTypes`/`edgeTypes` once the actual visual components exist.
 * See spec 11's Analyst Brief, Open Questions #4 and #5.
 */

/**
 * The 6 supported node shapes. Complex shapes (diamond, hexagon, cylinder)
 * are rendered as inline SVGs rather than CSS borders once custom node
 * rendering exists — see `ui-context.md`'s Canvas > Node Shapes.
 */
export type NodeShape = "rectangle" | "diamond" | "circle" | "pill" | "cylinder" | "hexagon"

/**
 * Data carried by a canvas node. `color` is expected to be one of
 * `ui-context.md`'s 8 node fill colors once the `NODE_COLORS` palette
 * constant is defined (deferred to whichever spec first builds the actual
 * node component — see Open Questions #5) — kept as `string` here rather
 * than a union so this type doesn't need to change when that happens.
 */
export interface CanvasNodeData extends Record<string, unknown> {
  label: string
  color: string
  shape: NodeShape
}

/** Data carried by a canvas edge. Optional label for a future edge component. */
export interface CanvasEdgeData extends Record<string, unknown> {
  label?: string
}

/** React Flow `type` identifier for future custom node registration. */
export const CANVAS_NODE_TYPE = "canvasNode"

/** React Flow `type` identifier for future custom edge registration. */
export const CANVAS_EDGE_TYPE = "canvasEdge"

export type CanvasNodeType = typeof CANVAS_NODE_TYPE
export type CanvasEdgeType = typeof CANVAS_EDGE_TYPE

/** Fully-typed node/edge aliases for when custom rendering is registered. */
export type CanvasNode = Node<CanvasNodeData, CanvasNodeType>
export type CanvasEdge = Edge<CanvasEdgeData, CanvasEdgeType>
