// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ShapePanel } from "./shape-panel"
import { CANVAS_DRAG_MIME_TYPE, CANVAS_SHAPES, SHAPE_DEFAULT_SIZES, SHAPE_LABELS } from "@/lib/canvas-shapes"

describe("ShapePanel", () => {
  it("renders one draggable button per supported shape", () => {
    render(<ShapePanel />)

    for (const shape of CANVAS_SHAPES) {
      const button = screen.getByTitle(SHAPE_LABELS[shape])
      expect(button).toHaveAttribute("draggable", "true")
    }
    expect(screen.getAllByRole("button")).toHaveLength(CANVAS_SHAPES.length)
  })

  it("sets the shape/size dataTransfer payload on dragstart, matching each shape's default size", () => {
    render(<ShapePanel />)

    for (const shape of CANVAS_SHAPES) {
      const setData = vi.fn()
      const setDragImage = vi.fn()
      const dataTransfer = { setData, setDragImage, effectAllowed: "" }
      fireEvent.dragStart(screen.getByTitle(SHAPE_LABELS[shape]), { dataTransfer })

      expect(setData).toHaveBeenCalledTimes(1)
      const [mimeType, raw] = setData.mock.calls[0] as [string, string]
      expect(mimeType).toBe(CANVAS_DRAG_MIME_TYPE)
      expect(JSON.parse(raw)).toEqual({ shape, ...SHAPE_DEFAULT_SIZES[shape] })
      expect(dataTransfer.effectAllowed).toBe("copy")
    }
  })

  it("passes a shape-correct, already-rendered preview element to setDragImage, offset by half its default size", () => {
    render(<ShapePanel />)

    for (const shape of CANVAS_SHAPES) {
      const setDragImage = vi.fn()
      const dataTransfer = { setData: vi.fn(), setDragImage, effectAllowed: "" }
      fireEvent.dragStart(screen.getByTitle(SHAPE_LABELS[shape]), { dataTransfer })

      expect(setDragImage).toHaveBeenCalledTimes(1)
      const [element, xOffset, yOffset] = setDragImage.mock.calls[0] as [HTMLElement, number, number]
      const size = SHAPE_DEFAULT_SIZES[shape]
      expect(element).toBeInstanceOf(HTMLElement)
      expect(element.style.width).toBe(`${size.width}px`)
      expect(element.style.height).toBe(`${size.height}px`)
      expect(xOffset).toBe(size.width / 2)
      expect(yOffset).toBe(size.height / 2)
    }
  })

  it("renders one off-screen preview element per shape, hidden from the accessibility tree", () => {
    render(<ShapePanel />)
    const hiddenContainer = document.querySelector('div[aria-hidden="true"][style*="-9999px"]')
    expect(hiddenContainer).not.toBeNull()
    expect(hiddenContainer?.children).toHaveLength(CANVAS_SHAPES.length)
  })
})
