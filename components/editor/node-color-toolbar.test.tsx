// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { NodeColorToolbar } from "./node-color-toolbar"
import { DEFAULT_NODE_COLOR, DEFAULT_NODE_TEXT_COLOR, NODE_COLORS } from "@/types/canvas"

describe("NodeColorToolbar", () => {
  it("renders exactly one swatch button per NODE_COLORS pair", () => {
    render(<NodeColorToolbar activeColor={DEFAULT_NODE_COLOR} onSelect={vi.fn()} />)
    expect(screen.getAllByRole("button")).toHaveLength(NODE_COLORS.length)
  })

  it("marks the swatch matching the current activeColor as active via aria-pressed and border-brand", () => {
    const bluePair = NODE_COLORS[1]
    render(<NodeColorToolbar activeColor={bluePair.color} onSelect={vi.fn()} />)

    const activeButton = screen.getByRole("button", { name: `Set node color to ${bluePair.color}` })
    expect(activeButton).toHaveAttribute("aria-pressed", "true")
    expect(activeButton.className).toContain("border-brand")

    const inactiveButton = screen.getByRole("button", {
      name: `Set node color to ${DEFAULT_NODE_COLOR}`,
    })
    expect(inactiveButton).toHaveAttribute("aria-pressed", "false")
    expect(inactiveButton.className).not.toContain("border-brand")
  })

  it("calls onSelect with the full { color, textColor } pair on click", () => {
    const onSelect = vi.fn()
    render(<NodeColorToolbar activeColor={DEFAULT_NODE_COLOR} onSelect={onSelect} />)

    const greenPair = NODE_COLORS[6]
    fireEvent.click(screen.getByRole("button", { name: `Set node color to ${greenPair.color}` }))

    expect(onSelect).toHaveBeenCalledWith(greenPair)
  })

  it("sets each swatch's own fill color via an inline background-color style", () => {
    render(<NodeColorToolbar activeColor={DEFAULT_NODE_COLOR} onSelect={vi.fn()} />)
    for (const pair of NODE_COLORS) {
      const button = screen.getByRole("button", { name: `Set node color to ${pair.color}` }) as HTMLElement
      expect(button.style.backgroundColor).not.toBe("")
    }
  })

  it("applies nodrag/nopan classes to the container so interacting doesn't drag or pan", () => {
    render(<NodeColorToolbar activeColor={DEFAULT_NODE_COLOR} onSelect={vi.fn()} />)
    const container = screen.getByRole("button", {
      name: `Set node color to ${DEFAULT_NODE_COLOR}`,
    }).parentElement as HTMLElement
    expect(container.className).toContain("nodrag")
    expect(container.className).toContain("nopan")
  })

  it("only renders exactly 8 predefined swatches, no free-form color input", () => {
    render(<NodeColorToolbar activeColor={DEFAULT_NODE_COLOR} onSelect={vi.fn()} />)
    expect(screen.queryAllByRole("textbox")).toHaveLength(0)
    expect(document.querySelector('input[type="color"]')).toBeNull()
    expect(screen.getAllByRole("button")).toHaveLength(8)
  })

  it("uses the default pairing's text color as the default swatch's glow reference", () => {
    render(<NodeColorToolbar activeColor={DEFAULT_NODE_COLOR} onSelect={vi.fn()} />)
    const defaultButton = screen.getByRole("button", {
      name: `Set node color to ${DEFAULT_NODE_COLOR}`,
    }) as HTMLElement
    expect(defaultButton.style.getPropertyValue("--swatch-glow")).toBe(DEFAULT_NODE_TEXT_COLOR)
  })
})
