"use client"

import { useState } from "react"
import { Background, BackgroundVariant, ConnectionMode, MiniMap, ReactFlow } from "@xyflow/react"
import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
  useErrorListener,
} from "@liveblocks/react/suspense"
import { useLiveblocksFlow } from "@liveblocks/react-flow"
import "@xyflow/react/dist/style.css"
import "@liveblocks/react-flow/styles.css"

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
              <CanvasFlow />
            </ClientSideSuspense>
          </CanvasRoomBoundary>
        </RoomProvider>
      </LiveblocksProvider>
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
 * that). Default (non-custom) node/edge rendering only; `nodeTypes`/
 * `edgeTypes` are intentionally not registered here (spec 11's Scope
 * Limits).
 */
function CanvasFlow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useLiveblocksFlow({
    suspense: true,
    nodes: { initial: [] },
    edges: { initial: [] },
  })

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      connectionMode={ConnectionMode.Loose}
      fitView
    >
      <MiniMap />
      <Background variant={BackgroundVariant.Dots} />
    </ReactFlow>
  )
}
