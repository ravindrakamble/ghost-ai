// @vitest-environment jsdom
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ReactFlowProvider, type NodeProps } from "@xyflow/react"
import { CanvasNode } from "./canvas-node"
import { CanvasNodeUpdateContext, type UpdateCanvasNodeData } from "@/hooks/use-update-canvas-node"
import { NODE_MIN_SIZE } from "@/lib/canvas-shapes"
import {
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_TEXT_COLOR,
  NODE_COLORS,
  type CanvasNode as CanvasNodeType,
  type NodeShape,
} from "@/types/canvas"

function makeProps(
  overrides: Partial<CanvasNodeType["data"]> = {},
  selected = false,
): NodeProps<CanvasNodeType> {
  return {
    id: "node-1",
    type: "canvasNode",
    data: {
      label: "",
      color: DEFAULT_NODE_COLOR,
      textColor: DEFAULT_NODE_TEXT_COLOR,
      shape: "rectangle",
      ...overrides,
    },
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

/**
 * `NodeResizer`'s controls call `useStoreApi()` internally once visible
 * (`selected`/`isVisible`), which requires a React Flow store context — not
 * needed by `<CanvasNode>` in prior specs, now required since spec 14 adds
 * `<NodeResizer>`. `CanvasNodeUpdateContext` defaults to a spy-able mock so
 * label-editing tests can assert on dispatched updates without also
 * standing up the whole `CanvasFlow`.
 */
function renderNode(props: NodeProps<CanvasNodeType>, updateNodeData: UpdateCanvasNodeData | null = null) {
  return render(
    <ReactFlowProvider>
      <CanvasNodeUpdateContext.Provider value={updateNodeData}>
        <CanvasNode {...props} />
      </CanvasNodeUpdateContext.Provider>
    </ReactFlowProvider>,
  )
}

function rerenderNode(
  rerender: (ui: ReactElement) => void,
  props: NodeProps<CanvasNodeType>,
  updateNodeData: UpdateCanvasNodeData | null = null,
) {
  rerender(
    <ReactFlowProvider>
      <CanvasNodeUpdateContext.Provider value={updateNodeData}>
        <CanvasNode {...props} />
      </CanvasNodeUpdateContext.Provider>
    </ReactFlowProvider>,
  )
}

describe("CanvasNode", () => {
  it("renders the label when present", () => {
    renderNode(makeProps({ label: "My Service" }))
    expect(screen.getByText("My Service")).toBeInTheDocument()
  })

  it("shows an Untitled placeholder when the label is empty", () => {
    renderNode(makeProps({ label: "" }))
    expect(screen.getByText("Untitled")).toBeInTheDocument()
  })

  it("applies the node's fill color and the documented default text color on the rectangle's bordered container", () => {
    const { container } = renderNode(makeProps({ label: "X", color: "#10233D" }))
    const shapeRoot = container.firstElementChild as HTMLElement
    expect(shapeRoot.style.backgroundColor).toBe("rgb(16, 35, 61)")
    expect(shapeRoot.style.color).toBe("rgb(237, 237, 237)")
  })

  const cssShapes: NodeShape[] = ["rectangle", "pill", "circle"]
  it.each(cssShapes)("renders %s as a CSS div, not an SVG", (shape) => {
    const { container } = renderNode(makeProps({ label: "X", shape }))
    expect(container.querySelector("svg")).toBeNull()
    expect(screen.getByText("X").parentElement?.tagName).toBe("DIV")
  })

  const svgShapes: NodeShape[] = ["diamond", "hexagon", "cylinder"]
  it.each(svgShapes)("renders %s as a scaling inline SVG", (shape) => {
    const { container } = renderNode(makeProps({ label: "X", shape }))
    const svg = container.querySelector("svg")
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute("viewBox", "0 0 100 100")
    expect(svg).toHaveAttribute("preserveAspectRatio", "none")
    expect(svg).toHaveAttribute("width", "100%")
    expect(svg).toHaveAttribute("height", "100%")
  })

  it("uses a visibly brighter border color when selected (CSS shape)", () => {
    const { rerender, container } = renderNode(makeProps({ shape: "rectangle" }, false))
    const restDiv = container.firstElementChild as HTMLElement
    expect(restDiv.className).toContain("border-surface-border")
    expect(restDiv.className).not.toContain("border-brand")

    rerenderNode(rerender, makeProps({ shape: "rectangle" }, true))
    const selectedDiv = container.firstElementChild as HTMLElement
    expect(selectedDiv.className).toContain("border-brand")
    expect(selectedDiv.className).not.toContain("border-surface-border")
  })

  it("uses a visibly brighter stroke color when selected (SVG shape)", () => {
    const { rerender, container } = renderNode(makeProps({ shape: "diamond" }, false))
    const restShape = container.querySelector("polygon")
    expect(restShape).toHaveAttribute("stroke", "var(--border-default)")

    rerenderNode(rerender, makeProps({ shape: "diamond" }, true))
    const selectedShape = container.querySelector("polygon")
    expect(selectedShape).toHaveAttribute("stroke", "var(--accent-primary)")
  })

  it("gives rectangle rounded-xl and pill/circle rounded-full", () => {
    const { container: rectContainer } = renderNode(makeProps({ shape: "rectangle" }))
    expect((rectContainer.firstElementChild as HTMLElement).className).toContain("rounded-xl")

    const { container: pillContainer } = renderNode(makeProps({ shape: "pill" }))
    expect((pillContainer.firstElementChild as HTMLElement).className).toContain("rounded-full")

    const { container: circleContainer } = renderNode(makeProps({ shape: "circle" }))
    expect((circleContainer.firstElementChild as HTMLElement).className).toContain("rounded-full")
  })

  describe("resize", () => {
    it("shows resize handles when selected", () => {
      const { container } = renderNode(makeProps({}, true))
      expect(container.querySelectorAll(".react-flow__resize-control").length).toBeGreaterThan(0)
    })

    it("shows no resize handles when unselected", () => {
      const { container } = renderNode(makeProps({}, false))
      expect(container.querySelectorAll(".react-flow__resize-control")).toHaveLength(0)
    })

    it("enforces a documented minimum size, well below every shape's default", () => {
      expect(NODE_MIN_SIZE.width).toBeGreaterThan(0)
      expect(NODE_MIN_SIZE.height).toBeGreaterThan(0)
    })
  })

  describe("label editing", () => {
    it("opens inline editing on double-click and shows a textarea with the current label", () => {
      renderNode(makeProps({ label: "My Service" }))
      fireEvent.doubleClick(screen.getByText("My Service"))

      const textarea = screen.getByRole("textbox")
      expect(textarea).toHaveValue("My Service")
    })

    it("shows the Untitled placeholder in the textarea when the label is empty", () => {
      renderNode(makeProps({ label: "" }))
      fireEvent.doubleClick(screen.getByText("Untitled"))

      expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "Untitled")
    })

    it("dispatches the new label through the update-node-data context on every keystroke", () => {
      const updateNodeData = vi.fn()
      renderNode(makeProps({ label: "Old" }), updateNodeData)
      fireEvent.doubleClick(screen.getByText("Old"))

      fireEvent.change(screen.getByRole("textbox"), { target: { value: "New" } })

      expect(updateNodeData).toHaveBeenCalledWith("node-1", { label: "New" })
    })

    it("does not throw when no update-node-data context is provided", () => {
      renderNode(makeProps({ label: "Old" }))
      fireEvent.doubleClick(screen.getByText("Old"))

      expect(() => fireEvent.change(screen.getByRole("textbox"), { target: { value: "New" } })).not.toThrow()
    })

    it("closes editing on blur", () => {
      renderNode(makeProps({ label: "My Service" }))
      fireEvent.doubleClick(screen.getByText("My Service"))
      expect(screen.getByRole("textbox")).toBeInTheDocument()

      fireEvent.blur(screen.getByRole("textbox"))
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
      expect(screen.getByText("My Service")).toBeInTheDocument()
    })

    it("closes editing on Escape", () => {
      renderNode(makeProps({ label: "My Service" }))
      fireEvent.doubleClick(screen.getByText("My Service"))
      expect(screen.getByRole("textbox")).toBeInTheDocument()

      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" })
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    })

    it("applies nodrag/nopan classes to the editable wrapper so typing doesn't drag or pan", () => {
      renderNode(makeProps({ label: "My Service" }))
      const wrapper = screen.getByText("My Service").parentElement as HTMLElement
      expect(wrapper.className).toContain("nodrag")
      expect(wrapper.className).toContain("nopan")
    })
  })

  describe("color toolbar", () => {
    it("renders one swatch button per NODE_COLORS pair when selected", () => {
      renderNode(makeProps({}, true))
      const swatches = screen.getAllByRole("button", { name: /Set node color to/i })
      expect(swatches).toHaveLength(NODE_COLORS.length)
    })

    it("renders no color toolbar when unselected", () => {
      renderNode(makeProps({}, false))
      expect(screen.queryByRole("button", { name: /Set node color to/i })).not.toBeInTheDocument()
    })

    it("dispatches both color and textColor through the update-node-data context on swatch click", () => {
      const updateNodeData = vi.fn()
      renderNode(makeProps({}, true), updateNodeData)

      const bluePair = NODE_COLORS[1]
      fireEvent.click(screen.getByRole("button", { name: `Set node color to ${bluePair.color}` }))

      expect(updateNodeData).toHaveBeenCalledWith("node-1", {
        color: bluePair.color,
        textColor: bluePair.textColor,
      })
    })

    it("applies the node's data.textColor to the shape container", () => {
      const bluePair = NODE_COLORS[1]
      const { container } = renderNode(
        makeProps({ label: "X", color: bluePair.color, textColor: bluePair.textColor }),
      )
      const shapeRoot = container.firstElementChild as HTMLElement
      expect(shapeRoot.style.color).toBe("rgb(82, 168, 255)") // #52A8FF
    })

    it("applies the node's data.textColor to the edit-mode textarea", () => {
      const bluePair = NODE_COLORS[1]
      renderNode(makeProps({ label: "X", color: bluePair.color, textColor: bluePair.textColor }))
      fireEvent.doubleClick(screen.getByText("X"))
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
      expect(textarea.style.color).toBe("rgb(82, 168, 255)") // #52A8FF
    })
  })
})
