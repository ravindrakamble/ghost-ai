"use client"

import { useCallback, useState } from "react"
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type DefaultEdgeOptions,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react"
import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
  useCanRedo,
  useCanUndo,
  useErrorListener,
  useRedo,
  useRoom,
  useUndo,
} from "@liveblocks/react/suspense"
import { useLiveblocksFlow } from "@liveblocks/react-flow"
import { CanvasControlBar } from "@/components/editor/canvas-control-bar"
import { CanvasEdge } from "@/components/editor/canvas-edge"
import { CanvasNode } from "@/components/editor/canvas-node"
import { ShapePanel, type OnDropShape } from "@/components/editor/shape-panel"
import { StarterTemplatesModal } from "@/components/editor/starter-templates-modal"
import type { CanvasTemplate } from "@/components/editor/starter-templates"
import { CanvasEdgeUpdateContext, type UpdateCanvasEdgeData } from "@/hooks/use-update-canvas-edge"
import { CanvasNodeUpdateContext, type UpdateCanvasNodeData } from "@/hooks/use-update-canvas-node"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { createDroppedNode } from "@/lib/canvas-shapes"
import {
  CANVAS_EDGE_TYPE,
  CANVAS_NODE_TYPE,
  type CanvasEdge as CanvasEdgeAlias,
  type CanvasNode as CanvasNodeAlias,
} from "@/types/canvas"
import "@xyflow/react/dist/style.css"
import "@liveblocks/react-flow/styles.css"

/**
 * `nodeTypes`/`edgeTypes` must be stable references across renders (React
 * Flow warns and re-renders unnecessarily otherwise) — defined once at
 * module scope rather than inline in `CanvasFlow`.
 */
const CANVAS_NODE_TYPES: NodeTypes = { [CANVAS_NODE_TYPE]: CanvasNode }
const CANVAS_EDGE_TYPES: EdgeTypes = { [CANVAS_EDGE_TYPE]: CanvasEdge }

/**
 * New connections created via `onConnect` (dragging from a node handle) use
 * the custom `CANVAS_EDGE_TYPE` renderer and an arrow marker from creation —
 * spec 16's Analyst Brief, Concrete deliverables, step 2 ("make new
 * connections use the custom canvas edge renderer"). Marker color is fixed
 * (not hover/selected-tracking) rather than dynamic — see spec 16's Analyst
 * Brief, Open Questions #5: React Flow resolves `markerEnd` into a static
 * per-edge SVG `<marker>` def from the edge's own persisted data, not a
 * per-render style, so tracking `CanvasEdge`'s local hover state would need
 * a hand-rolled marker instead of React Flow's own marker system — judged
 * not worth the complexity for a recommendation the spec text calls minor.
 */
const DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = {
  type: CANVAS_EDGE_TYPE,
  markerEnd: { type: MarkerType.ArrowClosed, color: "var(--text-secondary)" },
}

/**
 * Passed as `{ duration }` to `zoomIn`/`zoomOut`/`fitView` so the viewport
 * transition animates smoothly rather than jumping instantly — `@xyflow/
 * react`'s own animated-transition mechanism, not a hand-rolled CSS
 * transition. No exact value is pinned by the spec text; 200ms is a Dev-level
 * choice within its own recommended 150–300ms range. See spec 17's Analyst
 * Brief, Open Questions #2.
 */
const ZOOM_TRANSITION_DURATION_MS = 200

interface CanvasProps {
  /** Liveblocks room ID — the current project's ID (spec 10's convention). */
  roomId: string
  /**
   * Starter templates modal open/close state, owned by `WorkspaceShell`
   * (spec 18) and threaded down the same direction `roomId` already flows —
   * see spec 18's Analyst Brief, Open Questions #1. Forwarded straight
   * through to `CanvasFlow`, which is the only place the real
   * `nodes`/`edges`/`onNodesChange`/`onEdgesChange`/`fitView` mechanism the
   * modal's Import action needs actually lives.
   */
  isTemplatesModalOpen: boolean
  setIsTemplatesModalOpen: (open: boolean) => void
}

/**
 * Client-side canvas surface: owns the Liveblocks room connection
 * (`LiveblocksProvider`/`RoomProvider`) and the React Flow canvas synced to
 * that room's Storage (`useLiveblocksFlow`). This is the collaborative
 * canvas *foundation* only — no persistence, no custom node/edge visuals,
 * no `Controls` panel, and no AI-generated content (spec 11's Scope Limits).
 */
export function Canvas({ roomId, isTemplatesModalOpen, setIsTemplatesModalOpen }: CanvasProps) {
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
                <CanvasFlow
                  isTemplatesModalOpen={isTemplatesModalOpen}
                  setIsTemplatesModalOpen={setIsTemplatesModalOpen}
                />
              </ReactFlowProvider>
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
 * that). Registers the custom `CanvasNode` renderer for `CANVAS_NODE_TYPE`
 * (spec 11 deliberately deferred this — see spec 12's Analyst Brief, Open
 * Questions #7) and renders `ShapePanel` as a sibling of `<ReactFlow>` (it
 * needs direct access to `screenToFlowPosition`/`onNodesChange`, per
 * `handleDropShape` below) so a shape dragged from the panel creates a new
 * node at the drop position. No custom edge rendering, edge creation
 * changes, or `Controls` panel — untouched by spec 12.
 *
 * Node creation originally relied on native HTML5 `draggable`/`dragover`/
 * `drop` (spec 12/13). A human smoke test found that mechanism unreliably
 * failed to *start* a drag for several shapes (repeated attempts needed for
 * rectangle/circle/pill/hexagon, while diamond/cylinder began on the first
 * try every time) — a known general weak spot of the native DnD API, not a
 * bug in this drop logic, which was always correct for every shape. Fixed by
 * having `ShapePanel` track the whole gesture itself via Pointer Events and
 * report a finished drop through `handleDropShape` below (screen position
 * in, `screenToFlowPosition` + `createDroppedNode` + `onNodesChange` out) —
 * `onDragOver`/`onDrop` are no longer wired to `<ReactFlow>` at all.
 *
 * Spec 14 adds `updateNodeData`, provided to descendants via
 * `CanvasNodeUpdateContext` so the leaf `CanvasNode` renderer can dispatch
 * label edits back through the real `onNodesChange` — see spec 14's
 * Analyst Brief, Open Questions #1, and `hooks/use-update-canvas-node.ts`.
 *
 * Spec 16 registers `edgeTypes` (the custom `CanvasEdge` renderer, first
 * consumer of `CANVAS_EDGE_TYPE`/`CanvasEdgeData` since spec 11 defined
 * them) and `defaultEdgeOptions` so edges created via `onConnect` — already
 * wired up since spec 11, previously producing React Flow's default
 * `bezier` edge — use the custom renderer and arrow marker from creation.
 * Also adds `updateEdgeData`, the edge-scoped mirror of `updateNodeData`
 * above, provided via `CanvasEdgeUpdateContext` so the leaf `CanvasEdge`
 * renderer can dispatch label edits back through the real `onEdgesChange`
 * — see spec 16's Analyst Brief, Open Questions #1, and
 * `hooks/use-update-canvas-edge.ts`.
 *
 * Spec 17 (Canvas Ergonomics) reads the real React Flow zoom methods
 * (`zoomIn`/`zoomOut`/`fitView`, from the same `useReactFlow()` call already
 * used for `screenToFlowPosition`) and Liveblocks' four room-history hooks
 * (`useUndo`/`useRedo`/`useCanUndo`/`useCanRedo`, valid here since
 * `CanvasFlow` already sits inside `RoomProvider`), then passes the results
 * down as plain props to `CanvasControlBar` and as arguments to
 * `useKeyboardShortcuts` — not a new context, since both are siblings
 * `CanvasFlow` itself instantiates. See spec 17's Analyst Brief, Open
 * Questions #4. Also drops `<MiniMap>` (spec 17's Concrete deliverables).
 *
 * Spec 18 (Starter Template) renders `<StarterTemplatesModal>` as a sibling
 * of `<ReactFlow>`/`ShapePanel`/`CanvasControlBar` and owns
 * `handleImportTemplate`, the clear-then-add mechanism. **This deliberately
 * does not match the Analyst Brief's literal code sketch** (dispatching a
 * `{ id, type: "remove" }` `NodeChange`/`EdgeChange` through
 * `onNodesChange`/`onEdgesChange` to clear the canvas) — reading
 * `@liveblocks/react-flow`'s real (unminified) `dist/lib/flow.js` source
 * shows `applyNodeChanges`/`applyEdgeChanges`'s `"remove"` case is a no-op
 * (`case "remove": break`) in this installed version; removal is only wired
 * through the separate `onDelete` mutation the same hook returns (which
 * really does `nodesMap.delete(...)`/`edgesMap.delete(...)` against
 * Liveblocks Storage). Dispatching `"remove"` through `onNodesChange` as the
 * brief's sketch describes would silently leave every pre-existing node/edge
 * in Storage while the template's nodes/edges get added on top — failing
 * acceptance criterion 8 ("only the template's node/edge IDs remain"). Using
 * `onDelete` is still "the existing... change-dispatch mechanism" in the
 * sense acceptance criterion 7 cares about (it's the other half of the same
 * `useLiveblocksFlow` API, a real Storage-backed mutation, not a local-only
 * or React-Flow-only path) — it is simply the *correct* half for removal in
 * this library version, not a workaround. See this component's own inline
 * comment on `handleImportTemplate` below, and the Dev Notes appended to
 * `context/spec-status/18-starter-template.md` for the full source excerpt.
 *
 * QA's bugfix round: the three mutations (`onDelete`, `onNodesChange`,
 * `onEdgesChange`) are wrapped in `room.batch(...)` (`room` from `useRoom()`,
 * the same `@liveblocks/react/suspense` module already imported here for
 * `useUndo`/`useRedo`/`useCanUndo`/`useCanRedo`). Each is itself a
 * `useMutation`-returned function that already wraps its own call in
 * `room.batch(...)` internally — but `@liveblocks/core`'s `batch()` is
 * reentrant (a nested `batch()` call runs its callback inline and folds its
 * ops into the enclosing batch rather than flushing on its own), so wrapping
 * all three in one outer `room.batch(...)` coalesces them into a single
 * Storage commit/broadcast instead of three. See the "Bugfix round" note
 * appended to `context/spec-status/18-starter-template.md` for the verified
 * source.
 */
function CanvasFlow({
  isTemplatesModalOpen,
  setIsTemplatesModalOpen,
}: {
  isTemplatesModalOpen: boolean
  setIsTemplatesModalOpen: (open: boolean) => void
}) {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, onDelete } = useLiveblocksFlow<
    CanvasNodeAlias,
    CanvasEdgeAlias
  >({
    suspense: true,
    nodes: { initial: [] },
    edges: { initial: [] },
  })
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow()
  const undo = useUndo()
  const redo = useRedo()
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()
  const room = useRoom()

  const handleDropShape = useCallback<OnDropShape>(
    (payload, clientPosition) => {
      const position = screenToFlowPosition(clientPosition)
      const newNode = createDroppedNode(payload, position)
      onNodesChange([{ type: "add", item: newNode }])
    },
    [screenToFlowPosition, onNodesChange],
  )

  const updateNodeData = useCallback<UpdateCanvasNodeData>(
    (nodeId, data) => {
      const node = nodes.find((candidate) => candidate.id === nodeId)
      if (!node) return

      const updatedNode: CanvasNodeAlias = { ...node, data: { ...node.data, ...data } }
      onNodesChange([{ id: nodeId, type: "replace", item: updatedNode }])
    },
    [nodes, onNodesChange],
  )

  const updateEdgeData = useCallback<UpdateCanvasEdgeData>(
    (edgeId, data) => {
      const edge = edges.find((candidate) => candidate.id === edgeId)
      if (!edge) return

      const updatedEdge: CanvasEdgeAlias = { ...edge, data: { ...edge.data, ...data } }
      onEdgesChange([{ id: edgeId, type: "replace", item: updatedEdge }])
    },
    [edges, onEdgesChange],
  )

  /**
   * Clears every existing node/edge, then adds the selected template's own
   * nodes/edges, then fits the view — spec 18's Concrete deliverables. No
   * confirmation dialog before the clear (spec 18's Analyst Brief, Open
   * Questions #6: the existing Liveblocks undo, spec 17, is the recovery
   * path).
   *
   * Removal goes through `onDelete` (not a `{ type: "remove" }` change
   * through `onNodesChange`/`onEdgesChange` — see this component's docblock
   * above for why that path is a verified no-op in the installed
   * `@liveblocks/react-flow` version). `onDelete` takes the full current
   * node/edge objects and both collections in one call, so the removal step
   * is still a single real Storage mutation, just via the other half of the
   * same `useLiveblocksFlow` API. Adds still go through the standard
   * `onNodesChange`/`onEdgesChange` `{ type: "add", item }` path (spec 12's
   * pattern), one call each so every template node/edge lands in a single
   * batch rather than one mutation per item.
   *
   * All three calls (`onDelete`, `onNodesChange`, `onEdgesChange`) are
   * wrapped in `room.batch(...)` so they coalesce into one Storage commit/
   * broadcast rather than three — otherwise a remote collaborator could
   * observe a transient empty-canvas frame between the `onDelete` commit and
   * the subsequent "add" commits, which is exactly the race the Concrete
   * Deliverables text for this spec calls out as something to avoid. See
   * this component's docblock above and the "Bugfix round" note in
   * `context/spec-status/18-starter-template.md`.
   *
   * `fitView()` is called synchronously right after, with no manual
   * deferral (rAF/effect/microtask) — verified via `@xyflow/react`'s real
   * source (`dist/esm/index.js`) that `fitView()` itself only flags
   * `fitViewQueued: true` in the store and returns a promise; the actual fit
   * computation is deferred internally until a later `setNodes()` call (from
   * `StoreUpdater`'s effect reacting to the `nodes` prop changing) reports
   * `nodesInitialized: true` for the new nodes. Since our template nodes
   * carry explicit `width`/`height`, and `StoreUpdater` re-runs `setNodes`
   * on every `nodes` prop change until that resolves, the fit genuinely
   * lands on the newly-imported diagram's real bounds, not the previous
   * (stale) ones, regardless of exactly when in this synchronous handler
   * `fitView()` is invoked relative to `onNodesChange`/`onEdgesChange`/
   * `onDelete`. See the Dev Notes in `context/spec-status/18-starter-
   * template.md` for the full source excerpts this conclusion is based on.
   */
  const handleImportTemplate = useCallback(
    (template: CanvasTemplate) => {
      const nodeChanges: NodeChange<CanvasNodeAlias>[] = template.nodes.map((node) => ({
        type: "add" as const,
        item: node,
      }))
      const edgeChanges: EdgeChange<CanvasEdgeAlias>[] = template.edges.map((edge) => ({
        type: "add" as const,
        item: edge,
      }))

      room.batch(() => {
        onDelete({ nodes, edges })
        onNodesChange(nodeChanges)
        onEdgesChange(edgeChanges)
      })

      fitView({ duration: ZOOM_TRANSITION_DURATION_MS })
    },
    [nodes, edges, onNodesChange, onEdgesChange, onDelete, fitView, room],
  )

  // Shared by both CanvasControlBar's buttons and the keyboard shortcuts
  // below, so both trigger the exact same animated zoom/undo/redo behavior
  // — see this component's docblock, spec 17's Analyst Brief.
  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: ZOOM_TRANSITION_DURATION_MS })
  }, [zoomIn])

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: ZOOM_TRANSITION_DURATION_MS })
  }, [zoomOut])

  const handleFitView = useCallback(() => {
    fitView({ duration: ZOOM_TRANSITION_DURATION_MS })
  }, [fitView])

  useKeyboardShortcuts({ zoomIn: handleZoomIn, zoomOut: handleZoomOut, undo, redo })

  return (
    <CanvasNodeUpdateContext.Provider value={updateNodeData}>
      <CanvasEdgeUpdateContext.Provider value={updateEdgeData}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={CANVAS_NODE_TYPES}
          edgeTypes={CANVAS_EDGE_TYPES}
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          connectionMode={ConnectionMode.Loose}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} />
        </ReactFlow>
        <ShapePanel onDropShape={handleDropShape} />
        <CanvasControlBar
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitView={handleFitView}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
        <StarterTemplatesModal
          open={isTemplatesModalOpen}
          onOpenChange={setIsTemplatesModalOpen}
          onImport={handleImportTemplate}
        />
      </CanvasEdgeUpdateContext.Provider>
    </CanvasNodeUpdateContext.Provider>
  )
}
