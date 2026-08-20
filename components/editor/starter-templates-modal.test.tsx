// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { StarterTemplatesModal } from "./starter-templates-modal"
import { CANVAS_TEMPLATES } from "./starter-templates"

function renderModal(overrides: Partial<Parameters<typeof StarterTemplatesModal>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onImport: vi.fn(),
    ...overrides,
  }
  render(<StarterTemplatesModal {...props} />)
  return props
}

describe("StarterTemplatesModal", () => {
  it("renders nothing when closed", () => {
    renderModal({ open: false })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("renders one card per CANVAS_TEMPLATES entry, with its name, description, and an Import button", () => {
    renderModal()

    expect(screen.getByRole("dialog")).toBeInTheDocument()

    for (const template of CANVAS_TEMPLATES) {
      expect(screen.getByText(template.name)).toBeInTheDocument()
      expect(screen.getByText(template.description)).toBeInTheDocument()
    }

    expect(screen.getAllByRole("button", { name: /import/i })).toHaveLength(CANVAS_TEMPLATES.length)
  })

  it("renders a preview for every template card", () => {
    render(<StarterTemplatesModal open onOpenChange={vi.fn()} onImport={vi.fn()} />)

    // Each `StarterTemplatePreview` svg carries `role="img"` + an
    // `aria-label` — a more precise query than "every <svg> in the dialog",
    // which would also match the dialog close button's lucide `XIcon`.
    expect(screen.getAllByRole("img")).toHaveLength(CANVAS_TEMPLATES.length)
  })

  it("calls onImport with the clicked template, then closes the modal", () => {
    const { onImport, onOpenChange } = renderModal()

    const target = CANVAS_TEMPLATES[0]
    const importButtons = screen.getAllByRole("button", { name: /import/i })
    fireEvent.click(importButtons[0])

    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onImport).toHaveBeenCalledWith(target)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("calls onImport before closing the modal (import then close, not the other order)", () => {
    const callOrder: string[] = []
    const onImport = vi.fn(() => callOrder.push("import"))
    const onOpenChange = vi.fn(() => callOrder.push("close"))
    render(<StarterTemplatesModal open onOpenChange={onOpenChange} onImport={onImport} />)

    fireEvent.click(screen.getAllByRole("button", { name: /import/i })[0])

    expect(callOrder).toEqual(["import", "close"])
  })
})
