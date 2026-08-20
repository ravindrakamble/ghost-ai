import { describe, expect, it } from "vitest"
import {
  CANVAS_DRAG_MIME_TYPE,
  CANVAS_SHAPES,
  NODE_MIN_SIZE,
  SHAPE_DEFAULT_SIZES,
  createDroppedNode,
  generateNodeId,
  parseShapeDragPayload,
  serializeShapeDragPayload,
} from "./canvas-shapes"
import { CANVAS_NODE_TYPE, DEFAULT_NODE_COLOR, DEFAULT_NODE_TEXT_COLOR } from "@/types/canvas"

describe("SHAPE_DEFAULT_SIZES", () => {
  it("gives every one of the 6 supported shapes a positive default size", () => {
    expect(CANVAS_SHAPES).toHaveLength(6)
    for (const shape of CANVAS_SHAPES) {
      const size = SHAPE_DEFAULT_SIZES[shape]
      expect(size.width).toBeGreaterThan(0)
      expect(size.height).toBeGreaterThan(0)
    }
  })

  it("matches the spec's explicit sizing rules: rectangle wider than tall, circle square, diamond larger than circle", () => {
    expect(SHAPE_DEFAULT_SIZES.rectangle.width).toBeGreaterThan(SHAPE_DEFAULT_SIZES.rectangle.height)
    expect(SHAPE_DEFAULT_SIZES.circle.width).toBe(SHAPE_DEFAULT_SIZES.circle.height)
    expect(SHAPE_DEFAULT_SIZES.diamond.width).toBeGreaterThan(SHAPE_DEFAULT_SIZES.circle.width)
    expect(SHAPE_DEFAULT_SIZES.diamond.height).toBeGreaterThan(SHAPE_DEFAULT_SIZES.circle.height)
  })
})

describe("NODE_MIN_SIZE", () => {
  it("is positive and strictly below every shape's default size", () => {
    expect(NODE_MIN_SIZE.width).toBeGreaterThan(0)
    expect(NODE_MIN_SIZE.height).toBeGreaterThan(0)
    for (const shape of CANVAS_SHAPES) {
      const size = SHAPE_DEFAULT_SIZES[shape]
      expect(NODE_MIN_SIZE.width).toBeLessThan(size.width)
      expect(NODE_MIN_SIZE.height).toBeLessThan(size.height)
    }
  })
})

describe("serializeShapeDragPayload / parseShapeDragPayload", () => {
  it("round-trips a valid payload for every shape", () => {
    for (const shape of CANVAS_SHAPES) {
      const raw = serializeShapeDragPayload(shape)
      const parsed = parseShapeDragPayload(raw)
      expect(parsed).toEqual({ shape, ...SHAPE_DEFAULT_SIZES[shape] })
    }
  })

  it("rejects an empty string", () => {
    expect(parseShapeDragPayload("")).toBeNull()
  })

  it("rejects malformed JSON", () => {
    expect(parseShapeDragPayload("{not json")).toBeNull()
  })

  it("rejects a JSON payload that isn't an object", () => {
    expect(parseShapeDragPayload("42")).toBeNull()
    expect(parseShapeDragPayload("null")).toBeNull()
  })

  it("rejects an unknown shape name", () => {
    expect(parseShapeDragPayload(JSON.stringify({ shape: "triangle", width: 10, height: 10 }))).toBeNull()
  })

  it("rejects non-numeric or non-positive width/height", () => {
    expect(
      parseShapeDragPayload(JSON.stringify({ shape: "rectangle", width: "160", height: 80 })),
    ).toBeNull()
    expect(parseShapeDragPayload(JSON.stringify({ shape: "rectangle", width: 0, height: 80 }))).toBeNull()
    expect(parseShapeDragPayload(JSON.stringify({ shape: "rectangle", width: -10, height: 80 }))).toBeNull()
  })

  it("uses a dedicated MIME type distinct from text/plain", () => {
    expect(CANVAS_DRAG_MIME_TYPE).not.toBe("text/plain")
  })
})

describe("generateNodeId", () => {
  it("embeds the shape name and produces unique IDs across repeated calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateNodeId("rectangle")))
    expect(ids.size).toBe(50)
    for (const id of ids) {
      expect(id.startsWith("rectangle-")).toBe(true)
    }
  })
})

describe("createDroppedNode", () => {
  it("builds a CanvasNode with an empty label, the default color/text-color pair, the dragged shape/size, and the given position", () => {
    const node = createDroppedNode({ shape: "circle", width: 80, height: 80 }, { x: 12, y: 34 })

    expect(node.type).toBe(CANVAS_NODE_TYPE)
    expect(node.position).toEqual({ x: 12, y: 34 })
    expect(node.width).toBe(80)
    expect(node.height).toBe(80)
    expect(node.data).toEqual({
      label: "",
      color: DEFAULT_NODE_COLOR,
      textColor: DEFAULT_NODE_TEXT_COLOR,
      shape: "circle",
    })
    expect(node.id.startsWith("circle-")).toBe(true)
  })

  it("gives each dropped node a distinct id", () => {
    const first = createDroppedNode({ shape: "hexagon", width: 140, height: 100 }, { x: 0, y: 0 })
    const second = createDroppedNode({ shape: "hexagon", width: 140, height: 100 }, { x: 0, y: 0 })
    expect(first.id).not.toBe(second.id)
  })
})
