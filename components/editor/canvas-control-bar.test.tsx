// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { CanvasControlBar } from "./canvas-control-bar"

function renderBar(overrides: Partial<Parameters<typeof CanvasControlBar>[0]> = {}) {
  const props = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onFitView: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: true,
    canRedo: true,
    ...overrides,
  }
  render(<CanvasControlBar {...props} />)
  return props
}

describe("CanvasControlBar", () => {
  it("renders all five buttons, grouped with a divider between zoom and history controls", () => {
    renderBar()

    const buttons = screen.getAllByRole("button")
    expect(buttons).toHaveLength(5)
    expect(screen.getByRole("button", { name: /zoom out/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /fit view/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /redo/i })).toBeInTheDocument()

    // Exactly one divider element between the two groups.
    const dividers = document.querySelectorAll(".bg-surface-border")
    expect(dividers).toHaveLength(1)
    expect(dividers[0]).toHaveAttribute("aria-hidden", "true")
  })

  it("calls onZoomOut/onFitView/onZoomIn when their buttons are clicked", () => {
    const { onZoomOut, onFitView, onZoomIn } = renderBar()

    fireEvent.click(screen.getByRole("button", { name: /zoom out/i }))
    fireEvent.click(screen.getByRole("button", { name: /fit view/i }))
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }))

    expect(onZoomOut).toHaveBeenCalledTimes(1)
    expect(onFitView).toHaveBeenCalledTimes(1)
    expect(onZoomIn).toHaveBeenCalledTimes(1)
  })

  it("calls onUndo/onRedo when their buttons are clicked", () => {
    const { onUndo, onRedo } = renderBar()

    fireEvent.click(screen.getByRole("button", { name: /undo/i }))
    fireEvent.click(screen.getByRole("button", { name: /redo/i }))

    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(1)
  })

  it("disables and dims the undo button when canUndo is false", () => {
    renderBar({ canUndo: false })

    expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /redo/i })).not.toBeDisabled()
  })

  it("disables and dims the redo button when canRedo is false", () => {
    renderBar({ canRedo: false })

    expect(screen.getByRole("button", { name: /redo/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /undo/i })).not.toBeDisabled()
  })

  it("does not call onUndo/onRedo when the buttons are disabled", () => {
    const { onUndo, onRedo } = renderBar({ canUndo: false, canRedo: false })

    fireEvent.click(screen.getByRole("button", { name: /undo/i }))
    fireEvent.click(screen.getByRole("button", { name: /redo/i }))

    expect(onUndo).not.toHaveBeenCalled()
    expect(onRedo).not.toHaveBeenCalled()
  })
})
