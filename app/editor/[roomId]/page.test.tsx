// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getProjectAccessMock, redirectMock } = vi.hoisted(() => ({
  getProjectAccessMock: vi.fn(),
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/project-access", () => ({
  getProjectAccess: getProjectAccessMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/components/editor/access-denied", () => ({
  AccessDenied: () => <div>access-denied</div>,
}));

vi.mock("@/components/editor/workspace-shell", () => ({
  WorkspaceShell: ({
    project,
    isOwner,
  }: {
    project: { id: string; name: string }
    isOwner: boolean
  }) => (
    <div>
      workspace-shell:{project.name}:{isOwner ? "owner" : "collaborator"}
    </div>
  ),
}));

import EditorRoomPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditorRoomPage", () => {
  it("redirects to /sign-in when unauthenticated", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "unauthenticated" });

    await expect(
      EditorRoomPage({ params: Promise.resolve({ roomId: "p1" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/sign-in");
  });

  it("renders AccessDenied when the project does not exist", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "not-found" });

    const element = await EditorRoomPage({ params: Promise.resolve({ roomId: "missing" }) });
    render(element);

    expect(screen.getByText("access-denied")).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("renders AccessDenied when the caller lacks access", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "forbidden" });

    const element = await EditorRoomPage({ params: Promise.resolve({ roomId: "p1" }) });
    render(element);

    expect(screen.getByText("access-denied")).toBeInTheDocument();
  });

  it("renders the workspace shell with the resolved project for an owner", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "Project One" },
      isOwner: true,
    });

    const element = await EditorRoomPage({ params: Promise.resolve({ roomId: "p1" }) });
    render(element);

    expect(screen.getByText("workspace-shell:Project One:owner")).toBeInTheDocument();
  });

  it("renders the workspace shell with isOwner false for a collaborator", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "Project One" },
      isOwner: false,
    });

    const element = await EditorRoomPage({ params: Promise.resolve({ roomId: "p1" }) });
    render(element);

    expect(screen.getByText("workspace-shell:Project One:collaborator")).toBeInTheDocument();
  });

  it("passes the awaited roomId through to the access check", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "Project One" },
      isOwner: true,
    });

    await EditorRoomPage({ params: Promise.resolve({ roomId: "p1" }) });

    expect(getProjectAccessMock).toHaveBeenCalledWith("p1");
  });
});
