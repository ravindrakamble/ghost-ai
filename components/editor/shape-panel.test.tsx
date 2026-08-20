// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ShapePanel } from "./shape-panel"
import { CANVAS_SHAPES, SHAPE_DEFAULT_SIZES, SHAPE_LABELS } from "@/lib/canvas-shapes"

// jsdom does not implement `document.elementFromPoint` at all (not even as a
// stub returning null), so it can't be `vi.spyOn`'d — it has to be assigned
// directly. Real browsers always implement it; this is a test-environment
// gap only.
function mockElementFromPoint(element: Element | null) {
  const mock = vi.fn().mockReturnValue(element)
  document.elementFromPoint = mock
  return mock
}

describe("ShapePanel", () => {
  it("renders one button per supported shape", () => {
    render(<ShapePanel onDropShape={vi.fn()} />)

    for (const shape of CANVAS_SHAPES) {
      expect(screen.getByTitle(SHAPE_LABELS[shape])).toBeInTheDocument()
    }
    expect(screen.getAllByRole("button")).toHaveLength(CANVAS_SHAPES.length)
  })

  it("calls onDropShape with the shape/size payload and drop position when released over the react-flow pane", () => {
    const pane = document.createElement("div")
    pane.className = "react-flow__pane"
    document.body.appendChild(pane)
    const elementFromPointSpy = mockElementFromPoint(pane)

    for (const shape of CANVAS_SHAPES) {
      const onDropShape = vi.fn()
      const { unmount } = render(<ShapePanel onDropShape={onDropShape} />)

      fireEvent.pointerDown(screen.getByTitle(SHAPE_LABELS[shape]), { clientX: 10, clientY: 20 })
      fireEvent.pointerUp(window, { clientX: 300, clientY: 400 })

      expect(onDropShape).toHaveBeenCalledTimes(1)
      expect(onDropShape).toHaveBeenCalledWith(
        { shape, ...SHAPE_DEFAULT_SIZES[shape] },
        { x: 300, y: 400 },
      )

      unmount()
    }

    elementFromPointSpy.mockRestore()
    pane.remove()
  })

  it("does not call onDropShape when released outside the react-flow pane", () => {
    const outsideElement = document.createElement("div")
    document.body.appendChild(outsideElement)
    const elementFromPointSpy = mockElementFromPoint(outsideElement)

    const onDropShape = vi.fn()
    render(<ShapePanel onDropShape={onDropShape} />)

    fireEvent.pointerDown(screen.getByTitle(SHAPE_LABELS.rectangle), { clientX: 10, clientY: 20 })
    fireEvent.pointerUp(window, { clientX: 300, clientY: 400 })

    expect(onDropShape).not.toHaveBeenCalled()

    elementFromPointSpy.mockRestore()
    outsideElement.remove()
  })

  it("does not call onDropShape when the drag is cancelled", () => {
    const onDropShape = vi.fn()
    render(<ShapePanel onDropShape={onDropShape} />)

    fireEvent.pointerDown(screen.getByTitle(SHAPE_LABELS.rectangle), { clientX: 10, clientY: 20 })
    fireEvent.pointerCancel(window)
    fireEvent.pointerUp(window, { clientX: 300, clientY: 400 })

    expect(onDropShape).not.toHaveBeenCalled()
  })

  it("shows a cursor-following ghost preview only while a drag is in progress", () => {
    const pane = document.createElement("div")
    pane.className = "react-flow__pane"
    document.body.appendChild(pane)
    const elementFromPointSpy = mockElementFromPoint(pane)

    render(<ShapePanel onDropShape={vi.fn()} />)

    expect(document.querySelector('div[aria-hidden="true"]')).toBeNull()

    fireEvent.pointerDown(screen.getByTitle(SHAPE_LABELS.circle), { clientX: 10, clientY: 20 })
    let ghost = document.querySelector('div[aria-hidden="true"]') as HTMLElement | null
    expect(ghost).not.toBeNull()
    expect(ghost?.style.width).toBe(`${SHAPE_DEFAULT_SIZES.circle.width}px`)
    expect(ghost?.style.left).toBe("10px")
    expect(ghost?.style.top).toBe("20px")

    fireEvent.pointerMove(window, { clientX: 55, clientY: 66 })
    ghost = document.querySelector('div[aria-hidden="true"]') as HTMLElement | null
    expect(ghost?.style.left).toBe("55px")
    expect(ghost?.style.top).toBe("66px")

    fireEvent.pointerUp(window, { clientX: 55, clientY: 66 })
    expect(document.querySelector('div[aria-hidden="true"]')).toBeNull()

    elementFromPointSpy.mockRestore()
    pane.remove()
  })
})
