// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { StarterTemplatesModal } from "./starter-templates-modal"
import { CANVAS_TEMPLATES } from "./starter-templates"

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", fetchMock)
  // Default: no saved templates — individual tests override.
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ templates: [] }) })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it("renders one card per CANVAS_TEMPLATES entry, with its name, description, and an Import button", async () => {
    renderModal()

    expect(screen.getByRole("dialog")).toBeInTheDocument()

    for (const template of CANVAS_TEMPLATES) {
      expect(screen.getByText(template.name)).toBeInTheDocument()
      expect(screen.getByText(template.description)).toBeInTheDocument()
    }

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/templates"))
    expect(screen.getAllByRole("button", { name: /^import$/i })).toHaveLength(CANVAS_TEMPLATES.length)
  })

  it("renders a preview for every built-in template card", () => {
    render(<StarterTemplatesModal open onOpenChange={vi.fn()} onImport={vi.fn()} />)

    // Each `StarterTemplatePreview` svg carries `role="img"` + an
    // `aria-label` — a more precise query than "every <svg> in the dialog",
    // which would also match the dialog close button's lucide `XIcon`.
    expect(screen.getAllByRole("img")).toHaveLength(CANVAS_TEMPLATES.length)
  })

  it("calls onImport with the clicked built-in template, then closes the modal", () => {
    const { onImport, onOpenChange } = renderModal()

    const target = CANVAS_TEMPLATES[0]
    const importButtons = screen.getAllByRole("button", { name: /^import$/i })
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

    fireEvent.click(screen.getAllByRole("button", { name: /^import$/i })[0])

    expect(callOrder).toEqual(["import", "close"])
  })

  describe("My Templates (spec 33)", () => {
    it("fetches the saved-template list and shows an empty state when there are none", async () => {
      renderModal()

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/templates"))
      expect(await screen.findByText(/no saved templates yet/i)).toBeInTheDocument()
    })

    it("renders one card per saved template, with a delete button and its own Import button", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          templates: [
            { id: "t1", name: "My baseline", description: "A reusable starting point", createdAt: "2026-01-01T00:00:00.000Z" },
          ],
        }),
      })

      renderModal()

      expect(await screen.findByText("My baseline")).toBeInTheDocument()
      expect(screen.getByText("A reusable starting point")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /delete my baseline/i })).toBeInTheDocument()

      // 3 built-in Import buttons + 1 saved-template Import button.
      expect(screen.getAllByRole("button", { name: /^import$/i })).toHaveLength(CANVAS_TEMPLATES.length + 1)
    })

    it("fetches the saved template's content, then calls onImport with it reshaped as a CanvasTemplate, then closes", async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url === "/api/templates") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              templates: [{ id: "t1", name: "My baseline", description: "desc", createdAt: "2026-01-01T00:00:00.000Z" }],
            }),
          })
        }
        if (url === "/api/templates/t1") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: "t1", name: "My baseline", description: "desc", nodes: [{ id: "n1" }], edges: [] }),
          })
        }
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
      })

      const { onImport, onOpenChange } = renderModal()

      await screen.findByText("My baseline")
      const importButtons = screen.getAllByRole("button", { name: /^import$/i })
      fireEvent.click(importButtons[importButtons.length - 1])

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/templates/t1"))
      await waitFor(() =>
        expect(onImport).toHaveBeenCalledWith({
          id: "t1",
          name: "My baseline",
          description: "desc",
          nodes: [{ id: "n1" }],
          edges: [],
        }),
      )
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("shows an inline error and does not call onImport when fetching the saved template's content fails", async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url === "/api/templates") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              templates: [{ id: "t1", name: "My baseline", description: null, createdAt: "2026-01-01T00:00:00.000Z" }],
            }),
          })
        }
        if (url === "/api/templates/t1") {
          return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: "Template not found" }) })
        }
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
      })

      const { onImport, onOpenChange } = renderModal()

      await screen.findByText("My baseline")
      const importButtons = screen.getAllByRole("button", { name: /^import$/i })
      fireEvent.click(importButtons[importButtons.length - 1])

      expect(await screen.findByText("Template not found")).toBeInTheDocument()
      expect(onImport).not.toHaveBeenCalled()
      expect(onOpenChange).not.toHaveBeenCalled()
    })

    it("deletes a saved template and removes it from the list immediately", async () => {
      fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        if (url === "/api/templates") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              templates: [{ id: "t1", name: "My baseline", description: null, createdAt: "2026-01-01T00:00:00.000Z" }],
            }),
          })
        }
        if (url === "/api/templates/t1" && init?.method === "DELETE") {
          return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
        }
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
      })

      renderModal()

      const deleteButton = await screen.findByRole("button", { name: /delete my baseline/i })
      fireEvent.click(deleteButton)

      await waitFor(() => expect(screen.queryByText("My baseline")).not.toBeInTheDocument())
      expect(fetchMock).toHaveBeenCalledWith("/api/templates/t1", { method: "DELETE" })
    })
  })
})
