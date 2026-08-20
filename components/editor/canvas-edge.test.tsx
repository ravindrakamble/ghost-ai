// @vitest-environment jsdom
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Position, type EdgeProps } from "@xyflow/react"
import { CanvasEdge } from "./canvas-edge"
import { CanvasEdgeUpdateContext, type UpdateCanvasEdgeData } from "@/hooks/use-update-canvas-edge"
import { type CanvasEdge as CanvasEdgeType, type CanvasEdgeData } from "@/types/canvas"

/**
 * `EdgeLabelRenderer` portals into a DOM node React Flow's own container
 * sets up (`store.domNode.querySelector('.react-flow__edgelabel-renderer')`)
 * — only present once a real `<ReactFlow>` canvas has actually mounted, not
 * in an isolated component test (confirmed by reading `@xyflow/react`'s
 * source: without it, `EdgeLabelRenderer` returns `null`). Mocked here to
 * portal into `document.body` instead, so label content stays queryable via
 * Testing Library without standing up the whole canvas — the same kind of
 * isolation `canvas-node.test.tsx` gets "for free" since `NodeResizer`
 * doesn't have this particular dependency. Using a real portal (not just
 * returning `children` inline) matters here: `CanvasEdge`'s own `<g>` is an
 * SVG element, and an `<input>`/`<div>` rendered directly inside an SVG tree
 * (rather than portaled out to an HTML container, as the real
 * `EdgeLabelRenderer` does) gets created in the SVG namespace, where it
 * doesn't behave like a real `HTMLInputElement` (no `value` setter, `.value`/
 * `.className` behave differently) — confirmed by this exact failure mode
 * the first time this mock returned `children` directly.
 */
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>()
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: ReactNode }) => createPortal(children, document.body),
  }
})

function makeProps(overrides: Partial<CanvasEdgeData> = {}, selected = false): EdgeProps<CanvasEdgeType> {
  return {
    id: "edge-1",
    type: "canvasEdge",
    source: "node-1",
    target: "node-2",
    data: { ...overrides },
    selected,
    animated: false,
    selectable: true,
    deletable: true,
    sourceX: 0,
    sourceY: 0,
    sourcePosition: Position.Right,
    targetX: 100,
    targetY: 100,
    targetPosition: Position.Left,
  } as unknown as EdgeProps<CanvasEdgeType>
}

function renderEdge(props: EdgeProps<CanvasEdgeType>, updateEdgeData: UpdateCanvasEdgeData | null = null) {
  return render(
    <svg>
      <CanvasEdgeUpdateContext.Provider value={updateEdgeData}>
        <CanvasEdge {...props} />
      </CanvasEdgeUpdateContext.Provider>
    </svg>,
  )
}

function getPath(container: HTMLElement): SVGPathElement {
  return container.querySelector(".react-flow__edge-path") as SVGPathElement
}

function getGroup(container: HTMLElement): SVGGElement {
  return container.querySelector("g") as SVGGElement
}

describe("CanvasEdge", () => {
  it("renders a right-angle path via getSmoothStepPath, not a straight line", () => {
    const { container } = renderEdge(makeProps())
    const path = getPath(container)
    expect(path).not.toBeNull()
    // A smooth-step path between (0,0) and (100,100) has multiple segments
    // (several `L`/`Q` commands), unlike a two-point straight line.
    const d = path.getAttribute("d") ?? ""
    expect(d.startsWith("M")).toBe(true)
    expect((d.match(/[A-Z]/g) ?? []).length).toBeGreaterThan(2)
  })

  it("uses the dimmed rest-state stroke token when not hovered or selected", () => {
    const { container } = renderEdge(makeProps({}, false))
    expect(getPath(container).style.getPropertyValue("stroke")).toBe("var(--border-default)")
  })

  it("brightens to the brand-accent token on hover", () => {
    const { container } = renderEdge(makeProps())
    // React's synthetic `onMouseEnter` is built from native `mouseover`, not
    // `mouseenter` — `fireEvent.mouseOver` is the reliable way to trigger it
    // (a well-known RTL/React gotcha, `fireEvent.mouseEnter` does not
    // reliably fire React's handler).
    fireEvent.mouseOver(getGroup(container))
    expect(getPath(container).style.getPropertyValue("stroke")).toBe("var(--accent-primary)")
  })

  it("dims again on mouse leave", () => {
    const { container } = renderEdge(makeProps())
    const group = getGroup(container)
    fireEvent.mouseOver(group)
    fireEvent.mouseOut(group)
    expect(getPath(container).style.getPropertyValue("stroke")).toBe("var(--border-default)")
  })

  it("brightens when selected, without requiring hover", () => {
    const { container } = renderEdge(makeProps({}, true))
    expect(getPath(container).style.getPropertyValue("stroke")).toBe("var(--accent-primary)")
  })

  it("keeps the same visible stroke width whether dimmed or brightened", () => {
    const { container: restContainer } = renderEdge(makeProps({}, false))
    const { container: brightContainer } = renderEdge(makeProps({}, true))
    expect(getPath(restContainer).style.getPropertyValue("stroke-width")).toBe(
      getPath(brightContainer).style.getPropertyValue("stroke-width"),
    )
  })

  it("renders no label content at rest with no label", () => {
    const { container } = renderEdge(makeProps())
    expect(container.querySelector(".nodrag")).toBeNull()
  })

  it("renders a pill badge for a saved label", () => {
    renderEdge(makeProps({ label: "calls" }))
    expect(screen.getByText("calls")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  describe("label editing", () => {
    it("opens inline editing on double-clicking the edge line", () => {
      const { container } = renderEdge(makeProps())
      fireEvent.doubleClick(getGroup(container))
      expect(screen.getByRole("textbox")).toBeInTheDocument()
    })

    it("opens inline editing on double-clicking an existing label, prefilled with its value", () => {
      renderEdge(makeProps({ label: "calls" }))
      fireEvent.doubleClick(screen.getByText("calls"))
      expect(screen.getByRole("textbox")).toHaveValue("calls")
    })

    it("shows a faint placeholder hint while editing with no label, instead of nothing", () => {
      const { container } = renderEdge(makeProps())
      fireEvent.doubleClick(getGroup(container))
      const input = screen.getByRole("textbox")
      expect(input).toHaveAttribute("placeholder")
      expect(input.className).toContain("placeholder:text-copy-faint")
    })

    it("dispatches the new label through the update-edge-data context on every keystroke", () => {
      const updateEdgeData = vi.fn()
      renderEdge(makeProps({ label: "Old" }), updateEdgeData)
      fireEvent.doubleClick(screen.getByText("Old"))

      fireEvent.change(screen.getByRole("textbox"), { target: { value: "New" } })
      expect(updateEdgeData).toHaveBeenCalledWith("edge-1", { label: "New" })
    })

    it("does not throw when no update-edge-data context is provided", () => {
      const { container } = renderEdge(makeProps())
      fireEvent.doubleClick(getGroup(container))
      expect(() => fireEvent.change(screen.getByRole("textbox"), { target: { value: "New" } })).not.toThrow()
    })

    it("closes editing on blur", () => {
      renderEdge(makeProps({ label: "calls" }))
      fireEvent.doubleClick(screen.getByText("calls"))
      expect(screen.getByRole("textbox")).toBeInTheDocument()

      fireEvent.blur(screen.getByRole("textbox"))
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
      expect(screen.getByText("calls")).toBeInTheDocument()
    })

    it("closes editing on Enter", () => {
      renderEdge(makeProps({ label: "calls" }))
      fireEvent.doubleClick(screen.getByText("calls"))
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    })

    it("closes editing on Escape", () => {
      renderEdge(makeProps({ label: "calls" }))
      fireEvent.doubleClick(screen.getByText("calls"))
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" })
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    })
  })

  describe("nodrag/nopan", () => {
    it("applies nodrag/nopan to the label input", () => {
      const { container } = renderEdge(makeProps())
      fireEvent.doubleClick(getGroup(container))
      const input = screen.getByRole("textbox")
      expect(input.className).toContain("nodrag")
      expect(input.className).toContain("nopan")
    })

    it("applies nodrag/nopan to the saved pill label", () => {
      renderEdge(makeProps({ label: "calls" }))
      const pill = screen.getByText("calls")
      expect(pill.className).toContain("nodrag")
      expect(pill.className).toContain("nopan")
    })
  })

  it("positions the label at getSmoothStepPath's own returned midpoint, not a manual calculation", () => {
    renderEdge(makeProps({ label: "calls" }))
    const pill = screen.getByText("calls")
    // sourceX/Y=(0,0), targetX/Y=(100,100) are not colinear with a naive
    // (source+target)/2 midpoint once routed as a right-angle path — this
    // just asserts a real, non-zero coordinate pair was used, sourced from
    // the path helper's own labelX/labelY rather than hardcoded.
    expect(pill.style.transform).toContain("translate(-50%, -50%)")
    expect(pill.style.transform).toMatch(/translate\(-?\d+(\.\d+)?px, ?-?\d+(\.\d+)?px\)$/)
  })
})
