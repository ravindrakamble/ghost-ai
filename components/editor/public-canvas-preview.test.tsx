// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { PublicCanvasPreview } from "./public-canvas-preview"
import { CANVAS_NODE_TYPE, CANVAS_EDGE_TYPE, DEFAULT_NODE_COLOR, DEFAULT_NODE_TEXT_COLOR } from "@/types/canvas"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"

function makeNodes(): CanvasNode[] {
  return [
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
  ]
}

function makeEdges(): CanvasEdge[] {
  return [{ id: "a-b", type: CANVAS_EDGE_TYPE, source: "a", target: "b", data: {} }]
}

describe("PublicCanvasPreview", () => {
  it("shows an explicit empty state rather than a blank/broken SVG when there is no saved canvas", () => {
    render(<PublicCanvasPreview nodes={[]} edges={[]} />)

    expect(screen.getByText(/no diagram has been saved for this project yet/i)).toBeInTheDocument()
    expect(document.querySelector("svg")).not.toBeInTheDocument()
  })

  it("renders a plain <svg>, not a React Flow instance", () => {
    const { container } = render(<PublicCanvasPreview nodes={makeNodes()} edges={makeEdges()} />)

    expect(container.querySelector("svg")).toBeInTheDocument()
    expect(container.querySelector(".react-flow")).not.toBeInTheDocument()
  })

  it("renders one shape element per node and one line per edge", () => {
    const { container } = render(<PublicCanvasPreview nodes={makeNodes()} edges={makeEdges()} />)

    expect(container.querySelectorAll('[data-testid="public-preview-node"]')).toHaveLength(2)
    expect(container.querySelectorAll("line")).toHaveLength(1)
  })

  it("connects an edge's line between its source and target node centers", () => {
    const { container } = render(<PublicCanvasPreview nodes={makeNodes()} edges={makeEdges()} />)

    const line = container.querySelector("line")
    expect(line).toHaveAttribute("x1", "50")
    expect(line).toHaveAttribute("y1", "25")
    expect(line).toHaveAttribute("x2", "340")
    expect(line).toHaveAttribute("y2", "240")
  })

  it("computes its viewBox bounds from the node positions, not a hardcoded value", () => {
    const { container: smallContainer } = render(<PublicCanvasPreview nodes={makeNodes()} edges={makeEdges()} />)
    const smallViewBox = smallContainer.querySelector("svg")?.getAttribute("viewBox")

    const widerNodes: CanvasNode[] = [
      ...makeNodes(),
      {
        id: "c",
        type: CANVAS_NODE_TYPE,
        position: { x: 1000, y: 1000 },
        width: 60,
        height: 60,
        data: { label: "C", color: DEFAULT_NODE_COLOR, textColor: DEFAULT_NODE_TEXT_COLOR, shape: "pill" },
      },
    ]
    const { container: wideContainer } = render(<PublicCanvasPreview nodes={widerNodes} edges={makeEdges()} />)
    const wideViewBox = wideContainer.querySelector("svg")?.getAttribute("viewBox")

    expect(smallViewBox).not.toEqual(wideViewBox)
  })

  it("draws a diamond/hexagon/cylinder node inside a per-node transformed <g>", () => {
    const diamondNode: CanvasNode = {
      id: "diamond-node",
      type: CANVAS_NODE_TYPE,
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      data: { label: "D", color: DEFAULT_NODE_COLOR, textColor: DEFAULT_NODE_TEXT_COLOR, shape: "diamond" },
    }
    const { container } = render(<PublicCanvasPreview nodes={[diamondNode]} edges={[]} />)

    const polygon = container.querySelector("polygon")
    expect(polygon).toBeInTheDocument()
    expect(polygon?.getAttribute("points")).toBe("50,2 98,50 50,98 2,50")
  })

  it("skips an edge whose source or target node is missing rather than crashing", () => {
    const nodes = makeNodes()
    const danglingEdge: CanvasEdge = { id: "dangling", type: CANVAS_EDGE_TYPE, source: "a", target: "missing", data: {} }

    const { container } = render(<PublicCanvasPreview nodes={nodes} edges={[danglingEdge]} />)

    expect(container.querySelectorAll("line")).toHaveLength(0)
  })
})
