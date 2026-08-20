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
 * Data carried by a canvas node. `color`/`textColor` are expected to be one
 * of `NODE_COLORS`' 8 paired fill/text colors (below), kept as plain
 * `string` rather than a union of that constant's members so this type
 * doesn't need to change if the palette itself ever does.
 *
 * `textColor` was added in spec 15 (Nodes Color Toolbar) — see that spec's
 * Analyst Brief, Open Questions #1: without a real per-node `textColor`,
 * `ShapeVisual` had no way to pair a node's label color with its fill when
 * the fill changes via the color toolbar.
 */
export interface CanvasNodeData extends Record<string, unknown> {
  label: string
  color: string
  textColor: string
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

/**
 * Default node fill color, per `ui-context.md`'s Canvas > Node Color
 * Palette ("Default node color: #1F1F1F with #EDEDED text"). Spec 12 adds
 * only this single default — not the full 8-color `NODE_COLORS` palette,
 * since nothing in that spec's scope needs a color picker. See spec 12's
 * Analyst Brief, Open Questions #3.
 */
export const DEFAULT_NODE_COLOR = "#1F1F1F"

/**
 * Text color paired with `DEFAULT_NODE_COLOR` above, per the same
 * `ui-context.md` line. Needed by `CanvasNode`'s renderer to keep the label
 * legible against the fill; not part of the brief's literal ask but the
 * documented pairing, not an invented value — same "documented data value"
 * precedent as `CURSOR_COLORS` (spec 10).
 */
export const DEFAULT_NODE_TEXT_COLOR = "#EDEDED"

/** One fill/text color pairing from `NODE_COLORS`. */
export interface NodeColorPair {
  color: string
  textColor: string
}

/**
 * The 8 predefined node fill/text color pairs, per `ui-context.md`'s Canvas
 * > Node Color Palette table. Added in spec 15 (Nodes Color Toolbar) — the
 * table previously existed only as documentation with no matching code
 * constant (confirmed via grep against `app/globals.css`: none of these hex
 * values exist as theme tokens today), so these are net-new values defined
 * here rather than a reuse of existing CSS custom properties, per that
 * spec's own instruction ("keep the palette in the canvas types/constants").
 *
 * The first entry intentionally reuses `DEFAULT_NODE_COLOR`/
 * `DEFAULT_NODE_TEXT_COLOR` rather than duplicating their hex values, so the
 * default pairing can't drift out of sync between the two constants.
 */
export const NODE_COLORS: readonly NodeColorPair[] = [
  { color: DEFAULT_NODE_COLOR, textColor: DEFAULT_NODE_TEXT_COLOR }, // Neutral dark (default)
  { color: "#10233D", textColor: "#52A8FF" }, // Blue
  { color: "#2E1938", textColor: "#BF7AF0" }, // Purple
  { color: "#331B00", textColor: "#FF990A" }, // Orange
  { color: "#3C1618", textColor: "#FF6166" }, // Red
  { color: "#3A1726", textColor: "#F75F8F" }, // Pink
  { color: "#0F2E18", textColor: "#62C073" }, // Green
  { color: "#062822", textColor: "#0AC7B4" }, // Teal
]
