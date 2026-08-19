"use client"

import { useCallback, useState, type DragEvent } from "react"
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
} from "@xyflow/react"
import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
  useErrorListener,
} from "@liveblocks/react/suspense"
import { useLiveblocksFlow } from "@liveblocks/react-flow"
import { CanvasNode } from "@/components/editor/canvas-node"
import { ShapePanel } from "@/components/editor/shape-panel"
import { CANVAS_DRAG_MIME_TYPE, createDroppedNode, parseShapeDragPayload } from "@/lib/canvas-shapes"
import { CANVAS_NODE_TYPE, type CanvasEdge, type CanvasNode as CanvasNodeAlias } from "@/types/canvas"
import "@xyflow/react/dist/style.css"
import "@liveblocks/react-flow/styles.css"

/**
 * `nodeTypes` must be a stable reference across renders (React Flow warns
 * and re-renders unnecessarily otherwise) — defined once at module scope
 * rather than inline in `CanvasFlow`.
 */
const CANVAS_NODE_TYPES: NodeTypes = { [CANVAS_NODE_TYPE]: CanvasNode }

interface CanvasProps {
  /** Liveblocks room ID — the current project's ID (spec 10's convention). */
  roomId: string
}

/**
 * Client-side canvas surface: owns the Liveblocks room connection
 * (`LiveblocksProvider`/`RoomProvider`) and the React Flow canvas synced to
 * that room's Storage (`useLiveblocksFlow`). This is the collaborative
 * canvas *foundation* only — no persistence, no custom node/edge visuals,
 * no `Controls` panel, and no AI-generated content (spec 11's Scope Limits).
 */
export function Canvas({ roomId }: CanvasProps) {
  return (
    <div className="relative flex-1 bg-base">
      <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
        <RoomProvider id={roomId} initialPresence={{ cursor: null, thinking: false }}>
          <CanvasRoomBoundary>
            <ClientSideSuspense fallback={<CanvasLoading />}>
              {/*
                `CanvasFlow` calls `useReactFlow()` (for `screenToFlowPosition`
                in the drop handler), which requires an ancestor
                `ReactFlowProvider` — `<ReactFlow>` only auto-provides that
                context to its own children, not to the component that
                instantiates it. See spec 12's Analyst Brief, Open Questions #4.
              */}
              <ReactFlowProvider>
                <CanvasFlow />
              </ReactFlowProvider>
            </ClientSideSuspense>
          </CanvasRoomBoundary>
        </RoomProvider>
      </LiveblocksProvider>
      <ShapePanel />
    </div>
  )
}

/**
 * Renders a connection-error fallback in place of the room's children when
 * `useErrorListener` reports a `ROOM_CONNECTION_ERROR` (auth failure, no
 * access, full room, or a changed room ID). Local-state driven rather than
 * `ErrorBoundary` from `react-error-boundary`, to avoid a fourth new
 * dependency for a single fallback UI — see spec 11's Analyst Brief, Open
 * Questions #3. `useErrorListener` must be called inside `LiveblocksProvider`
 * (satisfied here via `RoomProvider`, which is nested inside it).
 */
function CanvasRoomBoundary({ children }: { children: React.ReactNode }) {
  const [connectionError, setConnectionError] = useState(false)

  useErrorListener((error) => {
    if (error.context.type === "ROOM_CONNECTION_ERROR") {
      setConnectionError(true)
    }
  })

  if (connectionError) {
    return <CanvasError />
  }

  return <>{children}</>
}

function CanvasLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-base">
      <p className="text-sm text-copy-muted">Loading canvas…</p>
    </div>
  )
}

function CanvasError() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-base">
      <p className="text-sm text-copy-muted">
        Unable to connect to the canvas. Please refresh the page.
      </p>
    </div>
  )
}

/**
 * The actual React Flow surface, synced to Liveblocks Storage via
 * `useLiveblocksFlow`. Starts from empty nodes/edges — no snapshot
 * persistence or starter-template loading (spec 21/starter-templates own
 * that). Registers the custom `CanvasNode` renderer for `CANVAS_NODE_TYPE`
 * (spec 11 deliberately deferred this — see spec 12's Analyst Brief, Open
 * Questions #7) and handles native `dragover`/`drop` so a shape dragged from
 * `ShapePanel` creates a new node at the drop position. No custom edge
 * rendering, edge creation changes, or `Controls` panel — untouched by
 * spec 12.
 */
function CanvasFlow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useLiveblocksFlow<
    CanvasNodeAlias,
    CanvasEdge
  >({
    suspense: true,
    nodes: { initial: [] },
    edges: { initial: [] },
  })
  const { screenToFlowPosition } = useReactFlow()

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(CANVAS_DRAG_MIME_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const raw = event.dataTransfer.getData(CANVAS_DRAG_MIME_TYPE)
      const payload = parseShapeDragPayload(raw)
      if (!payload) return

      event.preventDefault()
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const newNode = createDroppedNode(payload, position)
      onNodesChange([{ type: "add", item: newNode }])
    },
    [screenToFlowPosition, onNodesChange],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={CANVAS_NODE_TYPES}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      connectionMode={ConnectionMode.Loose}
      fitView
    >
      <MiniMap />
      <Background variant={BackgroundVariant.Dots} />
    </ReactFlow>
  )
}
