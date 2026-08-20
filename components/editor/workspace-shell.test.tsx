// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkspaceShell } from "./workspace-shell";

// `Canvas` owns a real Liveblocks room connection (`LiveblocksProvider`/
// `RoomProvider`/`useLiveblocksFlow`) — unsuitable for this component-level
// test, which only cares that `WorkspaceShell` renders it with the right
// room ID. Canvas's own internals are covered by `canvas.test.tsx`.
vi.mock("@/components/editor/canvas", () => ({
  Canvas: ({
    roomId,
    isTemplatesModalOpen,
  }: {
    roomId: string;
    isTemplatesModalOpen: boolean;
    setIsTemplatesModalOpen: (open: boolean) => void;
  }) => (
    <div
      data-testid="canvas"
      data-room-id={roomId}
      data-templates-modal-open={String(isTemplatesModalOpen)}
    />
  ),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ collaborators: [] }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkspaceShell", () => {
  it("renders the project name, the canvas scoped to the project's room, and a closed AI sidebar by default", () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    expect(screen.getByRole("heading", { name: "Project One" })).toBeInTheDocument();
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-room-id", "p1");

    const aiSidebar = screen.getByText(/ai chat is coming soon/i).closest("aside");
    expect(aiSidebar).toHaveAttribute("aria-hidden", "true");
  });

  it("toggles the AI sidebar placeholder open and closed", () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    const toggle = screen.getByRole("button", { name: /toggle ai sidebar/i });
    const aiSidebar = screen.getByText(/ai chat is coming soon/i).closest("aside");

    fireEvent.click(toggle);
    expect(aiSidebar).toHaveAttribute("aria-hidden", "false");

    fireEvent.click(toggle);
    expect(aiSidebar).toHaveAttribute("aria-hidden", "true");
  });

  it("opens the Share dialog when the Share button is clicked", async () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const shareButton = screen.getByRole("button", { name: /share/i });
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /share project/i })).toBeInTheDocument();
  });

  it("passes isTemplatesModalOpen/setIsTemplatesModalOpen down to Canvas, opened via the Templates navbar button", () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    expect(screen.getByTestId("canvas")).toHaveAttribute("data-templates-modal-open", "false");

    const templatesButton = screen.getByRole("button", { name: /templates/i });
    fireEvent.click(templatesButton);

    expect(screen.getByTestId("canvas")).toHaveAttribute("data-templates-modal-open", "true");
  });
});
