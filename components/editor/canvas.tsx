"use client"

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  type DefaultEdgeOptions,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react"
import { toPng } from "html-to-image"
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
  useUpdateMyPresence,
} from "@liveblocks/react/suspense"
import { useLiveblocksFlow } from "@liveblocks/react-flow"
import { LiveList } from "@liveblocks/client"
import { CanvasControlBar } from "@/components/editor/canvas-control-bar"
import { CanvasEdge } from "@/components/editor/canvas-edge"
import { CanvasNode } from "@/components/editor/canvas-node"
import { LiveCursors } from "@/components/editor/live-cursors"
import { PresenceAvatars } from "@/components/editor/presence-avatars"
import { SaveTemplateDialog } from "@/components/editor/save-template-dialog"
import { ShapePanel, type OnDropShape } from "@/components/editor/shape-panel"
import { StarterTemplatesModal } from "@/components/editor/starter-templates-modal"
import type { CanvasTemplate } from "@/components/editor/starter-templates"
import { CanvasEdgeUpdateContext, type UpdateCanvasEdgeData } from "@/hooks/use-update-canvas-edge"
import { CanvasNodeUpdateContext, type UpdateCanvasNodeData } from "@/hooks/use-update-canvas-node"
import { CanvasSearchHighlightContext } from "@/hooks/use-canvas-search-highlight"
import { NodeCommentsContext, useNodeComments } from "@/hooks/use-node-comments"
import { useAiChatFeed } from "@/hooks/use-ai-chat-feed"
import { useAiStatusFeed } from "@/hooks/use-ai-status-feed"
import { useCanvasAutosave, type CanvasSaveStatus } from "@/hooks/use-canvas-autosave"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { createDroppedNode } from "@/lib/canvas-shapes"
import {
  CANVAS_EDGE_TYPE,
  CANVAS_NODE_TYPE,
  type CanvasEdge as CanvasEdgeAlias,
  type CanvasNode as CanvasNodeAlias,
} from "@/types/canvas"
import type {
  AiChatMessage,
  AiStatusMessage,
  SendAgentChatMessage,
  SendChatMessage,
} from "@/types/tasks"
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

/**
 * Margin (in canvas pixels) added around the exported diagram's own node
 * bounds (`getNodesBounds`) on every side, so shapes/labels sitting right at
 * the extreme edge of the diagram don't get cropped flush against the
 * exported image's border.
 */
const EXPORT_IMAGE_PADDING_PX = 48

/**
 * Zoom level `handleJumpToNode` (spec 36, Canvas Node Search) passes to
 * `setCenter` — the diagram's authored 1:1 scale, the same reference scale
 * `handleExportImage` above already treats as meaningful ("exports at the
 * diagram's authored 1:1 scale... not whatever zoom the viewer happens to be
 * at"). No exact number is pinned by the spec text itself — see spec 36's
 * Analyst Brief, Open Questions #1.
 */
const SEARCH_JUMP_ZOOM = 1

/**
 * How long a search-jump's target-node highlight stays visible before
 * clearing itself — spec 36's own literal "~1.5s."
 */
const SEARCH_HIGHLIGHT_DURATION_MS = 1500

/**
 * Shallow runtime shape-check for `GET /api/projects/[projectId]/canvas`'s
 * response body (spec 21) — just enough to confirm `nodes`/`edges` are
 * arrays before applying them into the room, matching this codebase's
 * existing shallow-validation convention for other route responses (e.g.
 * `hooks/use-collaborators.ts`'s `parseJson`). Deliberately not a deep
 * per-node/per-edge shape check: this response only ever contains whatever
 * this same project's own `PUT` previously uploaded, round-tripped through
 * Vercel Blob — not arbitrary third-party input.
 */
function isCanvasSnapshotBody(
  value: unknown,
): value is { nodes: CanvasNodeAlias[]; edges: CanvasEdgeAlias[] } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges)
}

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
  /**
   * Pushes the canvas autosave hook's status (spec 21) up to
   * `WorkspaceShell`, which owns the state so `WorkspaceNavbar`'s
   * `SaveStatusIndicator` can render it. This is a callback-prop push-up,
   * not the same "parent owns state, child reads it directly" direction
   * spec 18 established for `isTemplatesModalOpen` above — that boolean's
   * owner (`WorkspaceShell`) could pass it straight through because nothing
   * about *computing* it required being inside the room boundary. Save
   * status is only known inside `CanvasFlow`, beneath the Liveblocks
   * `RoomProvider`/`ClientSideSuspense` boundary `WorkspaceShell` sits
   * outside of (`useCanvasAutosave` itself needs the room's synced
   * `nodes`/`edges`), so it has to flow back up via a callback instead.
   */
  onSaveStatusChange: (status: CanvasSaveStatus) => void
  /**
   * Pushes the latest validated `ai-status-feed` message (spec 24, via
   * `hooks/use-ai-status-feed.ts`) up to `WorkspaceShell`, which threads it
   * down to `AiSidebar`/`AiArchitectTab` as a plain prop. Same
   * callback-push-up shape as `onSaveStatusChange` above (spec 21) and for
   * the same reason: the room's `ai-status-feed` subscription is only valid
   * inside `CanvasFlow`, beneath the `RoomProvider` boundary `WorkspaceShell`
   * sits outside of — see spec 24's Analyst Brief, Open Questions #1.
   */
  onAiStatusChange: (status: AiStatusMessage | null) => void
  /**
   * Pushes the room's ordered, schema-validated `ai-chat` message list
   * (spec 25, via `hooks/use-ai-chat-feed.ts`) up to `WorkspaceShell`. Same
   * callback-push-up shape as `onAiStatusChange` above, for the same reason
   * — the room's Storage subscription is only valid inside `CanvasFlow`.
   */
  onChatMessagesChange: (messages: AiChatMessage[]) => void
  /**
   * The bidirectional counterpart `onAiStatusChange` didn't need (spec 24
   * only ever consumed a feed, never wrote to one): pushes the real
   * `sendMessage` function `useAiChatFeed()` builds (via `useMutation`) up
   * to `WorkspaceShell`, which threads it back down through `AiSidebar` to
   * `AiArchitectTab` so a user can actually send a message from outside the
   * room boundary. See spec 25's Analyst Brief, Open Questions #3.
   */
  onSendChatMessageChange: (sendMessage: SendChatMessage) => void
  /**
   * The AI-authored-message counterpart to `onSendChatMessageChange` above
   * (spec 26): pushes `useAiChatFeed()`'s `sendAgentMessage` function up to
   * `WorkspaceShell`, which threads it down through `AiSidebar` to
   * `AiArchitectTab` so a client's own in-flight design-agent run can push a
   * final AI/error message onto `ai-chat` once `useRealtimeRun` reports its
   * outcome. Same callback-push-up-and-down shape as
   * `onSendChatMessageChange` — the room's Storage mutation is only valid
   * inside `CanvasFlow`. See spec 26's Analyst Brief, Concrete deliverables.
   */
  onSendAgentMessageChange: (sendAgentMessage: SendAgentChatMessage) => void
  /**
   * Pushes the room's live `nodes`/`edges` (spec 30, the full `CanvasNode[]`/
   * `CanvasEdge[]` React Flow shapes already destructured from
   * `useLiveblocksFlow`) up to `WorkspaceShell`, which threads them down to
   * `SpecsTab` so its "Generate Spec" button can convert the current graph
   * into `POST /api/ai/spec`'s narrower request shape. Same callback-push-up
   * shape as `onChatMessagesChange` above, for the same reason — the room's
   * synced state is only valid inside `CanvasFlow`, beneath the `RoomProvider`
   * boundary `WorkspaceShell` sits outside of. Deliberately not named
   * `onNodesChange`/`onEdgesChange` — those names are already React Flow's
   * own change-list-dispatcher convention in this file, and reusing them here
   * for a completely different payload (a full snapshot, not a change list)
   * would be misleading. See spec 30's Analyst Brief, Open Questions #2.
   */
  onCanvasGraphChange: (nodes: CanvasNodeAlias[], edges: CanvasEdgeAlias[]) => void
}

/**
 * Client-side canvas surface: owns the Liveblocks room connection
 * (`LiveblocksProvider`/`RoomProvider`) and the React Flow canvas synced to
 * that room's Storage (`useLiveblocksFlow`). This is the collaborative
 * canvas *foundation* only — no persistence, no custom node/edge visuals,
 * no `Controls` panel, and no AI-generated content (spec 11's Scope Limits).
 */
export function Canvas({
  roomId,
  isTemplatesModalOpen,
  setIsTemplatesModalOpen,
  onSaveStatusChange,
  onAiStatusChange,
  onChatMessagesChange,
  onSendChatMessageChange,
  onSendAgentMessageChange,
  onCanvasGraphChange,
}: CanvasProps) {
  return (
    <div className="relative flex-1 bg-base">
      <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
        <RoomProvider
          id={roomId}
          initialPresence={{ cursor: null, thinking: false }}
          initialStorage={{ messages: new LiveList([]), nodeComments: new LiveList([]) }}
        >
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
                  projectId={roomId}
                  isTemplatesModalOpen={isTemplatesModalOpen}
                  setIsTemplatesModalOpen={setIsTemplatesModalOpen}
                  onSaveStatusChange={onSaveStatusChange}
                  onAiStatusChange={onAiStatusChange}
                  onChatMessagesChange={onChatMessagesChange}
                  onSendChatMessageChange={onSendChatMessageChange}
                  onSendAgentMessageChange={onSendAgentMessageChange}
                  onCanvasGraphChange={onCanvasGraphChange}
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
 *
 * Spec 19 (Presence Avatars & Cursor) adds `updateMyPresence` (Liveblocks'
 * `useUpdateMyPresence()`, valid here for the same reason `useUndo`/`useRedo`
 * already are — `CanvasFlow` sits inside `RoomProvider`) and wires two of
 * React Flow's own real, named pane-level handlers — `onPaneMouseMove`/
 * `onPaneMouseLeave` — to it, broadcasting the local pointer's flow-space
 * position (via the same `screenToFlowPosition` already used for node
 * drops) into the room's Presence `cursor` field, and clearing it to `null`
 * on pane-leave. `flowToScreenPosition` (the same `useReactFlow()` call's
 * other half) is threaded down to `<LiveCursors>` as a prop so it can
 * convert other participants' stored cursor positions back to screen space.
 * `<PresenceAvatars>`/`<LiveCursors>` render as further siblings of
 * `<ReactFlow>`/`ShapePanel`/`CanvasControlBar`/`StarterTemplatesModal` —
 * same convention, no new context. See spec 19's Analyst Brief.
 *
 * Spec 21 (Canvas Autosave) adds two things, both scoped to this component
 * since it's the only place the room's real `nodes`/`edges` live:
 *
 * 1. An initial-load effect (`hasAttemptedInitialLoadRef`-guarded, so it
 *    only ever runs its actual logic once per mount even though `nodes`/
 *    `edges` are in its dependency array for `exhaustive-deps` correctness):
 *    if the room is genuinely empty on mount (both `nodes` and `edges` have
 *    zero length — reliable here since `useLiveblocksFlow({ suspense: true,
 *    ... })` plus the outer `ClientSideSuspense` already guarantee the
 *    initial Storage sync has completed by the time this component's body
 *    runs), it fetches `GET /api/projects/[projectId]/canvas`. A non-OK
 *    response (404 "no saved canvas," or any other failure) or invalid body
 *    shape is treated identically to "nothing to load" — the canvas simply
 *    starts empty, matching spec 11's original baseline. A valid snapshot is
 *    applied via one `room.batch(...)` wrapping both `onNodesChange`/
 *    `onEdgesChange` "add" calls, the same atomic-Storage-write convention
 *    spec 18 established for template import, so a remote collaborator never
 *    observes a partial load. If the room already has *any* existing
 *    content, the fetch is skipped entirely (acceptance criterion 8) — never
 *    attempted regardless of whether a saved blob also exists.
 * 2. `useCanvasAutosave`, gated by `isReadyForAutosave` (only flipped to
 *    `true` once the above load-or-skip decision has settled) so a debounced
 *    save can't fire against the room's momentarily-empty starting state and
 *    overwrite a real saved snapshot before it's even been loaded back in.
 *    Its returned status is pushed up to `WorkspaceShell` via the
 *    `onSaveStatusChange` prop (see `Canvas`'s own docblock above for why
 *    this is a callback push-up rather than a direct pass-through).
 *
 * Spec 24 (AI Presence State) subscribes to the room's `ai-status-feed`
 * (`useAiStatusFeed()`, valid here for the same reason `useUndo`/
 * `useUpdateMyPresence` already are — `CanvasFlow` sits inside
 * `RoomProvider`) and pushes the latest validated message up via the new
 * `onAiStatusChange` prop, the exact same callback-push-up shape
 * `onSaveStatusChange` already established. This component does not read or
 * render anything AI-status-related itself — `AiArchitectTab` (outside the
 * room boundary) is the actual consumer.
 *
 * Spec 25 (Sidebar Chat Feed) subscribes to the room's `ai-chat` Storage
 * `LiveList` (`useAiChatFeed()`, valid here for the same reason
 * `useAiStatusFeed()` already is) and pushes the ordered, validated message
 * list up via `onChatMessagesChange` — the same one-directional shape as
 * `onAiStatusChange`. Unlike spec 24, this is also bidirectional: the real
 * `sendMessage` function `useAiChatFeed()` builds is pushed *down* out of
 * this component via `onSendChatMessageChange`, since `AiArchitectTab`
 * (outside the room boundary) is where the user actually triggers a send —
 * see spec 25's Analyst Brief, Open Questions #3.
 *
 * Spec 30 (Generate Spec Button) adds one more push-up: the room's live
 * `nodes`/`edges` (already destructured from `useLiveblocksFlow` below) are
 * pushed up via a new `onCanvasGraphChange` prop in a dedicated `useEffect`,
 * mirroring `onChatMessagesChange`'s effect-based push exactly. `SpecsTab`
 * (outside the room boundary) is where the "Generate Spec" button converts
 * this snapshot into `POST /api/ai/spec`'s narrower request shape -- this
 * component itself makes no `/api/ai/spec*` call and owns no `useRealtimeRun`
 * subscription of its own.
 *
 * Spec 26 (Design Agent Frontend) extends the same `useAiChatFeed()` call
 * with its own additive `sendAgentMessage` function (role: "assistant"),
 * pushed down via a new `onSendAgentMessageChange` prop — the bidirectional
 * counterpart's own counterpart. `AiArchitectTab` calls it once its local
 * `useRealtimeRun` subscription (tracking the run this same client just
 * triggered via `POST /api/ai/design`) reports a terminal state. This
 * component itself does not call `/api/ai/design*` or `useRealtimeRun` —
 * that orchestration lives entirely in `AiArchitectTab`, outside the room
 * boundary, per spec 26's Analyst Brief, Open Questions #3.
 *
 * "Export as image" (a direct user request, not a numbered spec) adds
 * `handleExportImage` and the `canvasContainerRef` it reads
 * `.react-flow__viewport` through, plus `isExportingImage` — see that
 * handler's own docblock below for the export mechanism itself. Passed down
 * to `CanvasControlBar` as three new props alongside the existing
 * zoom/undo/redo ones, the same plain-prop convention spec 17 already
 * established for that component — no new context.
 *
 * Spec 33 (Custom Templates) adds "Save as template": `isSaveTemplateDialogOpen`
 * state and `handleSaveTemplate(name, description)`, following the same
 * "dialog rendered here, `CanvasControlBar` only gets a plain trigger prop"
 * split spec 18 established for `StarterTemplatesModal`/`isTemplatesModalOpen`
 * — see spec 33's Analyst Brief, Open Questions #3. `handleSaveTemplate`
 * POSTs `{ name, description, nodes, edges }` (this component's own live
 * `nodes`/`edges`, already destructured from `useLiveblocksFlow`) to
 * `POST /api/templates`, tracked via local `isSavingTemplate`/
 * `saveTemplateError` state passed down to `<SaveTemplateDialog>` as plain
 * props (`ShareDialog`'s "mutation owned by parent, dialog presentational"
 * convention). Does not touch `handleImportTemplate`/`StarterTemplatesModal`
 * — importing a saved template still goes through that exact same
 * clear-then-add mechanism unchanged (spec 33's own explicit "no new import
 * mechanism" requirement); the modal's own "My Templates" section fetches a
 * saved template's content itself and calls the same `onImport` prop.
 *
 * Spec 36 (Canvas Node Search) adds `handleJumpToNode` and `highlightedNodeId`
 * state (with a `useRef`-tracked clear timeout, see that handler's own
 * docblock below) — both passed down: `nodes`/`handleJumpToNode` as two new
 * `CanvasControlBar` props (which forwards them to `CanvasSearchPopover`),
 * and `highlightedNodeId` via a new `CanvasSearchHighlightContext.Provider`
 * nested alongside the existing `CanvasNodeUpdateContext`/
 * `CanvasEdgeUpdateContext` providers, consumed by the leaf `CanvasNode`
 * renderer. This state never leaves the room-bounded `CanvasFlow` subtree —
 * no push-up to `WorkspaceShell`, since nothing outside the canvas needs to
 * know about search/highlight state (unlike most recent specs' `on*Change`
 * push-ups above). See spec 36's Analyst Brief, Concrete deliverables.
 *
 * Spec 37 (Node Comments) calls `useNodeComments()` once (valid here for the
 * same reason `useAiChatFeed()`/`useAiStatusFeed()` already are —
 * `CanvasFlow` sits inside `RoomProvider`) and wraps its returned
 * `{ comments, sendComment }` in a new `NodeCommentsContext.Provider`,
 * nested alongside the existing `CanvasNodeUpdateContext`/
 * `CanvasEdgeUpdateContext`/`CanvasSearchHighlightContext` providers — a
 * fourth nested provider, spec 36's own precedent. Like search-highlight
 * state, node comments have no consumer outside the room-bounded
 * `CanvasFlow` subtree, so there's no push-up to `WorkspaceShell`. See spec
 * 37's Analyst Brief, Concrete deliverables and Open Questions #3.
 */
function CanvasFlow({
  projectId,
  isTemplatesModalOpen,
  setIsTemplatesModalOpen,
  onSaveStatusChange,
  onAiStatusChange,
  onChatMessagesChange,
  onSendChatMessageChange,
  onSendAgentMessageChange,
  onCanvasGraphChange,
}: {
  projectId: string
  isTemplatesModalOpen: boolean
  setIsTemplatesModalOpen: (open: boolean) => void
  onSaveStatusChange: (status: CanvasSaveStatus) => void
  onAiStatusChange: (status: AiStatusMessage | null) => void
  onChatMessagesChange: (messages: AiChatMessage[]) => void
  onSendChatMessageChange: (sendMessage: SendChatMessage) => void
  onSendAgentMessageChange: (sendAgentMessage: SendAgentChatMessage) => void
  onCanvasGraphChange: (nodes: CanvasNodeAlias[], edges: CanvasEdgeAlias[]) => void
}) {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, onDelete } = useLiveblocksFlow<
    CanvasNodeAlias,
    CanvasEdgeAlias
  >({
    suspense: true,
    nodes: { initial: [] },
    edges: { initial: [] },
  })
  const { screenToFlowPosition, flowToScreenPosition, zoomIn, zoomOut, fitView, setCenter } = useReactFlow()
  const undo = useUndo()
  const redo = useRedo()
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()
  const room = useRoom()
  const updateMyPresence = useUpdateMyPresence()

  const [isReadyForAutosave, setIsReadyForAutosave] = useState(false)
  const hasAttemptedInitialLoadRef = useRef(false)

  /**
   * Scopes `handleExportImage`'s `.react-flow__viewport` lookup to just this
   * project's own canvas rather than a bare `document.querySelector` (the
   * shape React Flow's own "Download Image" example uses) — a real DOM ref,
   * not a new context, since this only needs to reach a plain `<div>`
   * `CanvasFlow` itself renders below.
   */
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [isExportingImage, setIsExportingImage] = useState(false)

  // Spec 33 (Custom Templates): "Save as template" dialog open/close state
  // and in-flight/error state, owned here (not `CanvasControlBar`) — see
  // this component's own docblock above.
  const [isSaveTemplateDialogOpen, setIsSaveTemplateDialogOpen] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null)

  // Spec 36 (Canvas Node Search): the currently-highlighted (search-jumped-
  // to) node's id, local/ephemeral only — never written to Liveblocks
  // Storage or Presence. `highlightTimeoutRef` tracks the pending
  // clear-back-to-null timeout so two rapid searches in a row clear the
  // previous timeout first, rather than leaving a stale clear firing late or
  // two nodes appearing highlighted at once.
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [])

  /**
   * Spec 21 (Canvas Autosave): on mount, decide whether to load a
   * previously-saved canvas snapshot into the room. See this component's own
   * docblock above for the full mechanism. `nodes`/`edges` are read at
   * effect-run time (not `useLiveblocksFlow`'s current values re-checked on
   * every future call) — `hasAttemptedInitialLoadRef` guards the real work
   * to a single run per mount, so later `nodes`/`edges` changes just cause
   * this effect to re-fire and immediately return.
   */
  useEffect(() => {
    if (hasAttemptedInitialLoadRef.current) {
      return
    }
    hasAttemptedInitialLoadRef.current = true

    let cancelled = false

    async function loadInitialCanvas() {
      if (nodes.length === 0 && edges.length === 0) {
        try {
          const response = await fetch(`/api/projects/${projectId}/canvas`)
          if (response.ok) {
            const body: unknown = await response.json()
            if (!cancelled && isCanvasSnapshotBody(body)) {
              room.batch(() => {
                onNodesChange(body.nodes.map((item) => ({ type: "add" as const, item })))
                onEdgesChange(body.edges.map((item) => ({ type: "add" as const, item })))
              })
            }
          }
          // A non-OK response (404: no saved canvas yet, or any other
          // failure) means there's nothing to load — the canvas simply
          // starts empty (acceptance criterion 10).
        } catch {
          // Network/parse failure — treated the same as "nothing to load."
        }
      }

      if (!cancelled) {
        setIsReadyForAutosave(true)
      }
    }

    void loadInitialCanvas()

    return () => {
      cancelled = true
    }
  }, [projectId, room, onNodesChange, onEdgesChange, nodes, edges])

  const saveStatus = useCanvasAutosave({
    projectId,
    nodes,
    edges,
    enabled: isReadyForAutosave,
  })

  useEffect(() => {
    onSaveStatusChange(saveStatus)
  }, [saveStatus, onSaveStatusChange])

  // Spec 24 (AI Presence State): the room's latest validated `ai-status-feed`
  // message, pushed up to `WorkspaceShell` via `onAiStatusChange` — see this
  // component's own docblock above.
  const aiStatus = useAiStatusFeed()

  useEffect(() => {
    onAiStatusChange(aiStatus)
  }, [aiStatus, onAiStatusChange])

  // Spec 25 (Sidebar Chat Feed): the room's ordered, validated `ai-chat`
  // messages and the real `sendMessage` function to write to it — pushed up
  // (messages) and down (sendMessage) via callback props, since this
  // component sits inside the room boundary and `AiArchitectTab` doesn't —
  // see this component's own docblock above.
  const {
    messages: chatMessages,
    sendMessage: sendChatMessage,
    sendAgentMessage,
  } = useAiChatFeed()

  useEffect(() => {
    onChatMessagesChange(chatMessages)
  }, [chatMessages, onChatMessagesChange])

  useEffect(() => {
    onSendChatMessageChange(sendChatMessage)
  }, [sendChatMessage, onSendChatMessageChange])

  // Spec 26 (Design Agent Frontend): the bidirectional counterpart to
  // `sendChatMessage` above — pushes `useAiChatFeed()`'s `sendAgentMessage`
  // function down to `AiArchitectTab` (outside the room boundary) so it can
  // push a final AI/error message onto `ai-chat` once its own
  // `useRealtimeRun` subscription reports a triggered run's outcome.
  useEffect(() => {
    onSendAgentMessageChange(sendAgentMessage)
  }, [sendAgentMessage, onSendAgentMessageChange])

  // Spec 37 (Node Comments): the room's node-scoped comment threads —
  // subscribed once here and distributed to every `CanvasNode` leaf via
  // `NodeCommentsContext` below, filtered per-node by
  // `useNodeCommentsForNode`. Never pushed up to `WorkspaceShell` — no
  // consumer outside this room-bounded subtree, same as search-highlight
  // state.
  const nodeCommentsResult = useNodeComments()

  // Spec 30 (Generate Spec Button): pushes the room's live nodes/edges up to
  // `WorkspaceShell` -> `SpecsTab`, the exact same effect-based push shape as
  // `onChatMessagesChange` above.
  useEffect(() => {
    onCanvasGraphChange(nodes, edges)
  }, [nodes, edges, onCanvasGraphChange])

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

  /**
   * Spec 19 (Presence Avatars & Cursor): broadcasts the local pointer's
   * position through the room's Presence `cursor` field on every pane-level
   * mouse move, and clears it back to `null` when the pointer leaves the
   * pane — `onPaneMouseMove`/`onPaneMouseLeave` are React Flow's own real,
   * named pane-level mouse handlers (verified at `node_modules/@xyflow/
   * react/dist/esm/types/component-props.d.ts`), not a generic DOM
   * `onMouseMove` passthrough. The position is stored in flow-space
   * (`screenToFlowPosition`'s own output), not raw client coordinates, so a
   * cursor renders at its real target point on the canvas for every viewer
   * regardless of their own individual pan/zoom state — see spec 19's
   * Analyst Brief, Concrete deliverables, and `@liveblocks/react-flow`'s own
   * bundled `<Cursors />` reference implementation, which does the same.
   */
  const handlePaneMouseMove = useCallback(
    (event: ReactMouseEvent) => {
      updateMyPresence({ cursor: screenToFlowPosition({ x: event.clientX, y: event.clientY }) })
    },
    [updateMyPresence, screenToFlowPosition],
  )

  const handlePaneMouseLeave = useCallback(() => {
    updateMyPresence({ cursor: null })
  }, [updateMyPresence])

  /**
   * Exports the current canvas as a PNG download — `getNodesBounds`/
   * `getViewportForBounds` (`@xyflow/react`) plus `toPng` (`html-to-image`)
   * is the library's own documented pattern for rasterizing a flow: compute
   * the real bounding box of every node, derive the pan/zoom transform that
   * fits that box into a target pixel size, apply it to a clone of
   * `.react-flow__viewport` (the actual transformed layer nodes/edges
   * render inside — not `.react-flow__renderer`, which also includes
   * unrelated UI like the selection rectangle), and rasterize that clone.
   * Exports at the diagram's own authored scale (`minZoom`/`maxZoom` of `1`,
   * `padding` of `0`) rather than fitting to whatever zoom level the user
   * happens to be viewing at — `EXPORT_IMAGE_PADDING_PX` is added directly
   * into the target pixel dimensions instead, so the result is a
   * predictable, tight crop around the diagram plus a fixed margin.
   *
   * No-ops when the canvas is empty (`getNodesBounds([])` has no meaningful
   * box to fit) or the viewport DOM node isn't mounted yet. Failures (e.g. a
   * `toPng` rejection from an unsupported browser) are logged, not silently
   * swallowed — this app has no toast/notification system to surface a
   * user-facing error for a background-free, click-triggered export, and a
   * failed export has no other side effect to undo.
   */
  const handleExportImage = useCallback(async () => {
    const container = canvasContainerRef.current
    if (!container || nodes.length === 0) {
      return
    }

    const viewportElement = container.querySelector<HTMLElement>(".react-flow__viewport")
    if (!viewportElement) {
      return
    }

    setIsExportingImage(true)

    try {
      const bounds = getNodesBounds(nodes)
      const imageWidth = Math.round(bounds.width + EXPORT_IMAGE_PADDING_PX * 2)
      const imageHeight = Math.round(bounds.height + EXPORT_IMAGE_PADDING_PX * 2)
      const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 1, 1, 0)

      const dataUrl = await toPng(viewportElement, {
        backgroundColor: "var(--bg-base)",
        width: imageWidth,
        height: imageHeight,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      })

      const link = document.createElement("a")
      link.download = `ghost-ai-canvas-${projectId}.png`
      link.href = dataUrl
      link.click()
    } catch (error) {
      console.error("Failed to export the canvas as an image", error)
    } finally {
      setIsExportingImage(false)
    }
  }, [nodes, projectId])

  /**
   * Jumps the viewport to a search-selected node (spec 36, Canvas Node
   * Search) and briefly highlights it. `getNodesBounds([node])` — the exact
   * same `@xyflow/react` utility `handleExportImage` above already imports
   * and calls (there, on the full `nodes` array for the whole-diagram
   * bounding box) — is called here with a single-element array to get that
   * one node's own `{ x, y, width, height }` box, so a node with no
   * `width`/`height` yet doesn't need its own hand-rolled fallback. `center`
   * is that box's own center, passed to `setCenter` (the same `useReactFlow()`
   * call already destructured above for `screenToFlowPosition`/`zoomIn`/
   * `zoomOut`/`fitView`) with `SEARCH_JUMP_ZOOM` and the existing
   * `ZOOM_TRANSITION_DURATION_MS` — reused as-is rather than inventing a
   * second duration constant. See spec 36's Analyst Brief, Open Questions #1.
   *
   * Any previously-pending highlight-clear timeout is cleared first, so two
   * rapid searches in a row never leave two nodes highlighted at once or a
   * stale clear firing late and wiping out the newer highlight.
   */
  const handleJumpToNode = useCallback(
    (node: CanvasNodeAlias) => {
      const bounds = getNodesBounds([node])
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      setCenter(center.x, center.y, { zoom: SEARCH_JUMP_ZOOM, duration: ZOOM_TRANSITION_DURATION_MS })

      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }
      setHighlightedNodeId(node.id)
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedNodeId(null)
        highlightTimeoutRef.current = null
      }, SEARCH_HIGHLIGHT_DURATION_MS)
    },
    [setCenter],
  )

  /**
   * Saves the current canvas as a new named `CustomTemplate` (spec 33) —
   * `POST /api/templates` with this component's own live `nodes`/`edges`
   * (the same values `handleExportImage`/`onCanvasGraphChange` already
   * read). Returns whether the save succeeded so `SaveTemplateDialog` (a
   * presentational component, per `ShareDialog`'s convention) knows whether
   * to close itself — the same `Promise<boolean>` return shape
   * `useCollaborators()`'s `invite`/`remove` already use.
   */
  const handleSaveTemplate = useCallback(
    async (name: string, description: string): Promise<boolean> => {
      setIsSavingTemplate(true)
      setSaveTemplateError(null)
      try {
        const response = await fetch("/api/templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, description: description || undefined, nodes, edges }),
        })

        if (!response.ok) {
          const body: { error?: string } = await response.json().catch(() => ({}))
          setSaveTemplateError(body.error ?? "Failed to save the template.")
          return false
        }

        return true
      } catch {
        setSaveTemplateError("Failed to save the template. Please check your connection and try again.")
        return false
      } finally {
        setIsSavingTemplate(false)
      }
    },
    [nodes, edges],
  )

  return (
    <CanvasNodeUpdateContext.Provider value={updateNodeData}>
      <CanvasEdgeUpdateContext.Provider value={updateEdgeData}>
        <CanvasSearchHighlightContext.Provider value={highlightedNodeId}>
          <NodeCommentsContext.Provider value={nodeCommentsResult}>
            <div ref={canvasContainerRef} className="relative h-full w-full">
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
                onPaneMouseMove={handlePaneMouseMove}
                onPaneMouseLeave={handlePaneMouseLeave}
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
                onExportImage={handleExportImage}
                isExportingImage={isExportingImage}
                canExportImage={nodes.length > 0}
                onOpenSaveTemplate={() => setIsSaveTemplateDialogOpen(true)}
                nodes={nodes}
                onJumpToNode={handleJumpToNode}
              />
              <StarterTemplatesModal
                open={isTemplatesModalOpen}
                onOpenChange={setIsTemplatesModalOpen}
                onImport={handleImportTemplate}
              />
              <SaveTemplateDialog
                open={isSaveTemplateDialogOpen}
                onOpenChange={setIsSaveTemplateDialogOpen}
                onSave={handleSaveTemplate}
                isSaving={isSavingTemplate}
                error={saveTemplateError}
              />
              <PresenceAvatars />
              <LiveCursors flowToScreenPosition={flowToScreenPosition} />
            </div>
          </NodeCommentsContext.Provider>
        </CanvasSearchHighlightContext.Provider>
      </CanvasEdgeUpdateContext.Provider>
    </CanvasNodeUpdateContext.Provider>
  )
}
