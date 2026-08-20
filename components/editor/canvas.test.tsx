// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Canvas } from "./canvas";
import { CANVAS_DRAG_MIME_TYPE, serializeShapeDragPayload } from "@/lib/canvas-shapes";
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
  onDragOver?: (event: unknown) => void;
  onDrop?: (event: unknown) => void;
};

const { errorListenerRef, useLiveblocksFlowMock, screenToFlowPositionMock, reactFlowPropsRef } =
  vi.hoisted(() => ({
    errorListenerRef: { current: null as ErrorListenerCallback | null },
    useLiveblocksFlowMock: vi.fn(),
    screenToFlowPositionMock: vi.fn(),
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
}));

vi.mock("@liveblocks/react-flow", () => ({
  useLiveblocksFlow: useLiveblocksFlowMock,
}));

vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReactFlow: () => ({ screenToFlowPosition: screenToFlowPositionMock }),
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
  MiniMap: () => <div data-testid="minimap" />,
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

  it("wires useLiveblocksFlow's synced state into ReactFlow with loose connections, fitView, MiniMap, and a dot background", () => {
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
    expect(screen.getByTestId("minimap")).toBeInTheDocument();
    expect(screen.getByTestId("background")).toHaveAttribute("data-variant", "dots");
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

    // 6 shapes per the spec: rectangle, diamond, circle, pill, cylinder, hexagon.
    expect(screen.getAllByRole("button")).toHaveLength(6);
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

  it("allows a drop when dragover carries the shape MIME type", () => {
    render(<Canvas roomId="project-123" />);

    const preventDefault = vi.fn();
    const dataTransfer = { types: [CANVAS_DRAG_MIME_TYPE], dropEffect: "" };
    reactFlowPropsRef.current?.onDragOver?.({ preventDefault, dataTransfer });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(dataTransfer.dropEffect).toBe("copy");
  });

  it("ignores dragover for a drag that isn't a shape payload", () => {
    render(<Canvas roomId="project-123" />);

    const preventDefault = vi.fn();
    reactFlowPropsRef.current?.onDragOver?.({
      preventDefault,
      dataTransfer: { types: ["text/plain"], dropEffect: "" },
    });

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("adds a new node via onNodesChange at the dropped screen position, converted through screenToFlowPosition", () => {
    render(<Canvas roomId="project-123" />);
    screenToFlowPositionMock.mockReturnValue({ x: 42, y: 99 });

    const preventDefault = vi.fn();
    const raw = serializeShapeDragPayload("rectangle");
    reactFlowPropsRef.current?.onDrop?.({
      preventDefault,
      clientX: 500,
      clientY: 600,
      dataTransfer: { getData: () => raw },
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
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
  });

  it("does not add a node when the dropped payload is missing or malformed", () => {
    render(<Canvas roomId="project-123" />);

    reactFlowPropsRef.current?.onDrop?.({
      preventDefault: vi.fn(),
      clientX: 0,
      clientY: 0,
      dataTransfer: { getData: () => "" },
    });

    expect(onNodesChange).not.toHaveBeenCalled();
  });
});
