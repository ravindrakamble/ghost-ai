// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { useParamsMock } = vi.hoisted(() => ({
  useParamsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: useParamsMock,
}));

vi.mock("@/components/editor/project-dialogs-provider", () => ({
  useProjectDialogsContext: () => ({
    ownedProjects: [
      { id: "p1", name: "Project One" },
      { id: "p2", name: "Project Two" },
    ],
    sharedProjects: [{ id: "p3", name: "Shared Project" }],
    openCreateDialog: vi.fn(),
    openRenameDialog: vi.fn(),
    openDeleteDialog: vi.fn(),
  }),
}));

import { ProjectSidebar } from "./project-sidebar";

describe("ProjectSidebar", () => {
  it("highlights the owned project matching the active room", () => {
    useParamsMock.mockReturnValue({ roomId: "p1" });

    render(<ProjectSidebar isOpen onClose={() => {}} />);

    expect(screen.getByText("Project One").className).toContain("text-brand");
    expect(screen.getByText("Project Two").className).not.toContain("text-brand");
  });

  it("highlights the shared project matching the active room", () => {
    useParamsMock.mockReturnValue({ roomId: "p3" });

    render(<ProjectSidebar isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Shared" }));

    expect(screen.getByText("Shared Project").className).toContain("text-brand");
  });

  it("highlights nothing when there is no active room", () => {
    useParamsMock.mockReturnValue({});

    render(<ProjectSidebar isOpen onClose={() => {}} />);

    expect(screen.getByText("Project One").className).not.toContain("text-brand");

    fireEvent.click(screen.getByRole("tab", { name: "Shared" }));
    expect(screen.getByText("Shared Project").className).not.toContain("text-brand");
  });

  it("links each owned project name to its editor route", () => {
    useParamsMock.mockReturnValue({ roomId: "p1" });

    render(<ProjectSidebar isOpen onClose={() => {}} />);

    expect(screen.getByText("Project One").closest("a")).toHaveAttribute("href", "/editor/p1");
    expect(screen.getByText("Project Two").closest("a")).toHaveAttribute("href", "/editor/p2");
  });

  it("links each shared project name to its editor route", () => {
    useParamsMock.mockReturnValue({ roomId: "p3" });

    render(<ProjectSidebar isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Shared" }));

    expect(screen.getByText("Shared Project").closest("a")).toHaveAttribute("href", "/editor/p3");
  });

  it("closes the sidebar when a project name is clicked", () => {
    useParamsMock.mockReturnValue({ roomId: "p1" });
    const onClose = vi.fn();

    render(<ProjectSidebar isOpen onClose={onClose} />);
    fireEvent.click(screen.getByText("Project Two"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
