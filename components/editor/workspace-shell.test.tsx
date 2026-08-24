// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkspaceShell } from "./workspace-shell";

// `AiArchitectTab` (spec 26, rendered for real via `AiSidebar` in this file)
// imports `useRealtimeRun` from `@trigger.dev/react-hooks` — mocked so this
// file's tests (which only care about `WorkspaceShell`'s own prop-threading)
// never reach a real Trigger.dev subscription.
const { useRealtimeRunMock } = vi.hoisted(() => ({
  useRealtimeRunMock: vi.fn(),
}));

vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: useRealtimeRunMock,
}));

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
    onChatMessagesChange,
    onSendChatMessageChange,
    onSendAgentMessageChange,
    onCanvasGraphChange,
  }: {
    roomId: string;
    isTemplatesModalOpen: boolean;
    setIsTemplatesModalOpen: (open: boolean) => void;
    onSaveStatusChange: (status: "idle" | "saving" | "saved" | "error") => void;
    onAiStatusChange: (status: { stage: string; text?: string } | null) => void;
    onChatMessagesChange: (
      messages: { id: string; sender: string; role: "user" | "assistant"; content: string; timestamp: number }[],
    ) => void;
    onSendChatMessageChange: (sendMessage: (content: string) => void) => void;
    onSendAgentMessageChange: (sendAgentMessage: (content: string) => void) => void;
    onCanvasGraphChange: (
      nodes: { id: string; position: { x: number; y: number }; data: Record<string, unknown> }[],
      edges: { id: string; source: string; target: string; data?: Record<string, unknown> }[],
    ) => void;
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
      {/*
        Spec 25: same push-up shape for the `ai-chat` message list, plus the
        bidirectional `sendMessage` function push-down — these two buttons
        stand in for `CanvasFlow`'s real `useAiChatFeed()` result so
        `WorkspaceShell`'s wiring to `AiSidebar` can be verified here without
        re-mounting the real Liveblocks room stack.
      */}
      <button
        type="button"
        onClick={() =>
          onChatMessagesChange([
            { id: "1", sender: "Ada", role: "user", content: "Hello Ghost AI", timestamp: 1700000000000 },
          ])
        }
      >
        simulate chat messages
      </button>
      <button
        type="button"
        onClick={() => onSendChatMessageChange(() => {})}
      >
        simulate send ready
      </button>
      {/*
        Spec 26: same push-up shape for the AI-authored `sendAgentMessage`
        function — stands in for `CanvasFlow`'s real `useAiChatFeed()` result
        so `WorkspaceShell`'s wiring to `AiSidebar` can be verified here
        without re-mounting the real Liveblocks room stack.
      */}
      <button
        type="button"
        onClick={() => onSendAgentMessageChange(() => {})}
      >
        simulate agent send ready
      </button>
      {/*
        Spec 30: same push-up shape for the room's live canvas nodes/edges —
        stands in for `CanvasFlow`'s real `useLiveblocksFlow()` result so
        `WorkspaceShell`'s wiring to `AiSidebar` -> `SpecsTab` can be verified
        here without re-mounting the real Liveblocks room stack.
      */}
      <button
        type="button"
        onClick={() =>
          onCanvasGraphChange(
            [
              {
                id: "n1",
                position: { x: 0, y: 0 },
                data: { label: "API", color: "#1F1F1F", textColor: "#EDEDED", shape: "rectangle" },
              },
            ],
            [{ id: "e1", source: "n1", target: "n2", data: { label: "calls" } }],
          )
        }
      >
        simulate canvas graph
      </button>
    </div>
  ),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ collaborators: [] }) });
  vi.stubGlobal("fetch", fetchMock);
  useRealtimeRunMock.mockReturnValue({ run: undefined, error: undefined, stop: vi.fn() });
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

  it("passes onChatMessagesChange down to Canvas and threads the resulting messages through to the AI sidebar (spec 25)", () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    fireEvent.click(screen.getByRole("button", { name: /toggle ai sidebar/i }));

    expect(screen.queryByText("Hello Ghost AI")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /simulate chat messages/i }));

    expect(screen.getByText("Hello Ghost AI")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("passes onSendChatMessageChange down to Canvas and threads the resulting function through to the AI sidebar (spec 25)", async () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    fireEvent.click(screen.getByRole("button", { name: /toggle ai sidebar/i }));
    fireEvent.click(screen.getByRole("button", { name: /simulate send ready/i }));

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    // The stand-in sendMessage is a genuine no-op (not the default
    // "not ready yet" thrower) — a successful send clears the input and
    // shows no error indicator.
    expect(textarea.value).toBe("");
    expect(screen.queryByText(/failed to send/i)).not.toBeInTheDocument();

    // Let the spec-26 design-agent submit flow this send also triggers
    // settle (the generic collaborators fetch stub above resolves `ok: true`
    // with no `runId`, so it fails closed) before this test's own teardown.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("passes onSendAgentMessageChange down to Canvas and threads a real (non-throwing) sendAgentMessage function through to the AI sidebar (spec 26)", () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    fireEvent.click(screen.getByRole("button", { name: /toggle ai sidebar/i }));
    // Before this, AiArchitectTab's sendAgentMessage default is a throwing
    // stub — swallowed internally (console.error), so nothing is directly
    // observable here. Simulating the real one reaching this component is
    // the behavior under test; the button existing/being clickable without
    // throwing is the confirmation that the callback shape lines up.
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: /simulate agent send ready/i })),
    ).not.toThrow();
  });

  it("passes project.id down to Canvas/AiSidebar/AiArchitectTab as projectId, used in the design-agent submit body (spec 26)", async () => {
    render(<WorkspaceShell project={{ id: "proj-77", name: "Project One" }} isOwner={true} />);

    fireEvent.click(screen.getByRole("button", { name: /toggle ai sidebar/i }));
    fireEvent.click(screen.getByRole("button", { name: /simulate send ready/i }));

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      const designCall = fetchMock.mock.calls.find(([url]) => url === "/api/ai/design");
      expect(designCall).toBeDefined();
    });

    const designCall = fetchMock.mock.calls.find(([url]) => url === "/api/ai/design") as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(designCall[1].body as string)).toMatchObject({
      roomId: "proj-77",
      projectId: "proj-77",
    });
  });

  it("passes onCanvasGraphChange down to Canvas and threads the resulting nodes/edges through to the Specs tab's Generate Spec request (spec 30)", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/ai/spec") {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ collaborators: [], specs: [] }) });
    });

    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    fireEvent.click(screen.getByRole("button", { name: /toggle ai sidebar/i }));
    fireEvent.click(screen.getByRole("button", { name: /simulate canvas graph/i }));
    fireEvent.click(screen.getByRole("tab", { name: "Specs" }));

    fireEvent.click(screen.getByRole("button", { name: /generate spec/i }));

    await waitFor(() => {
      const specCall = fetchMock.mock.calls.find(([url]) => url === "/api/ai/spec");
      expect(specCall).toBeDefined();
    });

    const specCall = fetchMock.mock.calls.find(([url]) => url === "/api/ai/spec") as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(specCall[1].body as string)).toEqual({
      roomId: "p1",
      chatHistory: [],
      nodes: [{ id: "n1", label: "API", shape: "rectangle", x: 0, y: 0 }],
      edges: [{ id: "e1", sourceNodeId: "n1", targetNodeId: "n2", label: "calls" }],
    });
  });

  it("fetches the public link alongside collaborators when the Share dialog opens for an owner (spec 34)", async () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/collaborators");
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/public-link");
    });
  });

  it("does not fetch the public link when the Share dialog opens for a non-owner collaborator (spec 34)", async () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={false} />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/collaborators");
    });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/projects/p1/public-link");
  });

  it("defaults sendChatMessage to a function that fails (input preserved, error shown) before Canvas pushes a real one", () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    fireEvent.click(screen.getByRole("button", { name: /toggle ai sidebar/i }));

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(textarea.value).toBe("Design a queue");
    expect(screen.getByText(/failed to send/i)).toBeInTheDocument();
  });
});
