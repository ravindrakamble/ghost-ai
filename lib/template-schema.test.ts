import { describe, it, expect } from "vitest"
import { CreateCustomTemplateSchema, CustomTemplateEdgeSchema, CustomTemplateNodeSchema } from "./template-schema"

const validNode = {
  id: "n1",
  type: "canvasNode",
  position: { x: 10, y: 20 },
  width: 160,
  height: 80,
  data: { label: "Service", color: "#1F1F1F", textColor: "#EDEDED", shape: "rectangle" },
}

const validEdge = {
  id: "e1",
  type: "canvasEdge",
  source: "n1",
  target: "n1",
  data: { label: "calls" },
}

describe("CustomTemplateNodeSchema", () => {
  it("accepts a full-fidelity node (color/textColor/width/height preserved)", () => {
    const result = CustomTemplateNodeSchema.safeParse(validNode)

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      width: 160,
      height: 80,
      data: { color: "#1F1F1F", textColor: "#EDEDED" },
    })
  })

  it("accepts a node with no width/height (optional)", () => {
    const { width: _width, height: _height, ...withoutSize } = validNode
    void _width
    void _height

    expect(CustomTemplateNodeSchema.safeParse(withoutSize).success).toBe(true)
  })

  it("rejects a node missing color/textColor/shape (the exact fields spec 27's narrower schema drops)", () => {
    const { data, ...rest } = validNode
    const { color: _color, textColor: _textColor, ...narrowedData } = data
    void _color
    void _textColor

    const result = CustomTemplateNodeSchema.safeParse({ ...rest, data: narrowedData })

    expect(result.success).toBe(false)
  })

  it("rejects an invalid shape value", () => {
    const result = CustomTemplateNodeSchema.safeParse({
      ...validNode,
      data: { ...validNode.data, shape: "not-a-real-shape" },
    })

    expect(result.success).toBe(false)
  })

  it("strips unrecognized runtime-only fields (e.g. selected, measured) rather than failing", () => {
    const result = CustomTemplateNodeSchema.safeParse({
      ...validNode,
      selected: true,
      measured: { width: 160, height: 80 },
    })

    expect(result.success).toBe(true)
    expect(result.data).not.toHaveProperty("selected")
    expect(result.data).not.toHaveProperty("measured")
  })
})

describe("CustomTemplateEdgeSchema", () => {
  it("accepts a full edge with a label", () => {
    expect(CustomTemplateEdgeSchema.safeParse(validEdge).success).toBe(true)
  })

  it("accepts an edge with no data (optional)", () => {
    const { data: _data, ...withoutData } = validEdge
    void _data

    expect(CustomTemplateEdgeSchema.safeParse(withoutData).success).toBe(true)
  })

  it("rejects an edge missing source/target", () => {
    const { source: _source, ...withoutSource } = validEdge
    void _source

    expect(CustomTemplateEdgeSchema.safeParse(withoutSource).success).toBe(false)
  })
})

describe("CreateCustomTemplateSchema", () => {
  it("accepts a full valid payload", () => {
    const result = CreateCustomTemplateSchema.safeParse({
      name: "My template",
      description: "A description",
      nodes: [validNode],
      edges: [validEdge],
    })

    expect(result.success).toBe(true)
  })

  it("trims name/description", () => {
    const result = CreateCustomTemplateSchema.safeParse({
      name: "  My template  ",
      description: "  A description  ",
      nodes: [],
      edges: [],
    })

    expect(result.success).toBe(true)
    expect(result.data?.name).toBe("My template")
    expect(result.data?.description).toBe("A description")
  })

  it("rejects an empty/whitespace-only name", () => {
    expect(
      CreateCustomTemplateSchema.safeParse({ name: "   ", nodes: [], edges: [] }).success,
    ).toBe(false)
  })

  it("accepts a payload with no description", () => {
    const result = CreateCustomTemplateSchema.safeParse({ name: "My template", nodes: [], edges: [] })

    expect(result.success).toBe(true)
    expect(result.data?.description).toBeUndefined()
  })
})
