// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Canvas } from "./canvas";
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
};

const {
  errorListenerRef,
  useLiveblocksFlowMock,
  screenToFlowPositionMock,
  zoomInMock,
  zoomOutMock,
  fitViewMock,
  useUndoMock,
  useRedoMock,
  useCanUndoMock,
  useCanRedoMock,
  reactFlowPropsRef,
} = vi.hoisted(() => ({
  errorListenerRef: { current: null as ErrorListenerCallback | null },
  useLiveblocksFlowMock: vi.fn(),
  screenToFlowPositionMock: vi.fn(),
  zoomInMock: vi.fn(),
  zoomOutMock: vi.fn(),
  fitViewMock: vi.fn(),
  useUndoMock: vi.fn(),
  useRedoMock: vi.fn(),
  useCanUndoMock: vi.fn(),
  useCanRedoMock: vi.fn(),
  reactFlowPropsRef: { current: null as CapturedReactFlowProps | null },
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
  RoomProvider: ({
    children,
    id,
    initialPresence,
  }: {
    children: ReactNode;
    id: string;
    initialPresence: unknown;
  }) => (
    <div data-testid="room-provider" data-room-id={id} data-initial-presence={JSON.stringify(initialPresence)}>
      {children}
    </div>
  ),
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
}));

vi.mock("@liveblocks/react-flow", () => ({
  useLiveblocksFlow: useLiveblocksFlowMock,
}));

vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReactFlow: () => ({
    screenToFlowPosition: screenToFlowPositionMock,
    zoomIn: zoomInMock,
    zoomOut: zoomOutMock,
    fitView: fitViewMock,
  }),
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
        {props.children}
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
}));

const onNodesChange = vi.fn();
const onEdgesChange = vi.fn();
const onConnect = vi.fn();

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
  });
  useUndoMock.mockReturnValue(vi.fn());
  useRedoMock.mockReturnValue(vi.fn());
  useCanUndoMock.mockReturnValue(true);
  useCanRedoMock.mockReturnValue(true);
});

describe("Canvas", () => {
  it("connects LiveblocksProvider/RoomProvider to the given room with the full Presence shape", () => {
    render(<Canvas roomId="project-123" />);

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
    render(<Canvas roomId="project-123" />);

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
    render(<Canvas roomId="project-123" />);

    expect(screen.queryByTestId("minimap")).not.toBeInTheDocument();
  });

  it("shows a connection-error fallback instead of the canvas when a ROOM_CONNECTION_ERROR is reported", () => {
    render(<Canvas roomId="project-123" />);

    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    expect(errorListenerRef.current).not.toBeNull();

    act(() => {
      errorListenerRef.current?.({ context: { type: "ROOM_CONNECTION_ERROR" } });
    });

    expect(screen.queryByTestId("react-flow")).not.toBeInTheDocument();
    expect(screen.getByText(/unable to connect to the canvas/i)).toBeInTheDocument();
  });

  it("ignores non-connection errors and keeps rendering the canvas", () => {
    render(<Canvas roomId="project-123" />);

    act(() => {
      errorListenerRef.current?.({ context: { type: "CREATE_THREAD_ERROR" } });
    });

    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    expect(screen.queryByText(/unable to connect to the canvas/i)).not.toBeInTheDocument();
  });

  it("renders the floating shape panel within the canvas's relative wrapper", () => {
    render(<Canvas roomId="project-123" />);

    // 6 shape-panel buttons (rectangle, diamond, circle, pill, cylinder,
    // hexagon) plus the 5 control-bar buttons (zoom out, fit view, zoom in,
    // undo, redo) added in spec 17.
    expect(screen.getAllByRole("button")).toHaveLength(11);
  });

  it("renders the canvas control bar wired to the real React Flow zoom methods and Liveblocks history hooks", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    useUndoMock.mockReturnValue(undo);
    useRedoMock.mockReturnValue(redo);
    useCanUndoMock.mockReturnValue(false);
    useCanRedoMock.mockReturnValue(true);

    render(<Canvas roomId="project-123" />);

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

  it("wires the real useKeyboardShortcuts hook to the same zoom/undo/redo handlers as the control bar", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    useUndoMock.mockReturnValue(undo);
    useRedoMock.mockReturnValue(redo);

    render(<Canvas roomId="project-123" />);

    fireEvent.keyDown(window, { key: "+" });
    expect(zoomInMock).toHaveBeenCalledWith({ duration: expect.any(Number) });

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it("registers the custom CanvasNode renderer for CANVAS_NODE_TYPE", () => {
    render(<Canvas roomId="project-123" />);

    expect(reactFlowPropsRef.current?.nodeTypes).toHaveProperty(CANVAS_NODE_TYPE);
    expect(Object.keys(reactFlowPropsRef.current?.nodeTypes ?? {})).toEqual([CANVAS_NODE_TYPE]);
  });

  it("registers the custom CanvasEdge renderer for CANVAS_EDGE_TYPE and defaults new edges to it with an arrow marker", () => {
    render(<Canvas roomId="project-123" />);

    expect(reactFlowPropsRef.current?.edgeTypes).toHaveProperty(CANVAS_EDGE_TYPE);
    expect(Object.keys(reactFlowPropsRef.current?.edgeTypes ?? {})).toEqual([CANVAS_EDGE_TYPE]);
    expect(reactFlowPropsRef.current?.defaultEdgeOptions?.type).toBe(CANVAS_EDGE_TYPE);
    expect(reactFlowPropsRef.current?.defaultEdgeOptions?.markerEnd).toBeTruthy();
  });

  it("adds a new node via onNodesChange when a shape is pointer-dragged and released over the canvas pane, converted through screenToFlowPosition", () => {
    render(<Canvas roomId="project-123" />);
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
    render(<Canvas roomId="project-123" />);

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
});
