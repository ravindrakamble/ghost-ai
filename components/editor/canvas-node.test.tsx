// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { CanvasNode } from "./canvas-node"
import { DEFAULT_NODE_COLOR, type CanvasNode as CanvasNodeType, type NodeShape } from "@/types/canvas"
import type { NodeProps } from "@xyflow/react"

function makeProps(
  overrides: Partial<CanvasNodeType["data"]> = {},
  selected = false,
): NodeProps<CanvasNodeType> {
  return {
    id: "node-1",
    type: "canvasNode",
    data: { label: "", color: DEFAULT_NODE_COLOR, shape: "rectangle", ...overrides },
    selected,
    dragging: false,
    zIndex: 0,
    selectable: true,
    deletable: true,
    draggable: true,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as unknown as NodeProps<CanvasNodeType>
}

describe("CanvasNode", () => {
  it("renders the label when present", () => {
    render(<CanvasNode {...makeProps({ label: "My Service" })} />)
    expect(screen.getByText("My Service")).toBeInTheDocument()
  })

  it("shows an Untitled placeholder when the label is empty", () => {
    render(<CanvasNode {...makeProps({ label: "" })} />)
    expect(screen.getByText("Untitled")).toBeInTheDocument()
  })

  it("applies the node's fill color and the documented default text color on the rectangle's bordered container", () => {
    render(<CanvasNode {...makeProps({ label: "X", color: "#10233D" })} />)
    const container = screen.getByText("X").parentElement
    expect(container?.style.backgroundColor).toBe("rgb(16, 35, 61)")
    expect(container?.style.color).toBe("rgb(237, 237, 237)")
  })

  const cssShapes: NodeShape[] = ["rectangle", "pill", "circle"]
  it.each(cssShapes)("renders %s as a CSS div, not an SVG", (shape) => {
    const { container } = render(<CanvasNode {...makeProps({ label: "X", shape })} />)
    expect(container.querySelector("svg")).toBeNull()
    expect(screen.getByText("X").parentElement?.tagName).toBe("DIV")
  })

  const svgShapes: NodeShape[] = ["diamond", "hexagon", "cylinder"]
  it.each(svgShapes)("renders %s as a scaling inline SVG", (shape) => {
    const { container } = render(<CanvasNode {...makeProps({ label: "X", shape })} />)
    const svg = container.querySelector("svg")
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute("viewBox", "0 0 100 100")
    expect(svg).toHaveAttribute("preserveAspectRatio", "none")
    expect(svg).toHaveAttribute("width", "100%")
    expect(svg).toHaveAttribute("height", "100%")
  })

  it("uses a visibly brighter border color when selected (CSS shape)", () => {
    const { rerender, container } = render(<CanvasNode {...makeProps({ shape: "rectangle" }, false)} />)
    const restDiv = container.firstElementChild as HTMLElement
    expect(restDiv.className).toContain("border-surface-border")
    expect(restDiv.className).not.toContain("border-brand")

    rerender(<CanvasNode {...makeProps({ shape: "rectangle" }, true)} />)
    const selectedDiv = container.firstElementChild as HTMLElement
    expect(selectedDiv.className).toContain("border-brand")
    expect(selectedDiv.className).not.toContain("border-surface-border")
  })

  it("uses a visibly brighter stroke color when selected (SVG shape)", () => {
    const { rerender, container } = render(<CanvasNode {...makeProps({ shape: "diamond" }, false)} />)
    const restShape = container.querySelector("polygon")
    expect(restShape).toHaveAttribute("stroke", "var(--border-default)")

    rerender(<CanvasNode {...makeProps({ shape: "diamond" }, true)} />)
    const selectedShape = container.querySelector("polygon")
    expect(selectedShape).toHaveAttribute("stroke", "var(--accent-primary)")
  })

  it("gives rectangle rounded-xl and pill/circle rounded-full", () => {
    const { container: rectContainer } = render(<CanvasNode {...makeProps({ shape: "rectangle" })} />)
    expect((rectContainer.firstElementChild as HTMLElement).className).toContain("rounded-xl")

    const { container: pillContainer } = render(<CanvasNode {...makeProps({ shape: "pill" })} />)
    expect((pillContainer.firstElementChild as HTMLElement).className).toContain("rounded-full")

    const { container: circleContainer } = render(<CanvasNode {...makeProps({ shape: "circle" })} />)
    expect((circleContainer.firstElementChild as HTMLElement).className).toContain("rounded-full")
  })
})
