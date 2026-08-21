// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { WorkspaceNavbar } from "./workspace-navbar"

function renderNavbar(overrides: Partial<Parameters<typeof WorkspaceNavbar>[0]> = {}) {
  const props = {
    projectName: "Test Project",
    isAiSidebarOpen: false,
    onToggleAiSidebar: vi.fn(),
    onOpenShare: vi.fn(),
    onOpenTemplates: vi.fn(),
    saveStatus: "idle" as const,
    ...overrides,
  }
  render(<WorkspaceNavbar {...props} />)
  return props
}

describe("WorkspaceNavbar", () => {
  it("renders the project name and a Templates button alongside Share and the AI toggle", () => {
    renderNavbar()

    expect(screen.getByRole("heading", { name: "Test Project" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /templates/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /toggle ai sidebar/i })).toBeInTheDocument()
  })

  it("calls onOpenTemplates when the Templates button is clicked", () => {
    const { onOpenTemplates } = renderNavbar()

    fireEvent.click(screen.getByRole("button", { name: /templates/i }))

    expect(onOpenTemplates).toHaveBeenCalledTimes(1)
  })

  it("renders nothing for the save status by default (idle)", () => {
    renderNavbar()

    expect(screen.queryByText(/saving|saved|save failed/i)).not.toBeInTheDocument()
  })

  it("renders the save status indicator for a non-idle saveStatus", () => {
    renderNavbar({ saveStatus: "saved" })

    expect(screen.getByText("Saved")).toBeInTheDocument()
  })
})
