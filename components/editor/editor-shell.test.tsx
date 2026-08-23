// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act } from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { EditorShell } from "./editor-shell"

const { useParamsMock, projectSidebarPropsRef } = vi.hoisted(() => ({
  useParamsMock: vi.fn(),
  projectSidebarPropsRef: { current: null as { isOpen: boolean; onClose: () => void } | null },
}))

vi.mock("next/navigation", () => ({
  useParams: useParamsMock,
}))

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="user-button" />,
}))

vi.mock("./project-dialogs-provider", () => ({
  ProjectDialogsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("./project-sidebar", () => ({
  ProjectSidebar: (props: { isOpen: boolean; onClose: () => void }) => {
    projectSidebarPropsRef.current = props
    return <div data-testid="project-sidebar" data-open={String(props.isOpen)} />
  },
}))

function renderShell(roomId?: string) {
  useParamsMock.mockReturnValue(roomId ? { roomId } : {})
  return render(
    <EditorShell ownedProjects={[]} sharedProjects={[]}>
      <div />
    </EditorShell>,
  )
}

describe("EditorShell", () => {
  it("opens the sidebar automatically when landing on the /editor home route (no roomId)", () => {
    renderShell(undefined)

    expect(screen.getByTestId("project-sidebar")).toHaveAttribute("data-open", "true")
  })

  it("does not force the sidebar open when landing directly on a project route", () => {
    renderShell("project-1")

    expect(screen.getByTestId("project-sidebar")).toHaveAttribute("data-open", "false")
  })

  it("opens the sidebar again when navigating from a project back to home", () => {
    const { rerender } = render(
      <EditorShell ownedProjects={[]} sharedProjects={[]}>
        <div />
      </EditorShell>,
    )
    useParamsMock.mockReturnValue({ roomId: "project-1" })
    rerender(
      <EditorShell ownedProjects={[]} sharedProjects={[]}>
        <div />
      </EditorShell>,
    )
    expect(screen.getByTestId("project-sidebar")).toHaveAttribute("data-open", "false")

    useParamsMock.mockReturnValue({})
    rerender(
      <EditorShell ownedProjects={[]} sharedProjects={[]}>
        <div />
      </EditorShell>,
    )

    expect(screen.getByTestId("project-sidebar")).toHaveAttribute("data-open", "true")
  })

  it("does not snap the sidebar back open after the user manually closes it while still on /editor", () => {
    renderShell(undefined)
    expect(screen.getByTestId("project-sidebar")).toHaveAttribute("data-open", "true")

    act(() => {
      projectSidebarPropsRef.current?.onClose()
    })

    expect(screen.getByTestId("project-sidebar")).toHaveAttribute("data-open", "false")
  })
})
