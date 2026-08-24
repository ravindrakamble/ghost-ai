// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SaveTemplateDialog } from "./save-template-dialog"

function baseProps(overrides: Partial<React.ComponentProps<typeof SaveTemplateDialog>> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn().mockResolvedValue(true),
    isSaving: false,
    error: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("SaveTemplateDialog", () => {
  it("renders nothing when closed", () => {
    render(<SaveTemplateDialog {...baseProps({ open: false })} />)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("disables the Save button while the trimmed name is empty", () => {
    render(<SaveTemplateDialog {...baseProps()} />)

    const saveButton = screen.getByRole("button", { name: /^save template$/i })
    expect(saveButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "   " } })
    expect(saveButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "My template" } })
    expect(saveButton).not.toBeDisabled()
  })

  it("calls onSave with the trimmed name and description, then closes on success", async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    const onOpenChange = vi.fn()
    render(<SaveTemplateDialog {...baseProps({ onSave, onOpenChange })} />)

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "  My template  " } })
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "  a description  " } })
    fireEvent.click(screen.getByRole("button", { name: /^save template$/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("My template", "a description"))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it("does not close the dialog when onSave reports failure", async () => {
    const onSave = vi.fn().mockResolvedValue(false)
    const onOpenChange = vi.fn()
    render(<SaveTemplateDialog {...baseProps({ onSave, onOpenChange })} />)

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "My template" } })
    fireEvent.click(screen.getByRole("button", { name: /^save template$/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("shows a spinner and disables the Save button while isSaving is true", () => {
    render(<SaveTemplateDialog {...baseProps({ isSaving: true })} />)

    // `DialogContent` renders into a portal appended to `document.body`, not
    // RTL's own `container` div — same reason `specs-tab.test.tsx`/
    // `canvas-control-bar.test.tsx`'s spinner assertions query from a found
    // element rather than `container` when a portal is involved.
    const spinner = document.querySelector(".animate-spin")
    expect(spinner).toBeInTheDocument()
    expect(spinner?.closest("button")).toBeDisabled()
  })

  it("surfaces a save error", () => {
    render(<SaveTemplateDialog {...baseProps({ error: "Failed to save the template." })} />)

    expect(screen.getByText("Failed to save the template.")).toBeInTheDocument()
  })

  it("resets name/description when the dialog is closed via its own close control", () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<SaveTemplateDialog {...baseProps({ onOpenChange })} />)

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Draft name" } })
    expect(screen.getByLabelText(/^name$/i)).toHaveValue("Draft name")

    fireEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)

    rerender(<SaveTemplateDialog {...baseProps({ open: true, onOpenChange })} />)

    expect(screen.getByLabelText(/^name$/i)).toHaveValue("")
  })
})
