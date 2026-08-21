import {
  CANVAS_NODE_TYPE,
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_TEXT_COLOR,
  type CanvasNode,
  type NodeShape,
} from "@/types/canvas"

/**
 * Shared, non-component canvas-shape logic used by both the drag source
 * (`components/editor/shape-panel.tsx`) and the drop target
 * (`components/editor/canvas.tsx`) — kept in `lib/` per `code-standards.md`'s
 * "keep modules small and single-purpose" so the default-size table isn't
 * duplicated across the two components that both need it. See spec 12's
 * Analyst Brief, concrete deliverables.
 */

export interface ShapeSize {
  width: number
  height: number
}

/**
 * Ordered list of the 6 supported shapes, per `ui-context.md`'s Canvas >
 * Node Shapes. Order is also the order the shape panel renders its buttons
 * in.
 */
export const CANVAS_SHAPES: readonly NodeShape[] = [
  "rectangle",
  "diamond",
  "circle",
  "pill",
  "cylinder",
  "hexagon",
]

/**
 * Default `{ width, height }` per shape. Rectangle/circle/diamond sizing
 * rules come directly from the spec text (wider-than-tall, square, and
 * larger-than-the-others respectively); pill/cylinder/hexagon sizes are a
 * Senior Developer recommendation — not pinned by the spec, `ui-context.md`,
 * or `project-overview.md`. See spec 12's Analyst Brief, Open Questions #2.
 */
export const SHAPE_DEFAULT_SIZES: Record<NodeShape, ShapeSize> = {
  rectangle: { width: 160, height: 80 },
  circle: { width: 80, height: 80 },
  diamond: { width: 160, height: 160 },
  pill: { width: 160, height: 60 },
  cylinder: { width: 100, height: 120 },
  hexagon: { width: 140, height: 100 },
}

/**
 * Flat minimum node size enforced by `NodeResizer` (`components/editor/
 * canvas-node.tsx`) — a single floor across all 6 shapes rather than a
 * per-shape table, since nothing in the spec text, `ui-context.md`, or
 * `project-overview.md` pins an exact number. 40x40 sits well below every
 * entry in `SHAPE_DEFAULT_SIZES` above, so it stops a node from collapsing
 * into an unusable sliver or empty box without blocking legitimate
 * shrinking. See spec 14's Analyst Brief, Open Questions #3.
 */
export const NODE_MIN_SIZE: ShapeSize = { width: 40, height: 40 }

/** Human-readable label for each shape, used by the shape panel's button titles. */
export const SHAPE_LABELS: Record<NodeShape, string> = {
  rectangle: "Rectangle",
  diamond: "Diamond",
  circle: "Circle",
  pill: "Pill",
  cylinder: "Cylinder",
  hexagon: "Hexagon",
}

export interface ShapeDragPayload extends ShapeSize {
  shape: NodeShape
}

let nodeIdCounter = 0

/**
 * Generates a new node ID from the shape name, a timestamp, and a counter,
 * per the spec's literal recipe — plus a short random suffix to close the
 * cross-client collision gap flagged in spec 12's Analyst Brief, Open
 * Questions #6 (two different browser sessions could otherwise produce the
 * same shape/timestamp/counter combination).
 */
export function generateNodeId(shape: NodeShape): string {
  nodeIdCounter += 1
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  return `${shape}-${Date.now()}-${nodeIdCounter}-${randomSuffix}`
}

let edgeIdCounter = 0

/**
 * Generates a new edge ID, mirroring `generateNodeId`'s recipe (a stable
 * prefix, a timestamp, a counter, and a random suffix to close the same
 * cross-client/cross-run collision gap). No edge-ID equivalent existed
 * anywhere in this codebase before spec 23 — every edge created client-side
 * so far goes through `onConnect`, a `@liveblocks/react-flow`-internal path
 * only reachable from inside the React hook, which assigns its own ID
 * without going through this module. This helper exists for spec 23's
 * server-side (Trigger.dev task) edge-creation action, which has no such
 * internal path available and needs to mint its own edge IDs. See spec 23's
 * Analyst Brief, Open Questions #7.
 */
export function generateEdgeId(): string {
  edgeIdCounter += 1
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  return `edge-${Date.now()}-${edgeIdCounter}-${randomSuffix}`
}

/**
 * Builds the new `CanvasNode` to add on drop: empty label, the default node
 * fill/text color pairing, and the dragged shape/size at the given (already
 * flow-space) position. `textColor` (spec 15) is set alongside `color` here
 * so newly dropped nodes have a real paired value from creation rather than
 * `undefined` — additive only, no change to ID generation or drop-position
 * math.
 */
export function createDroppedNode(
  payload: ShapeDragPayload,
  position: { x: number; y: number },
): CanvasNode {
  return {
    id: generateNodeId(payload.shape),
    type: CANVAS_NODE_TYPE,
    position,
    width: payload.width,
    height: payload.height,
    data: {
      label: "",
      color: DEFAULT_NODE_COLOR,
      textColor: DEFAULT_NODE_TEXT_COLOR,
      shape: payload.shape,
    },
  }
}
