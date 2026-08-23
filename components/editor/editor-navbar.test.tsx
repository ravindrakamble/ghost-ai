// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { EditorNavbar } from "./editor-navbar"

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="user-button" />,
}))

function renderNavbar(overrides: Partial<Parameters<typeof EditorNavbar>[0]> = {}) {
  const props = {
    sidebarOpen: false,
    onSidebarToggle: vi.fn(),
    ...overrides,
  }
  render(<EditorNavbar {...props} />)
  return props
}

describe("EditorNavbar", () => {
  it("renders a Home link pointing at /editor", () => {
    renderNavbar()

    const homeLink = screen.getByRole("link", { name: /home/i })
    expect(homeLink).toHaveAttribute("href", "/editor")
  })

  it("calls onSidebarToggle when the sidebar toggle button is clicked", () => {
    const { onSidebarToggle } = renderNavbar()

    fireEvent.click(screen.getByRole("button", { name: /toggle sidebar/i }))

    expect(onSidebarToggle).toHaveBeenCalledTimes(1)
  })

  it("shows the collapse icon when sidebarOpen is true and the expand icon when false", () => {
    const { container: openContainer } = render(
      <EditorNavbar sidebarOpen onSidebarToggle={vi.fn()} />,
    )
    expect(openContainer.querySelector(".lucide-panel-left-close")).toBeInTheDocument()

    const { container: closedContainer } = render(
      <EditorNavbar sidebarOpen={false} onSidebarToggle={vi.fn()} />,
    )
    expect(closedContainer.querySelector(".lucide-panel-left-open")).toBeInTheDocument()
  })

  it("renders the UserButton", () => {
    renderNavbar()

    expect(screen.getByTestId("user-button")).toBeInTheDocument()
  })
})
