// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { StarterTemplatePreview } from "./starter-template-preview"
import type { CanvasTemplate } from "./starter-templates"
import { CANVAS_NODE_TYPE, CANVAS_EDGE_TYPE, DEFAULT_NODE_COLOR, DEFAULT_NODE_TEXT_COLOR } from "@/types/canvas"

function makeTemplate(overrides: Partial<CanvasTemplate> = {}): CanvasTemplate {
  return {
    id: "test-template",
    name: "Test Template",
    description: "A template used only for this test.",
    nodes: [
      {
        id: "a",
        type: CANVAS_NODE_TYPE,
        position: { x: 0, y: 0 },
        width: 100,
        height: 50,
        data: { label: "A", color: DEFAULT_NODE_COLOR, textColor: DEFAULT_NODE_TEXT_COLOR, shape: "rectangle" },
      },
      {
        id: "b",
        type: CANVAS_NODE_TYPE,
        position: { x: 300, y: 200 },
        width: 80,
        height: 80,
        data: { label: "B", color: DEFAULT_NODE_COLOR, textColor: DEFAULT_NODE_TEXT_COLOR, shape: "circle" },
      },
    ],
    edges: [{ id: "a-b", type: CANVAS_EDGE_TYPE, source: "a", target: "b", data: {} }],
    ...overrides,
  }
}

describe("StarterTemplatePreview", () => {
  it("renders no @xyflow/react-dependent DOM (a plain <svg>, not a React Flow instance)", () => {
    const { container } = render(<StarterTemplatePreview template={makeTemplate()} />)

    expect(container.querySelector("svg")).toBeInTheDocument()
    expect(container.querySelector(".react-flow")).not.toBeInTheDocument()
  })

  it("renders one shape element per node", () => {
    const { container } = render(<StarterTemplatePreview template={makeTemplate()} />)

    expect(container.querySelectorAll('[data-testid="template-preview-node"]')).toHaveLength(2)
  })

  it("renders one line per edge", () => {
    const { container } = render(<StarterTemplatePreview template={makeTemplate()} />)

    const lines = container.querySelectorAll("line")
    expect(lines).toHaveLength(1)
  })

  it("connects an edge's line between its source and target node centers", () => {
    const { container } = render(<StarterTemplatePreview template={makeTemplate()} />)

    const line = container.querySelector("line")
    // Node "a": position (0,0), size 100x50 -> center (50, 25).
    // Node "b": position (300,200), size 80x80 -> center (340, 240).
    expect(line).toHaveAttribute("x1", "50")
    expect(line).toHaveAttribute("y1", "25")
    expect(line).toHaveAttribute("x2", "340")
    expect(line).toHaveAttribute("y2", "240")
  })

  it("computes its viewBox bounds from the template's own node positions, not a hardcoded value", () => {
    const { container: smallContainer } = render(<StarterTemplatePreview template={makeTemplate()} />)
    const smallViewBox = smallContainer.querySelector("svg")?.getAttribute("viewBox")

    const widerTemplate = makeTemplate({
      nodes: [
        ...makeTemplate().nodes,
        {
          id: "c",
          type: CANVAS_NODE_TYPE,
          position: { x: 1000, y: 1000 },
          width: 60,
          height: 60,
          data: { label: "C", color: DEFAULT_NODE_COLOR, textColor: DEFAULT_NODE_TEXT_COLOR, shape: "pill" },
        },
      ],
    })
    const { container: wideContainer } = render(<StarterTemplatePreview template={widerTemplate} />)
    const wideViewBox = wideContainer.querySelector("svg")?.getAttribute("viewBox")

    expect(smallViewBox).not.toEqual(wideViewBox)
  })

  it("pads the viewBox around the node bounds so an edge node isn't clipped", () => {
    const { container } = render(<StarterTemplatePreview template={makeTemplate()} />)
    const viewBox = container.querySelector("svg")?.getAttribute("viewBox") ?? ""
    const [minX, minY] = viewBox.split(" ").map(Number)

    // Node "a" starts at (0, 0); the viewBox origin must sit before that.
    expect(minX).toBeLessThan(0)
    expect(minY).toBeLessThan(0)
  })

  it("draws a diamond/hexagon/cylinder node inside a per-node transformed <g>", () => {
    const template = makeTemplate({
      nodes: [
        {
          id: "diamond-node",
          type: CANVAS_NODE_TYPE,
          position: { x: 0, y: 0 },
          width: 100,
          height: 100,
          data: { label: "D", color: DEFAULT_NODE_COLOR, textColor: DEFAULT_NODE_TEXT_COLOR, shape: "diamond" },
        },
      ],
      edges: [],
    })
    const { container } = render(<StarterTemplatePreview template={template} />)

    const polygon = container.querySelector("polygon")
    expect(polygon).toBeInTheDocument()
    expect(polygon?.getAttribute("points")).toBe("50,2 98,50 50,98 2,50")
  })
})
