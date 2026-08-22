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
    onSaveStatusChange,
    onAiStatusChange,
  }: {
    roomId: string;
    isTemplatesModalOpen: boolean;
    setIsTemplatesModalOpen: (open: boolean) => void;
    onSaveStatusChange: (status: "idle" | "saving" | "saved" | "error") => void;
    onAiStatusChange: (status: { stage: string; text?: string } | null) => void;
  }) => (
    <div
      data-testid="canvas"
      data-room-id={roomId}
      data-templates-modal-open={String(isTemplatesModalOpen)}
    >
      {/*
        Spec 21: `CanvasFlow`'s real internals (Liveblocks-mocked
        `canvas.test.tsx` territory) push a save status up through this
        callback prop — this button stands in for that push so
        `WorkspaceShell`'s wiring to `WorkspaceNavbar` can be verified here
        without re-mounting the real Liveblocks room stack.
      */}
      <button type="button" onClick={() => onSaveStatusChange("saved")}>
        simulate save
      </button>
      {/*
        Spec 24: same push-up shape for `ai-status-feed` — this button
        stands in for `CanvasFlow`'s real `useAiStatusFeed()` push so
        `WorkspaceShell`'s wiring to `AiSidebar` can be verified here without
        re-mounting the real Liveblocks room stack.
      */}
      <button type="button" onClick={() => onAiStatusChange({ stage: "processing", text: "Designing…" })}>
        simulate ai status
      </button>
    </div>
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

    const aiSidebar = screen.getByText("AI Workspace").closest("aside");
    expect(aiSidebar).toHaveAttribute("aria-hidden", "true");
  });

  it("toggles the AI sidebar open and closed via the navbar button", () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    const toggle = screen.getByRole("button", { name: /toggle ai sidebar/i });
    const aiSidebar = screen.getByText("AI Workspace").closest("aside");

    fireEvent.click(toggle);
    expect(aiSidebar).toHaveAttribute("aria-hidden", "false");

    fireEvent.click(toggle);
    expect(aiSidebar).toHaveAttribute("aria-hidden", "true");
  });

  it("closes the AI sidebar via its own header close button", () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    const toggle = screen.getByRole("button", { name: /toggle ai sidebar/i });
    fireEvent.click(toggle);

    const aiSidebar = screen.getByText("AI Workspace").closest("aside") as HTMLElement;
    expect(aiSidebar).toHaveAttribute("aria-hidden", "false");

    const closeButton = screen.getByRole("button", { name: /close ai sidebar/i });
    fireEvent.click(closeButton);
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

  it("passes onSaveStatusChange down to Canvas and renders the resulting status in the navbar (spec 21)", () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    expect(screen.queryByText("Saved")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /simulate save/i }));

    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("passes onAiStatusChange down to Canvas and threads the resulting status through to the AI sidebar (spec 24)", () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    // Open the AI sidebar so AiArchitectTab is rendered/queryable.
    fireEvent.click(screen.getByRole("button", { name: /toggle ai sidebar/i }));

    expect(screen.queryByText("Designing…")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /simulate ai status/i }));

    expect(screen.getByText("Designing…")).toBeInTheDocument();
    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    expect(textarea).toBeDisabled();
  });
});
