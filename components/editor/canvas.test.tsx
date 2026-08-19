// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Canvas } from "./canvas";

// `Canvas` wires together three real Liveblocks/React Flow packages that
// need a live network connection to do anything — this test only verifies
// that `Canvas` wires them together correctly (right room ID, right initial
// presence, synced nodes/edges/handlers reach `ReactFlow`, and the
// connection-error fallback replaces the canvas when `useErrorListener`
// reports a `ROOM_CONNECTION_ERROR`), not that the real SDKs work.
type ErrorListenerCallback = (error: { context: { type: string } }) => void;

const { errorListenerRef, useLiveblocksFlowMock } = vi.hoisted(() => ({
  errorListenerRef: { current: null as ErrorListenerCallback | null },
  useLiveblocksFlowMock: vi.fn(),
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
  ReactFlow: ({
    children,
    nodes,
    edges,
    connectionMode,
    fitView,
  }: {
    children: ReactNode;
    nodes: unknown[];
    edges: unknown[];
    connectionMode: string;
    fitView: boolean;
  }) => (
    <div
      data-testid="react-flow"
      data-nodes-count={nodes.length}
      data-edges-count={edges.length}
      data-connection-mode={connectionMode}
      data-fit-view={String(fitView)}
    >
      {children}
    </div>
  ),
  Background: ({ variant }: { variant: string }) => <div data-testid="background" data-variant={variant} />,
  MiniMap: () => <div data-testid="minimap" />,
  BackgroundVariant: { Lines: "lines", Dots: "dots", Cross: "cross" },
  ConnectionMode: { Strict: "strict", Loose: "loose" },
}));

const onNodesChange = vi.fn();
const onEdgesChange = vi.fn();
const onConnect = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  errorListenerRef.current = null;
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
});
