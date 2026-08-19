import {
  CANVAS_NODE_TYPE,
  DEFAULT_NODE_COLOR,
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

/** Human-readable label for each shape, used by the shape panel's button titles. */
export const SHAPE_LABELS: Record<NodeShape, string> = {
  rectangle: "Rectangle",
  diamond: "Diamond",
  circle: "Circle",
  pill: "Pill",
  cylinder: "Cylinder",
  hexagon: "Hexagon",
}

/**
 * Custom `dataTransfer` MIME type used to carry the drag payload from the
 * shape panel to the canvas drop handler. A dedicated type (rather than
 * `text/plain`) lets `onDragOver` check `event.dataTransfer.types` to
 * confirm the drag actually originates from a shape button before calling
 * `preventDefault()`.
 */
export const CANVAS_DRAG_MIME_TYPE = "application/x-ghost-node-shape"

export interface ShapeDragPayload extends ShapeSize {
  shape: NodeShape
}

function isNodeShape(value: unknown): value is NodeShape {
  return typeof value === "string" && (CANVAS_SHAPES as readonly string[]).includes(value)
}

/** Builds the `dataTransfer` payload string for starting a shape drag. */
export function serializeShapeDragPayload(shape: NodeShape): string {
  const size = SHAPE_DEFAULT_SIZES[shape]
  const payload: ShapeDragPayload = { shape, width: size.width, height: size.height }
  return JSON.stringify(payload)
}

/**
 * Parses and validates a `dataTransfer` payload string read on drop.
 * Returns `null` for anything malformed or untrusted (unknown shape, missing
 * fields, non-numeric sizes) — external input read at a drop boundary must
 * be validated before it's trusted, per `code-standards.md`.
 */
export function parseShapeDragPayload(raw: string): ShapeDragPayload | null {
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed !== "object" || parsed === null) return null
  const candidate = parsed as Record<string, unknown>

  if (!isNodeShape(candidate.shape)) return null
  if (typeof candidate.width !== "number" || !Number.isFinite(candidate.width) || candidate.width <= 0) {
    return null
  }
  if (typeof candidate.height !== "number" || !Number.isFinite(candidate.height) || candidate.height <= 0) {
    return null
  }

  return { shape: candidate.shape, width: candidate.width, height: candidate.height }
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

/**
 * Builds the new `CanvasNode` to add on drop: empty label, the default node
 * color, and the dragged shape/size at the given (already flow-space)
 * position.
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
      shape: payload.shape,
    },
  }
}
