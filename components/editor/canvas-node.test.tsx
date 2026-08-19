// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { CanvasNode } from "./canvas-node"
import { DEFAULT_NODE_COLOR, type CanvasNode as CanvasNodeType } from "@/types/canvas"
import type { NodeProps } from "@xyflow/react"

// This unit renders every shape identically (a bordered rectangle with a
// centered label) — shape-specific SVGs are a later spec. So these tests
// only cover label/color rendering, not shape variance.
function makeProps(overrides: Partial<CanvasNodeType["data"]> = {}): NodeProps<CanvasNodeType> {
  return {
    id: "node-1",
    type: "canvasNode",
    data: { label: "", color: DEFAULT_NODE_COLOR, shape: "rectangle", ...overrides },
    selected: false,
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

  it("applies the node's fill color and the documented default text color on the bordered container", () => {
    render(<CanvasNode {...makeProps({ label: "X", color: "#10233D" })} />)
    const container = screen.getByText("X").parentElement
    expect(container?.style.backgroundColor).toBe("rgb(16, 35, 61)")
    expect(container?.style.color).toBe("rgb(237, 237, 237)")
  })
})
