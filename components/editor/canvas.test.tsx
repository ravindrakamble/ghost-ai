// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Canvas } from "./canvas";
import { CANVAS_TEMPLATES } from "./starter-templates";
import { CANVAS_EDGE_TYPE, CANVAS_NODE_TYPE, DEFAULT_NODE_COLOR } from "@/types/canvas";

// `Canvas` wires together three real Liveblocks/React Flow packages that
// need a live network connection to do anything — this test only verifies
// that `Canvas` wires them together correctly (right room ID, right initial
// presence, synced nodes/edges/handlers reach `ReactFlow`, the drop handler
// creates nodes via `onNodesChange`, and the connection-error fallback
// replaces the canvas when `useErrorListener` reports a
// `ROOM_CONNECTION_ERROR`), not that the real SDKs work.
type ErrorListenerCallback = (error: { context: { type: string } }) => void;
type CapturedReactFlowProps = {
  nodeTypes?: Record<string, unknown>;
  edgeTypes?: Record<string, unknown>;
  defaultEdgeOptions?: { type?: string; markerEnd?: unknown };
  onPaneMouseMove?: (event: { clientX: number; clientY: number }) => void;
  onPaneMouseLeave?: () => void;
};

const {
  errorListenerRef,
  useLiveblocksFlowMock,
  screenToFlowPositionMock,
  flowToScreenPositionMock,
  zoomInMock,
  zoomOutMock,
  fitViewMock,
  setCenterMock,
  useUndoMock,
  useRedoMock,
  useCanUndoMock,
  useCanRedoMock,
  onDeleteMock,
  useRoomMock,
  roomBatchMock,
  reactFlowPropsRef,
  useUpdateMyPresenceMock,
  updateMyPresenceMock,
  useOthersMock,
  useOthersConnectionIdsMock,
  useOtherMock,
  useUserMock,
  useCanvasAutosaveMock,
  fetchMock,
  useAiStatusFeedMock,
  useAiChatFeedMock,
  useNodeCommentsMock,
  roomProviderPropsRef,
  getNodesBoundsMock,
  getViewportForBoundsMock,
  toPngMock,
  useCustomTemplatesMock,
} = vi.hoisted(() => ({
  errorListenerRef: { current: null as ErrorListenerCallback | null },
  useLiveblocksFlowMock: vi.fn(),
  screenToFlowPositionMock: vi.fn(),
  flowToScreenPositionMock: vi.fn(),
  zoomInMock: vi.fn(),
  zoomOutMock: vi.fn(),
  fitViewMock: vi.fn(),
  // Spec 36 (Canvas Node Search): `handleJumpToNode`'s own real dependency,
  // same `useReactFlow()` call the other zoom methods already come from.
  setCenterMock: vi.fn(),
  useUndoMock: vi.fn(),
  useRedoMock: vi.fn(),
  useCanUndoMock: vi.fn(),
  useCanRedoMock: vi.fn(),
  onDeleteMock: vi.fn(),
  // `room.batch(callback)` — mirrors `@liveblocks/core`'s real behavior of
  // just invoking `callback` synchronously (batching/flushing is an
  // implementation detail this test surface doesn't need to simulate; what
  // matters here is that `handleImportTemplate` routes all three mutations
  // through this single call rather than invoking them unwrapped).
  roomBatchMock: vi.fn((callback: () => void) => callback()),
  useRoomMock: vi.fn(),
  reactFlowPropsRef: { current: null as CapturedReactFlowProps | null },
  // Spec 19 (Presence Avatars & Cursor): `useUpdateMyPresence`'s own update
  // function, plus the presence hooks `PresenceAvatars`/`LiveCursors`
  // (rendered for real by `Canvas`, not mocked out) read from.
  useUpdateMyPresenceMock: vi.fn(),
  updateMyPresenceMock: vi.fn(),
  useOthersMock: vi.fn(),
  useOthersConnectionIdsMock: vi.fn(),
  useOtherMock: vi.fn(),
  useUserMock: vi.fn(),
  // Spec 21 (Canvas Autosave): `useCanvasAutosave` itself is unit-tested in
  // `hooks/use-canvas-autosave.test.ts` (debounce timing, status
  // transitions, stale-response discarding) — mocked here so this file only
  // has to verify *wiring* (right projectId/nodes/edges/enabled args, and
  // that its returned status reaches `onSaveStatusChange`), not re-prove the
  // hook's own internals through a much heavier Liveblocks-mocked surface.
  useCanvasAutosaveMock: vi.fn(),
  // `CanvasFlow`'s own initial-load-or-skip effect (spec 21) calls the real
  // global `fetch` directly (not through a mocked hook) for
  // `GET /api/projects/[projectId]/canvas` — stubbed globally so this file's
  // many pre-existing tests (which never exercise autosave/load behavior
  // themselves) don't hit a real network call on every mount.
  fetchMock: vi.fn(),
  // Spec 24: `useAiStatusFeed`'s own internals (real `useEventListener`
  // subscription, validation, latest-only state) are unit-tested in
  // `hooks/use-ai-status-feed.test.ts` — mocked here so this file only
  // verifies *wiring* (that `CanvasFlow` calls it and pushes the result up
  // via `onAiStatusChange`), the same convention already established for
  // `useCanvasAutosaveMock` above.
  useAiStatusFeedMock: vi.fn(),
  // Spec 25: `useAiChatFeed`'s own internals (real `useStorage`/`useMutation`
  // subscription, Zod validation, `sendMessage`) are unit-tested in
  // `hooks/use-ai-chat-feed.test.ts` — mocked here for the same "verify
  // wiring only" reason as `useAiStatusFeedMock` above.
  useAiChatFeedMock: vi.fn(),
  // Spec 37: `useNodeComments`'s own internals (real `useStorage`/
  // `useMutation`/`useSelf` subscription, Zod validation, `sendComment`) are
  // unit-tested in `hooks/use-node-comments.test.tsx` — mocked here for the
  // same "verify wiring only" reason as `useAiChatFeedMock` above.
  useNodeCommentsMock: vi.fn(),
  // `RoomProvider`'s full props (including the new `initialStorage`, which
  // doesn't serialize meaningfully through JSON.stringify since it holds a
  // real `LiveList` instance) — captured via a ref the same way
  // `reactFlowPropsRef` captures `ReactFlow`'s props below.
  roomProviderPropsRef: {
    current: null as { initialStorage?: { messages: unknown; nodeComments: unknown } } | null,
  },
  // "Export as image": `handleExportImage`'s own three real dependencies —
  // mocked for the same "verify wiring, not the library" reason as every
  // other external SDK call in this file.
  getNodesBoundsMock: vi.fn(),
  getViewportForBoundsMock: vi.fn(),
  toPngMock: vi.fn(),
  // Spec 33: `StarterTemplatesModal` (rendered for real by `Canvas`, not
  // mocked out) calls `useCustomTemplates()` directly on mount — mocked here
  // for the same "verify wiring, not the child hook's own internals" reason
  // as `useCanvasAutosaveMock`/`useAiStatusFeedMock`/`useAiChatFeedMock`
  // above, and so this file's shared `fetchMock` (used for `CanvasFlow`'s
  // own `GET /api/projects/[projectId]/canvas` load and the new `POST
  // /api/templates` save call) isn't also polluted by an unrelated
  // `GET /api/templates` list fetch on every render.
  useCustomTemplatesMock: vi.fn(),
}));

vi.mock("@liveblocks/react/suspense", () => ({
  LiveblocksProvider: ({
    children,
    authEndpoint,
  }: {
    children: ReactNode;
    authEndpoint: string;
  }) => (
    <div data-testid="liveblocks-provider" data-auth-endpoint={authEndpoint}>
      {children}
    </div>
  ),
  RoomProvider: (props: {
    children: ReactNode;
    id: string;
    initialPresence: unknown;
    initialStorage?: { messages: unknown; nodeComments: unknown };
  }) => {
    roomProviderPropsRef.current = props;
    return (
      <div
        data-testid="room-provider"
        data-room-id={props.id}
        data-initial-presence={JSON.stringify(props.initialPresence)}
      >
        {props.children}
      </div>
    );
  },
  ClientSideSuspense: ({ children }: { children: ReactNode }) => <>{children}</>,
  useErrorListener: (callback: ErrorListenerCallback) => {
    errorListenerRef.current = callback;
  },
  // Spec 17's four Liveblocks room-history hooks — extending this mock
  // surface the same way spec 16 extended it for `Position`/`MarkerType`.
  useUndo: useUndoMock,
  useRedo: useRedoMock,
  useCanUndo: useCanUndoMock,
  useCanRedo: useCanRedoMock,
  // Spec 18's bugfix round: `useRoom()` gives `handleImportTemplate` a real
  // `room.batch(...)` to coalesce its three mutations into one commit.
  useRoom: useRoomMock,
  // Spec 19: `updateMyPresence` (`CanvasFlow`'s own pane-mouse-move/-leave
  // handlers) and the presence hooks `PresenceAvatars`/`LiveCursors` read
  // from directly — both real components render here, not mocked out, so
  // this module's mock surface needs to cover what they call too.
  useUpdateMyPresence: useUpdateMyPresenceMock,
  useOthers: useOthersMock,
  useOthersConnectionIds: useOthersConnectionIdsMock,
  useOther: useOtherMock,
  shallow: vi.fn(),
}));

vi.mock("@liveblocks/react-flow", () => ({
  useLiveblocksFlow: useLiveblocksFlowMock,
}));

vi.mock("@/hooks/use-canvas-autosave", () => ({
  useCanvasAutosave: useCanvasAutosaveMock,
}));

vi.mock("@/hooks/use-ai-status-feed", () => ({
  useAiStatusFeed: useAiStatusFeedMock,
}));

vi.mock("@/hooks/use-ai-chat-feed", () => ({
  useAiChatFeed: useAiChatFeedMock,
}));

vi.mock("@/hooks/use-node-comments", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-node-comments")>(
    "@/hooks/use-node-comments",
  );
  return {
    ...actual,
    useNodeComments: useNodeCommentsMock,
  };
});

vi.mock("@clerk/nextjs", () => ({
  useUser: useUserMock,
  UserButton: (props: Record<string, unknown>) => (
    <div data-testid="user-button" data-appearance={JSON.stringify(props.appearance)} />
  ),
}));

vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReactFlow: () => ({
    screenToFlowPosition: screenToFlowPositionMock,
    flowToScreenPosition: flowToScreenPositionMock,
    zoomIn: zoomInMock,
    zoomOut: zoomOutMock,
    fitView: fitViewMock,
    setCenter: setCenterMock,
  }),
  // `LiveCursors` (spec 19) also calls this directly — a no-op reactive
  // return is enough here since this suite doesn't test pan/zoom behavior.
  useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  ReactFlow: (props: CapturedReactFlowProps & {
    children: ReactNode;
    nodes: unknown[];
    edges: unknown[];
    connectionMode: string;
    fitView: boolean;
  }) => {
    reactFlowPropsRef.current = props;
    return (
      <div
        data-testid="react-flow"
        data-nodes-count={props.nodes.length}
        data-edges-count={props.edges.length}
        data-connection-mode={props.connectionMode}
        data-fit-view={String(props.fitView)}
      >
        {/*
          A real `.react-flow__viewport` node so `handleExportImage`'s
          `container.querySelector(".react-flow__viewport")` lookup has
          something to find — the same class name `@xyflow/react`'s own
          real renderer uses for the transformed layer nodes/edges paint
          inside, per that handler's own docblock in `canvas.tsx`.
        */}
        <div className="react-flow__viewport">{props.children}</div>
      </div>
    );
  },
  Background: ({ variant }: { variant: string }) => <div data-testid="background" data-variant={variant} />,
  BackgroundVariant: { Lines: "lines", Dots: "dots", Cross: "cross" },
  ConnectionMode: { Strict: "strict", Loose: "loose" },
  // `canvas-node.tsx`/`canvas.tsx` reference `Position.*`/`MarkerType.*` at
  // module scope (building `CONNECTION_HANDLES`/`DEFAULT_EDGE_OPTIONS`), so
  // importing `Canvas` in this test dereferences them even though
  // `CanvasNode`/`CanvasEdge` themselves never actually render here (this
  // mock replaces `ReactFlow` with a passthrough that only renders its
  // `children` prop, not `nodeTypes`/`edgeTypes`).
  Position: { Top: "top", Right: "right", Bottom: "bottom", Left: "left" },
  MarkerType: { Arrow: "arrow", ArrowClosed: "arrowclosed" },
  getNodesBounds: getNodesBoundsMock,
  getViewportForBounds: getViewportForBoundsMock,
}));

vi.mock("html-to-image", () => ({
  toPng: toPngMock,
}));

vi.mock("@/hooks/use-custom-templates", () => ({
  useCustomTemplates: useCustomTemplatesMock,
}));

const onNodesChange = vi.fn();
const onEdgesChange = vi.fn();
const onConnect = vi.fn();

/**
 * Every existing test in this file predates spec 18's `isTemplatesModalOpen`/
 * `setIsTemplatesModalOpen` props — this helper supplies safe defaults
 * (modal closed, a fresh spy setter) so those tests don't each need
 * updating, while spec 18's own tests can override either prop directly.
 */
function renderCanvas(overrides: Partial<Parameters<typeof Canvas>[0]> = {}) {
  const props = {
    roomId: "project-123",
    isTemplatesModalOpen: false,
    setIsTemplatesModalOpen: vi.fn(),
    onSaveStatusChange: vi.fn(),
    onAiStatusChange: vi.fn(),
    onChatMessagesChange: vi.fn(),
    onSendChatMessageChange: vi.fn(),
    onSendAgentMessageChange: vi.fn(),
    onCanvasGraphChange: vi.fn(),
    ...overrides,
  };
  render(<Canvas {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  errorListenerRef.current = null;
  reactFlowPropsRef.current = null;
  useLiveblocksFlowMock.mockReturnValue({
    nodes: [],
    edges: [],
    onNodesChange,
    onEdgesChange,
    onConnect,
    onDelete: onDeleteMock,
  });
  useUndoMock.mockReturnValue(vi.fn());
  useRedoMock.mockReturnValue(vi.fn());
  useCanUndoMock.mockReturnValue(true);
  useCanRedoMock.mockReturnValue(true);
  useRoomMock.mockReturnValue({ batch: roomBatchMock });
  // Spec 19 defaults: no collaborators/cursors, a signed-in current user —
  // individual tests override these to exercise PresenceAvatars/LiveCursors.
  useUpdateMyPresenceMock.mockReturnValue(updateMyPresenceMock);
  useOthersMock.mockImplementation((selector: (others: unknown[]) => unknown) => selector([]));
  useOthersConnectionIdsMock.mockReturnValue([]);
  useOtherMock.mockReturnValue(undefined);
  useUserMock.mockReturnValue({ user: { id: "current-test-user" } });

  // Spec 21 defaults: no autosave status to report, and a GET
  // `.../canvas` that resolves as "no saved canvas yet" — individual tests
  // override this to exercise the load/skip/error branches.
  useCanvasAutosaveMock.mockReturnValue("idle");
  fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);

  // Spec 24 default: no ai-status-feed message observed yet this session —
  // individual tests override this to exercise the push-up wiring.
  useAiStatusFeedMock.mockReturnValue(null);

  // Spec 25/26 default: no chat messages yet, fresh sendMessage/
  // sendAgentMessage spies — individual tests override this to exercise the
  // bidirectional wiring.
  useAiChatFeedMock.mockReturnValue({ messages: [], sendMessage: vi.fn(), sendAgentMessage: vi.fn() });

  // Spec 37 default: no node comments yet, a fresh sendComment spy —
  // individual tests override this to exercise the wiring.
  useNodeCommentsMock.mockReturnValue({ comments: [], sendComment: vi.fn() });
  roomProviderPropsRef.current = null;

  // "Export as image" defaults: an arbitrary real-looking bounds/viewport
  // and a resolved data URL — individual tests override these where the
  // exact values matter.
  getNodesBoundsMock.mockReturnValue({ x: 0, y: 0, width: 200, height: 100 });
  getViewportForBoundsMock.mockReturnValue({ x: 0, y: 0, zoom: 1 });
  toPngMock.mockResolvedValue("data:image/png;base64,fake");

  // Spec 33 default: no saved templates, nothing in flight — individual
  // tests override where the "My Templates" section's own rendering matters
  // (covered directly in `starter-templates-modal.test.tsx`, not re-proven
  // here).
  useCustomTemplatesMock.mockReturnValue({
    templates: [],
    isLoading: false,
    error: null,
    removingId: null,
    refetch: vi.fn(),
    remove: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Canvas", () => {
  it("connects LiveblocksProvider/RoomProvider to the given room with the full Presence shape", () => {
    renderCanvas();

    expect(screen.getByTestId("liveblocks-provider")).toHaveAttribute(
      "data-auth-endpoint",
      "/api/liveblocks-auth",
    );
    const roomProvider = screen.getByTestId("room-provider");
    expect(roomProvider).toHaveAttribute("data-room-id", "project-123");
    expect(JSON.parse(roomProvider.getAttribute("data-initial-presence") ?? "{}")).toEqual({
      cursor: null,
      thinking: false,
    });
  });

  it("wires useLiveblocksFlow's synced state into ReactFlow with loose connections, fitView, and a dot background", () => {
    renderCanvas();

    expect(useLiveblocksFlowMock).toHaveBeenCalledWith({
      suspense: true,
      nodes: { initial: [] },
      edges: { initial: [] },
    });

    const reactFlow = screen.getByTestId("react-flow");
    expect(reactFlow).toHaveAttribute("data-connection-mode", "loose");
    expect(reactFlow).toHaveAttribute("data-fit-view", "true");
    expect(reactFlow).toHaveAttribute("data-nodes-count", "0");
    expect(reactFlow).toHaveAttribute("data-edges-count", "0");
    expect(screen.getByTestId("background")).toHaveAttribute("data-variant", "dots");
  });

  it("no longer renders a MiniMap anywhere on the canvas", () => {
    renderCanvas();

    expect(screen.queryByTestId("minimap")).not.toBeInTheDocument();
  });

  it("shows a connection-error fallback instead of the canvas when a ROOM_CONNECTION_ERROR is reported", () => {
    renderCanvas();

    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    expect(errorListenerRef.current).not.toBeNull();

    act(() => {
      errorListenerRef.current?.({ context: { type: "ROOM_CONNECTION_ERROR" } });
    });

    expect(screen.queryByTestId("react-flow")).not.toBeInTheDocument();
    expect(screen.getByText(/unable to connect to the canvas/i)).toBeInTheDocument();
  });

  it("ignores non-connection errors and keeps rendering the canvas", () => {
    renderCanvas();

    act(() => {
      errorListenerRef.current?.({ context: { type: "CREATE_THREAD_ERROR" } });
    });

    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    expect(screen.queryByText(/unable to connect to the canvas/i)).not.toBeInTheDocument();
  });

  it("renders the floating shape panel within the canvas's relative wrapper", () => {
    renderCanvas();

    // 6 shape-panel buttons (rectangle, diamond, circle, pill, cylinder,
    // hexagon) plus the 5 control-bar buttons (zoom out, fit view, zoom in,
    // undo, redo) added in spec 17, plus the export-as-image button, plus
    // the save-as-template button (spec 33), plus the search button (spec 36).
    expect(screen.getAllByRole("button")).toHaveLength(14);
  });

  it("renders the canvas control bar wired to the real React Flow zoom methods and Liveblocks history hooks", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    useUndoMock.mockReturnValue(undo);
    useRedoMock.mockReturnValue(redo);
    useCanUndoMock.mockReturnValue(false);
    useCanRedoMock.mockReturnValue(true);

    renderCanvas();

    const zoomInButton = screen.getByRole("button", { name: /zoom in/i });
    const zoomOutButton = screen.getByRole("button", { name: /zoom out/i });
    const fitViewButton = screen.getByRole("button", { name: /fit view/i });
    const undoButton = screen.getByRole("button", { name: /undo/i });
    const redoButton = screen.getByRole("button", { name: /redo/i });

    fireEvent.click(zoomInButton);
    fireEvent.click(zoomOutButton);
    fireEvent.click(fitViewButton);
    expect(zoomInMock).toHaveBeenCalledWith({ duration: expect.any(Number) });
    expect(zoomOutMock).toHaveBeenCalledWith({ duration: expect.any(Number) });
    expect(fitViewMock).toHaveBeenCalledWith({ duration: expect.any(Number) });

    // canUndo is false, canRedo is true.
    expect(undoButton).toBeDisabled();
    expect(redoButton).not.toBeDisabled();

    fireEvent.click(redoButton);
    expect(redo).toHaveBeenCalledTimes(1);
    fireEvent.click(undoButton);
    expect(undo).not.toHaveBeenCalled();
  });

  describe("export as image", () => {
    const sampleNode = {
      id: "node-1",
      type: CANVAS_NODE_TYPE,
      position: { x: 10, y: 20 },
      width: 160,
      height: 80,
      data: { label: "Service", color: DEFAULT_NODE_COLOR, textColor: "#ffffff", shape: "rectangle" },
    };

    it("disables the export button when the canvas has no nodes", () => {
      renderCanvas();

      expect(screen.getByRole("button", { name: /export as image/i })).toBeDisabled();
    });

    it("computes bounds/viewport from the real nodes and downloads a PNG when clicked", async () => {
      useLiveblocksFlowMock.mockReturnValue({
        nodes: [sampleNode],
        edges: [],
        onNodesChange,
        onEdgesChange,
        onConnect,
        onDelete: onDeleteMock,
      });
      getNodesBoundsMock.mockReturnValue({ x: 0, y: 0, width: 160, height: 80 });
      getViewportForBoundsMock.mockReturnValue({ x: 5, y: 7, zoom: 1 });
      toPngMock.mockResolvedValue("data:image/png;base64,fake");
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      renderCanvas({ roomId: "project-abc" });

      const exportButton = screen.getByRole("button", { name: /export as image/i });
      expect(exportButton).not.toBeDisabled();

      await act(async () => {
        fireEvent.click(exportButton);
      });

      expect(getNodesBoundsMock).toHaveBeenCalledWith([sampleNode]);
      // 48px padding (`EXPORT_IMAGE_PADDING_PX`) on every side of the 160x80 bounds.
      expect(getViewportForBoundsMock).toHaveBeenCalledWith(
        { x: 0, y: 0, width: 160, height: 80 },
        256,
        176,
        1,
        1,
        0,
      );

      expect(toPngMock).toHaveBeenCalledTimes(1);
      const [viewportElement, options] = toPngMock.mock.calls[0] as [HTMLElement, Record<string, unknown>];
      expect(viewportElement.className).toBe("react-flow__viewport");
      expect(options).toMatchObject({
        width: 256,
        height: 176,
        style: {
          width: "256px",
          height: "176px",
          transform: "translate(5px, 7px) scale(1)",
        },
      });

      expect(clickSpy).toHaveBeenCalledTimes(1);
      const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
      expect(anchor.download).toBe("ghost-ai-canvas-project-abc.png");
      expect(anchor.href).toBe("data:image/png;base64,fake");

      clickSpy.mockRestore();
    });

    it("shows a spinner and disables the button while an export is in flight", async () => {
      useLiveblocksFlowMock.mockReturnValue({
        nodes: [sampleNode],
        edges: [],
        onNodesChange,
        onEdgesChange,
        onConnect,
        onDelete: onDeleteMock,
      });
      let resolveToPng!: (dataUrl: string) => void;
      toPngMock.mockReturnValue(
        new Promise<string>((resolve) => {
          resolveToPng = resolve;
        }),
      );
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      renderCanvas();

      const exportButton = screen.getByRole("button", { name: /export as image/i });
      fireEvent.click(exportButton);

      await waitFor(() => expect(exportButton).toBeDisabled());

      await act(async () => {
        resolveToPng("data:image/png;base64,fake");
      });

      await waitFor(() => expect(exportButton).not.toBeDisabled());
    });
  });

  describe("save as template (spec 33)", () => {
    it("does not render the save-template dialog until the control bar button is clicked", () => {
      renderCanvas();

      expect(screen.queryByText(/save the current canvas as a private/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /save as template/i }));

      expect(screen.getByText(/save the current canvas as a private/i)).toBeInTheDocument();
    });

    it("POSTs the current live nodes/edges to /api/templates and closes the dialog on success", async () => {
      const sampleNode = {
        id: "node-1",
        type: CANVAS_NODE_TYPE,
        position: { x: 10, y: 20 },
        width: 160,
        height: 80,
        data: { label: "Service", color: DEFAULT_NODE_COLOR, textColor: "#ffffff", shape: "rectangle" },
      };
      useLiveblocksFlowMock.mockReturnValue({
        nodes: [sampleNode],
        edges: [],
        onNodesChange,
        onEdgesChange,
        onConnect,
        onDelete: onDeleteMock,
      });
      fetchMock.mockImplementation((url: string) => {
        if (url === "/api/templates") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ template: { id: "t1", name: "My saved design", description: "", createdAt: "2026-01-01T00:00:00.000Z" } }),
          });
        }
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      });

      renderCanvas();

      fireEvent.click(screen.getByRole("button", { name: /save as template/i }));
      fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "My saved design" } });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^save template$/i }));
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/templates",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "My saved design", description: undefined, nodes: [sampleNode], edges: [] }),
        }),
      );

      await waitFor(() =>
        expect(screen.queryByText(/save the current canvas as a private/i)).not.toBeInTheDocument(),
      );
    });

    it("shows an inline error and keeps the dialog open when the save request fails", async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url === "/api/templates") {
          return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "Failed to save the template." }) });
        }
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      });

      renderCanvas();

      fireEvent.click(screen.getByRole("button", { name: /save as template/i }));
      fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "My saved design" } });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^save template$/i }));
      });

      expect(await screen.findByText("Failed to save the template.")).toBeInTheDocument();
      expect(screen.getByText(/save the current canvas as a private/i)).toBeInTheDocument();
    });
  });

  it("wires the real useKeyboardShortcuts hook to the same zoom/undo/redo handlers as the control bar", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    useUndoMock.mockReturnValue(undo);
    useRedoMock.mockReturnValue(redo);

    renderCanvas();

    fireEvent.keyDown(window, { key: "+" });
    expect(zoomInMock).toHaveBeenCalledWith({ duration: expect.any(Number) });

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it("registers the custom CanvasNode renderer for CANVAS_NODE_TYPE", () => {
    renderCanvas();

    expect(reactFlowPropsRef.current?.nodeTypes).toHaveProperty(CANVAS_NODE_TYPE);
    expect(Object.keys(reactFlowPropsRef.current?.nodeTypes ?? {})).toEqual([CANVAS_NODE_TYPE]);
  });

  it("registers the custom CanvasEdge renderer for CANVAS_EDGE_TYPE and defaults new edges to it with an arrow marker", () => {
    renderCanvas();

    expect(reactFlowPropsRef.current?.edgeTypes).toHaveProperty(CANVAS_EDGE_TYPE);
    expect(Object.keys(reactFlowPropsRef.current?.edgeTypes ?? {})).toEqual([CANVAS_EDGE_TYPE]);
    expect(reactFlowPropsRef.current?.defaultEdgeOptions?.type).toBe(CANVAS_EDGE_TYPE);
    expect(reactFlowPropsRef.current?.defaultEdgeOptions?.markerEnd).toBeTruthy();
  });

  it("adds a new node via onNodesChange when a shape is pointer-dragged and released over the canvas pane, converted through screenToFlowPosition", () => {
    renderCanvas();
    screenToFlowPositionMock.mockReturnValue({ x: 42, y: 99 });

    const pane = document.createElement("div");
    pane.className = "react-flow__pane";
    document.body.appendChild(pane);
    // jsdom does not implement `document.elementFromPoint` at all, so it
    // can't be `vi.spyOn`'d — assign it directly. Real browsers always
    // implement it; this is a test-environment gap only.
    const elementFromPointSpy = vi.fn().mockReturnValue(pane);
    document.elementFromPoint = elementFromPointSpy;

    const rectangleButton = screen.getByRole("button", { name: /rectangle/i });
    fireEvent.pointerDown(rectangleButton, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 500, clientY: 600 });

    expect(elementFromPointSpy).toHaveBeenCalledWith(500, 600);
    expect(screenToFlowPositionMock).toHaveBeenCalledWith({ x: 500, y: 600 });
    expect(onNodesChange).toHaveBeenCalledTimes(1);

    const [changes] = onNodesChange.mock.calls[0] as [Array<{ type: string; item: Record<string, unknown> }>];
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe("add");
    expect(changes[0].item).toMatchObject({
      type: CANVAS_NODE_TYPE,
      position: { x: 42, y: 99 },
      width: 160,
      height: 80,
      data: { label: "", color: DEFAULT_NODE_COLOR, shape: "rectangle" },
    });

    elementFromPointSpy.mockRestore();
    pane.remove();
  });

  it("does not add a node when the shape is released outside the canvas pane", () => {
    renderCanvas();

    const outsideElement = document.createElement("div");
    document.body.appendChild(outsideElement);
    const elementFromPointSpy = vi.fn().mockReturnValue(outsideElement);
    document.elementFromPoint = elementFromPointSpy;

    const rectangleButton = screen.getByRole("button", { name: /rectangle/i });
    fireEvent.pointerDown(rectangleButton, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 0, clientY: 0 });

    expect(onNodesChange).not.toHaveBeenCalled();

    elementFromPointSpy.mockRestore();
    outsideElement.remove();
  });

  describe("starter templates import (spec 18)", () => {
    it("does not render the starter templates modal when isTemplatesModalOpen is false", () => {
      renderCanvas({ isTemplatesModalOpen: false });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders the starter templates modal, with one card per CANVAS_TEMPLATES entry, when isTemplatesModalOpen is true", () => {
      renderCanvas({ isTemplatesModalOpen: true });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /import/i })).toHaveLength(CANVAS_TEMPLATES.length);
    });

    it("clearing then adding: clicking Import calls onDelete with the current nodes/edges and onNodesChange/onEdgesChange with one 'add' change per template item", () => {
      const existingNode = {
        id: "existing-node",
        type: CANVAS_NODE_TYPE,
        position: { x: 0, y: 0 },
        width: 160,
        height: 80,
        data: { label: "Existing", color: DEFAULT_NODE_COLOR, textColor: "#EDEDED", shape: "rectangle" },
      };
      const existingEdge = { id: "existing-edge", type: CANVAS_EDGE_TYPE, source: "a", target: "b", data: {} };
      useLiveblocksFlowMock.mockReturnValue({
        nodes: [existingNode],
        edges: [existingEdge],
        onNodesChange,
        onEdgesChange,
        onConnect,
        onDelete: onDeleteMock,
      });

      renderCanvas({ isTemplatesModalOpen: true });

      const target = CANVAS_TEMPLATES[0];
      const importButtons = screen.getAllByRole("button", { name: /import/i });
      fireEvent.click(importButtons[0]);

      // Removal goes through `onDelete` (see canvas.tsx's docblock — the
      // brief's literal `{ type: "remove" }` NodeChange/EdgeChange sketch is
      // a verified no-op in the installed `@liveblocks/react-flow` version).
      expect(onDeleteMock).toHaveBeenCalledTimes(1);
      expect(onDeleteMock).toHaveBeenCalledWith({ nodes: [existingNode], edges: [existingEdge] });

      expect(onNodesChange).toHaveBeenCalledTimes(1);
      const [nodeChanges] = onNodesChange.mock.calls[0] as [Array<{ type: string; item: unknown }>];
      expect(nodeChanges).toHaveLength(target.nodes.length);
      expect(nodeChanges.every((change) => change.type === "add")).toBe(true);
      expect(nodeChanges.map((change) => change.item)).toEqual(target.nodes);

      expect(onEdgesChange).toHaveBeenCalledTimes(1);
      const [edgeChanges] = onEdgesChange.mock.calls[0] as [Array<{ type: string; item: unknown }>];
      expect(edgeChanges).toHaveLength(target.edges.length);
      expect(edgeChanges.every((change) => change.type === "add")).toBe(true);
      expect(edgeChanges.map((change) => change.item)).toEqual(target.edges);
    });

    it("bugfix round: wraps onDelete/onNodesChange/onEdgesChange in a single room.batch(...) call so collaborators don't see a transient empty-canvas frame", () => {
      renderCanvas({ isTemplatesModalOpen: true });

      const importButtons = screen.getAllByRole("button", { name: /import/i });
      fireEvent.click(importButtons[0]);

      expect(roomBatchMock).toHaveBeenCalledTimes(1);

      // All three mutations must run *inside* the batch callback (i.e. after
      // room.batch was invoked), not before it — otherwise they wouldn't
      // actually be coalesced into the same batch.
      const batchCallOrder = roomBatchMock.mock.invocationCallOrder[0];
      expect(onDeleteMock.mock.invocationCallOrder[0]).toBeGreaterThan(batchCallOrder);
      expect(onNodesChange.mock.invocationCallOrder[0]).toBeGreaterThan(batchCallOrder);
      expect(onEdgesChange.mock.invocationCallOrder[0]).toBeGreaterThan(batchCallOrder);
    });

    it("calls fitView after importing a template", () => {
      renderCanvas({ isTemplatesModalOpen: true });

      const importButtons = screen.getAllByRole("button", { name: /import/i });
      fireEvent.click(importButtons[0]);

      expect(fitViewMock).toHaveBeenCalledWith({ duration: expect.any(Number) });
    });

    it("closes the modal via setIsTemplatesModalOpen after importing a template", () => {
      const setIsTemplatesModalOpen = vi.fn();
      renderCanvas({ isTemplatesModalOpen: true, setIsTemplatesModalOpen });

      const importButtons = screen.getAllByRole("button", { name: /import/i });
      fireEvent.click(importButtons[0]);

      expect(setIsTemplatesModalOpen).toHaveBeenCalledWith(false);
    });
  });

  describe("presence avatars and cursor (spec 19)", () => {
    it("broadcasts the pane pointer position into Presence via onPaneMouseMove, converted through screenToFlowPosition", () => {
      screenToFlowPositionMock.mockReturnValue({ x: 42, y: 99 });
      renderCanvas();

      reactFlowPropsRef.current?.onPaneMouseMove?.({ clientX: 500, clientY: 600 });

      expect(screenToFlowPositionMock).toHaveBeenCalledWith({ x: 500, y: 600 });
      expect(updateMyPresenceMock).toHaveBeenCalledWith({ cursor: { x: 42, y: 99 } });
    });

    it("clears the cursor to null via onPaneMouseLeave", () => {
      renderCanvas();

      reactFlowPropsRef.current?.onPaneMouseLeave?.();

      expect(updateMyPresenceMock).toHaveBeenCalledWith({ cursor: null });
    });

    it("renders PresenceAvatars (the Clerk UserButton) as a sibling of ReactFlow", () => {
      renderCanvas();

      expect(screen.getByTestId("user-button")).toBeInTheDocument();
    });

    it("renders LiveCursors as a sibling of ReactFlow, converting a collaborator's stored cursor via flowToScreenPosition", () => {
      useOthersConnectionIdsMock.mockReturnValue([2]);
      useOtherMock.mockReturnValue({
        id: "other-user",
        name: "Other Person",
        color: "#6457F9",
        cursor: { x: 10, y: 20 },
      });
      flowToScreenPositionMock.mockReturnValue({ x: 111, y: 222 });

      renderCanvas();

      expect(flowToScreenPositionMock).toHaveBeenCalledWith({ x: 10, y: 20 });
      expect(screen.getByText("Other Person")).toBeInTheDocument();
    });
  });

  describe("canvas autosave (spec 21)", () => {
    const existingNode = {
      id: "existing-node",
      type: CANVAS_NODE_TYPE,
      position: { x: 0, y: 0 },
      width: 160,
      height: 80,
      data: { label: "Existing", color: DEFAULT_NODE_COLOR, textColor: "#EDEDED", shape: "rectangle" },
    };
    const existingEdge = { id: "existing-edge", type: CANVAS_EDGE_TYPE, source: "a", target: "b", data: {} };

    it("skips loading entirely when the room already has existing nodes", async () => {
      useLiveblocksFlowMock.mockReturnValue({
        nodes: [existingNode],
        edges: [],
        onNodesChange,
        onEdgesChange,
        onConnect,
        onDelete: onDeleteMock,
      });

      renderCanvas();
      await act(async () => {});

      expect(fetchMock).not.toHaveBeenCalled();
      // Room already has content, so the load-or-skip decision settles
      // synchronously — the autosave hook should be re-invoked with
      // `enabled: true` without ever calling the GET route.
      expect(useCanvasAutosaveMock).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
      );
    });

    it("skips loading entirely when the room already has existing edges (nodes still empty)", async () => {
      useLiveblocksFlowMock.mockReturnValue({
        nodes: [],
        edges: [existingEdge],
        onNodesChange,
        onEdgesChange,
        onConnect,
        onDelete: onDeleteMock,
      });

      renderCanvas();
      await act(async () => {});

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("loads nothing when the project has no saved canvas (GET returns a non-OK response)", async () => {
      renderCanvas();

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-123/canvas");
      });

      expect(onNodesChange).not.toHaveBeenCalled();
      expect(onEdgesChange).not.toHaveBeenCalled();
      expect(roomBatchMock).not.toHaveBeenCalled();
    });

    it("loads a previously-saved snapshot into an empty room via a single room.batch", async () => {
      const savedNode = {
        id: "saved-node",
        type: CANVAS_NODE_TYPE,
        position: { x: 5, y: 5 },
        width: 160,
        height: 80,
        data: { label: "Saved", color: DEFAULT_NODE_COLOR, textColor: "#EDEDED", shape: "rectangle" },
      };
      const savedEdge = { id: "saved-edge", type: CANVAS_EDGE_TYPE, source: "x", target: "y", data: {} };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nodes: [savedNode], edges: [savedEdge] }),
      });

      renderCanvas();

      await waitFor(() => {
        expect(onNodesChange).toHaveBeenCalled();
      });

      expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-123/canvas");
      expect(roomBatchMock).toHaveBeenCalled();

      const [nodeChanges] = onNodesChange.mock.calls[0] as [Array<{ type: string; item: unknown }>];
      expect(nodeChanges).toEqual([{ type: "add", item: savedNode }]);

      const [edgeChanges] = onEdgesChange.mock.calls[0] as [Array<{ type: string; item: unknown }>];
      expect(edgeChanges).toEqual([{ type: "add", item: savedEdge }]);

      // Both mutations must run inside the batch, same convention as
      // spec 18's template-import fix.
      const batchCallOrder = roomBatchMock.mock.invocationCallOrder[0];
      expect(onNodesChange.mock.invocationCallOrder[0]).toBeGreaterThan(batchCallOrder);
      expect(onEdgesChange.mock.invocationCallOrder[0]).toBeGreaterThan(batchCallOrder);
    });

    it("treats a malformed GET response body (missing nodes/edges arrays) as nothing to load", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ nodes: "not-an-array" }) });

      renderCanvas();

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-123/canvas");
      });

      expect(onNodesChange).not.toHaveBeenCalled();
      expect(onEdgesChange).not.toHaveBeenCalled();
    });

    it("wires useCanvasAutosave with the room's projectId/nodes/edges", () => {
      renderCanvas({ roomId: "project-abc" });

      expect(useCanvasAutosaveMock).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "project-abc", nodes: [], edges: [] }),
      );
    });

    it("pushes useCanvasAutosave's returned status up via onSaveStatusChange", () => {
      useCanvasAutosaveMock.mockReturnValue("saved");
      const onSaveStatusChange = vi.fn();

      renderCanvas({ onSaveStatusChange });

      expect(onSaveStatusChange).toHaveBeenCalledWith("saved");
    });
  });

  describe("ai presence state (spec 24)", () => {
    it("calls useAiStatusFeed (subscribed inside the room boundary) and pushes null up by default", () => {
      const onAiStatusChange = vi.fn();

      renderCanvas({ onAiStatusChange });

      expect(useAiStatusFeedMock).toHaveBeenCalled();
      expect(onAiStatusChange).toHaveBeenCalledWith(null);
    });

    it("pushes useAiStatusFeed's returned message up via onAiStatusChange", () => {
      useAiStatusFeedMock.mockReturnValue({ stage: "processing", text: "Designing your system…" });
      const onAiStatusChange = vi.fn();

      renderCanvas({ onAiStatusChange });

      expect(onAiStatusChange).toHaveBeenCalledWith({ stage: "processing", text: "Designing your system…" });
    });
  });

  describe("ai chat feed (spec 25)", () => {
    it("initializes RoomProvider's Storage with an empty messages LiveList", () => {
      renderCanvas();

      expect(roomProviderPropsRef.current?.initialStorage?.messages).toBeDefined();
      const messages = roomProviderPropsRef.current?.initialStorage?.messages as { length: number };
      expect(messages.length).toBe(0);
    });

    it("calls useAiChatFeed (subscribed inside the room boundary) and pushes an empty list up by default", () => {
      const onChatMessagesChange = vi.fn();

      renderCanvas({ onChatMessagesChange });

      expect(useAiChatFeedMock).toHaveBeenCalled();
      expect(onChatMessagesChange).toHaveBeenCalledWith([]);
    });

    it("pushes useAiChatFeed's returned messages up via onChatMessagesChange", () => {
      const messages = [
        { id: "1", sender: "Ada", role: "user" as const, content: "Hello", timestamp: 1 },
      ];
      useAiChatFeedMock.mockReturnValue({ messages, sendMessage: vi.fn(), sendAgentMessage: vi.fn() });
      const onChatMessagesChange = vi.fn();

      renderCanvas({ onChatMessagesChange });

      expect(onChatMessagesChange).toHaveBeenCalledWith(messages);
    });

    it("pushes useAiChatFeed's returned sendMessage function down via onSendChatMessageChange", () => {
      const sendMessage = vi.fn();
      useAiChatFeedMock.mockReturnValue({ messages: [], sendMessage, sendAgentMessage: vi.fn() });
      const onSendChatMessageChange = vi.fn();

      renderCanvas({ onSendChatMessageChange });

      expect(onSendChatMessageChange).toHaveBeenCalledWith(sendMessage);
    });

    it("pushes useAiChatFeed's returned sendAgentMessage function down via onSendAgentMessageChange (spec 26)", () => {
      const sendAgentMessage = vi.fn();
      useAiChatFeedMock.mockReturnValue({ messages: [], sendMessage: vi.fn(), sendAgentMessage });
      const onSendAgentMessageChange = vi.fn();

      renderCanvas({ onSendAgentMessageChange });

      expect(onSendAgentMessageChange).toHaveBeenCalledWith(sendAgentMessage);
    });
  });

  describe("node comments (spec 37)", () => {
    it("initializes RoomProvider's Storage with an empty nodeComments LiveList", () => {
      renderCanvas();

      expect(roomProviderPropsRef.current?.initialStorage?.nodeComments).toBeDefined();
      const nodeComments = roomProviderPropsRef.current?.initialStorage?.nodeComments as {
        length: number;
      };
      expect(nodeComments.length).toBe(0);
    });

    it("calls useNodeComments (subscribed inside the room boundary)", () => {
      renderCanvas();

      expect(useNodeCommentsMock).toHaveBeenCalled();
    });
  });

  describe("canvas graph push-up (spec 30)", () => {
    it("pushes useLiveblocksFlow's returned nodes/edges up via onCanvasGraphChange by default (both empty)", () => {
      const onCanvasGraphChange = vi.fn();

      renderCanvas({ onCanvasGraphChange });

      expect(onCanvasGraphChange).toHaveBeenCalledWith([], []);
    });

    it("pushes the room's real nodes/edges up via onCanvasGraphChange", () => {
      const nodes = [
        {
          id: "n1",
          type: CANVAS_NODE_TYPE,
          position: { x: 10, y: 20 },
          data: { label: "API", color: DEFAULT_NODE_COLOR, textColor: "#EDEDED", shape: "rectangle" as const },
        },
      ];
      const edges = [
        { id: "e1", type: CANVAS_EDGE_TYPE, source: "n1", target: "n2", data: { label: "calls" } },
      ];
      useLiveblocksFlowMock.mockReturnValue({
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        onDelete: onDeleteMock,
      });
      const onCanvasGraphChange = vi.fn();

      renderCanvas({ onCanvasGraphChange });

      expect(onCanvasGraphChange).toHaveBeenCalledWith(nodes, edges);
    });
  });

  describe("canvas node search (spec 36)", () => {
    const searchNode = {
      id: "search-node-1",
      type: CANVAS_NODE_TYPE,
      position: { x: 100, y: 200 },
      width: 160,
      height: 80,
      data: { label: "API Gateway", color: DEFAULT_NODE_COLOR, textColor: "#EDEDED", shape: "rectangle" as const },
    };

    beforeEach(() => {
      useLiveblocksFlowMock.mockReturnValue({
        nodes: [searchNode],
        edges: [],
        onNodesChange,
        onEdgesChange,
        onConnect,
        onDelete: onDeleteMock,
      });
    });

    it("jumps the viewport via setCenter, computed from getNodesBounds([node]), when a search result is selected", () => {
      getNodesBoundsMock.mockReturnValue({ x: 100, y: 200, width: 160, height: 80 });

      renderCanvas();

      fireEvent.click(screen.getByRole("button", { name: /search nodes/i }));
      fireEvent.change(screen.getByPlaceholderText(/search nodes by label/i), {
        target: { value: "API" },
      });
      fireEvent.click(screen.getByRole("button", { name: "API Gateway" }));

      expect(getNodesBoundsMock).toHaveBeenCalledWith([searchNode]);
      // center = { x: 100 + 160/2, y: 200 + 80/2 } = { x: 180, y: 240 }
      expect(setCenterMock).toHaveBeenCalledWith(180, 240, { zoom: 1, duration: expect.any(Number) });
    });

    it("closes the search popover after selecting a result", () => {
      getNodesBoundsMock.mockReturnValue({ x: 100, y: 200, width: 160, height: 80 });

      renderCanvas();

      fireEvent.click(screen.getByRole("button", { name: /search nodes/i }));
      fireEvent.change(screen.getByPlaceholderText(/search nodes by label/i), {
        target: { value: "API" },
      });
      fireEvent.click(screen.getByRole("button", { name: "API Gateway" }));

      expect(screen.queryByPlaceholderText(/search nodes by label/i)).not.toBeInTheDocument();
    });

    it("does not throw when two searches are selected in rapid succession (clears the previous highlight timeout)", () => {
      getNodesBoundsMock.mockReturnValue({ x: 100, y: 200, width: 160, height: 80 });

      renderCanvas();

      expect(() => {
        fireEvent.click(screen.getByRole("button", { name: /search nodes/i }));
        fireEvent.change(screen.getByPlaceholderText(/search nodes by label/i), {
          target: { value: "API" },
        });
        fireEvent.click(screen.getByRole("button", { name: "API Gateway" }));

        fireEvent.click(screen.getByRole("button", { name: /search nodes/i }));
        fireEvent.change(screen.getByPlaceholderText(/search nodes by label/i), {
          target: { value: "API" },
        });
        fireEvent.click(screen.getByRole("button", { name: "API Gateway" }));
      }).not.toThrow();

      expect(setCenterMock).toHaveBeenCalledTimes(2);
    });
  });
});
