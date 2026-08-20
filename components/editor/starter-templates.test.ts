import { describe, expect, it } from "vitest"
import { CANVAS_TEMPLATES } from "./starter-templates"
import { CANVAS_SHAPES } from "@/lib/canvas-shapes"
import { CANVAS_EDGE_TYPE, CANVAS_NODE_TYPE, NODE_COLORS } from "@/types/canvas"

describe("CANVAS_TEMPLATES", () => {
  it("contains at least 3 templates", () => {
    expect(CANVAS_TEMPLATES.length).toBeGreaterThanOrEqual(3)
  })

  it("gives every template a unique id, name, and description", () => {
    const ids = new Set(CANVAS_TEMPLATES.map((template) => template.id))
    expect(ids.size).toBe(CANVAS_TEMPLATES.length)

    for (const template of CANVAS_TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(0)
      expect(template.description.length).toBeGreaterThan(0)
    }
  })

  it("includes the microservices, CI/CD pipeline, and event-driven system templates", () => {
    const ids = CANVAS_TEMPLATES.map((template) => template.id)
    expect(ids).toContain("microservices")
    expect(ids).toContain("cicd-pipeline")
    expect(ids).toContain("event-driven-system")
  })

  it("gives every template at least one node and one edge", () => {
    for (const template of CANVAS_TEMPLATES) {
      expect(template.nodes.length).toBeGreaterThan(0)
      expect(template.edges.length).toBeGreaterThan(0)
    }
  })

  it("uses only real NodeShape values for every node", () => {
    for (const template of CANVAS_TEMPLATES) {
      for (const node of template.nodes) {
        expect(CANVAS_SHAPES).toContain(node.data.shape)
      }
    }
  })

  it("uses only real NODE_COLORS color/textColor pairs for every node", () => {
    for (const template of CANVAS_TEMPLATES) {
      for (const node of template.nodes) {
        const match = NODE_COLORS.some(
          (pair) => pair.color === node.data.color && pair.textColor === node.data.textColor,
        )
        expect(match).toBe(true)
      }
    }
  })

  it("gives every node the canvasNode type and every edge the canvasEdge type", () => {
    for (const template of CANVAS_TEMPLATES) {
      for (const node of template.nodes) {
        expect(node.type).toBe(CANVAS_NODE_TYPE)
      }
      for (const edge of template.edges) {
        expect(edge.type).toBe(CANVAS_EDGE_TYPE)
      }
    }
  })

  it("gives every node and edge a unique, static (non-generated) id within its own template", () => {
    for (const template of CANVAS_TEMPLATES) {
      const nodeIds = template.nodes.map((node) => node.id)
      expect(new Set(nodeIds).size).toBe(nodeIds.length)
      for (const id of nodeIds) {
        expect(id).not.toMatch(/^\w+-\d{10,}-\d+-\w{6}$/) // generateNodeId()'s shape
      }

      const edgeIds = template.edges.map((edge) => edge.id)
      expect(new Set(edgeIds).size).toBe(edgeIds.length)
    }
  })

  it("only references real node ids from its own template's source/target", () => {
    for (const template of CANVAS_TEMPLATES) {
      const nodeIds = new Set(template.nodes.map((node) => node.id))
      for (const edge of template.edges) {
        expect(nodeIds.has(edge.source)).toBe(true)
        expect(nodeIds.has(edge.target)).toBe(true)
      }
    }
  })

  it("gives every node a real width/height from SHAPE_DEFAULT_SIZES", () => {
    for (const template of CANVAS_TEMPLATES) {
      for (const node of template.nodes) {
        expect(node.width).toBeGreaterThan(0)
        expect(node.height).toBeGreaterThan(0)
      }
    }
  })
})
