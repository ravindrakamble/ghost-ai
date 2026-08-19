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
      const dataTransfer = { setData, effectAllowed: "" }
      fireEvent.dragStart(screen.getByTitle(SHAPE_LABELS[shape]), { dataTransfer })

      expect(setData).toHaveBeenCalledTimes(1)
      const [mimeType, raw] = setData.mock.calls[0] as [string, string]
      expect(mimeType).toBe(CANVAS_DRAG_MIME_TYPE)
      expect(JSON.parse(raw)).toEqual({ shape, ...SHAPE_DEFAULT_SIZES[shape] })
      expect(dataTransfer.effectAllowed).toBe("copy")
    }
  })
})
