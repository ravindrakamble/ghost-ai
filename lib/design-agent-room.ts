import { mutateFlow } from "@liveblocks/react-flow/node"
import type { Json } from "@liveblocks/node"
import { getLiveblocksClient } from "@/lib/liveblocks"
import { CANVAS_SHAPES } from "@/lib/canvas-shapes"
import { CANVAS_NODE_TYPE, CANVAS_EDGE_TYPE } from "@/types/canvas"
import type {
  CanvasEdge as CanvasEdgeAlias,
  CanvasNode as CanvasNodeAlias,
  NodeShape,
} from "@/types/canvas"
import type { AiStatusMessage, AiStatusStage } from "@/types/tasks"
import type { DesignAgentAction, DesignAgentGraphEdge, DesignAgentGraphNode, DesignAgentGraphSummary } from "@/lib/design-agent-ai"

/**
 * Server-side Liveblocks room mutation/status/presence for the design
 * agent, per spec 23's Analyst Brief — reuses `getLiveblocksClient()`
 * (spec 10) rather than constructing a second Liveblocks Node client.
 *
 * Canvas mutations go through `@liveblocks/react-flow/node`'s own
 * `mutateFlow` helper, not a hand-rolled `getLiveblocksClient().
 * mutateStorage(...)` callback that reconstructs the client's Storage
 * layout by hand. `mutateFlow` wraps exactly that same `mutateStorage` call
 * internally (verified directly against its installed source,
 * `@liveblocks/react-flow/dist/node.js`) but reuses this package's own
 * `toLiveblocksInternalNode`/`toLiveblocksInternalEdge` conversion — the
 * exact conversion `useLiveblocksFlow` relies on client-side for the same
 * default `storageKey: "flow"` schema — so this module can't drift out of
 * sync with what `components/editor/canvas.tsx`'s real, unmodified
 * `useLiveblocksFlow<CanvasNodeAlias, CanvasEdgeAlias>({...})` call reads.
 * This is what satisfies acceptance criterion 6 with certainty rather than
 * best-effort mirroring.
 */

export const GHOST_AI_USER_ID = "ghost-ai-agent"
const GHOST_AI_USER_NAME = "Ghost AI"
/** `--accent-ai` token, per `ui-context.md`'s Theme table — not a value from
 * spec 10's `CURSOR_COLORS` hash palette, which is reserved for real human
 * participants. See the brief's Open Questions #3. */
const GHOST_AI_USER_COLOR = "#6457f9"

/**
 * TTL (seconds) for the "thinking"/in-progress presence entry, matching
 * `trigger.config.ts`'s `maxDuration` — if the task crashes hard before its
 * own `finally` block can clear presence, this entry expires on its own
 * rather than lingering indefinitely.
 */
const ACTIVE_PRESENCE_TTL_SECONDS = 60
/**
 * TTL (seconds) for the final "cleared" presence entry — Liveblocks'
 * documented minimum (`setPresence`'s own `ttl` doc: "minimum: 2").
 */
const CLEARED_PRESENCE_TTL_SECONDS = 2

/**
 * Extends `Record<string, Json | undefined>` so this is structurally
 * assignable to `@liveblocks/node`'s `SetPresenceOptions.data: JsonObject`
 * — the same "index-signature-carrying interface" convention
 * `CanvasNodeData`/`CanvasEdgeData` (`types/canvas.ts`) use for their own
 * analogous JSON-compatibility requirement (there against `Record<string,
 * unknown>`, since React Flow's own `Node<T>` generic doesn't require
 * `Json`-narrowness the way `@liveblocks/node`'s presence/event APIs do).
 * Field shape matches the pinned `Presence` type in `liveblocks.config.ts`
 * exactly.
 */
export interface DesignAgentPresence extends Record<string, Json | undefined> {
  thinking: boolean
  cursor: { x: number; y: number } | null
}

async function setGhostAiPresence(roomId: string, presence: DesignAgentPresence, ttlSeconds: number): Promise<void> {
  await getLiveblocksClient().setPresence(
    roomId,
    {
      userId: GHOST_AI_USER_ID,
      data: presence,
      userInfo: { name: GHOST_AI_USER_NAME, color: GHOST_AI_USER_COLOR, avatar: "" },
      ttl: ttlSeconds,
    },
  )
}

/** Sets the AI's presence for the duration of an in-progress run. */
export async function setDesignAgentPresence(roomId: string, presence: DesignAgentPresence): Promise<void> {
  await setGhostAiPresence(roomId, presence, ACTIVE_PRESENCE_TTL_SECONDS)
}

/**
 * Clears the AI's presence (`thinking: false`, `cursor: null`) once a run
 * finishes, whether it succeeded or failed — acceptance criterion 8/9.
 */
export async function clearDesignAgentPresence(roomId: string): Promise<void> {
  await setGhostAiPresence(roomId, { thinking: false, cursor: null }, CLEARED_PRESENCE_TTL_SECONDS)
}

/**
 * Now the canonical `types/tasks.ts#AiStatusStage`, formalized by spec 24 —
 * this was originally a spec-23-local duplicate (`"start" | "processing" |
 * "complete" | "error"`) broadcast ahead of that schema existing; re-exported
 * under its original name so nothing importing it from this module needs to
 * change. See spec 24's Analyst Brief, Open Questions #2.
 */
export type DesignAgentStatusStage = AiStatusStage

/**
 * `ai-status-feed` payload, now built directly on the canonical
 * `types/tasks.ts#AiStatusMessage` shape rather than an independently-typed
 * duplicate — this module always sends a required `text: string`, which
 * trivially satisfies `AiStatusMessage`'s optional `text?: string` (a
 * required field is a valid instance of an optional one). Also extends
 * `Record<string, Json | undefined>` so this stays structurally assignable
 * to `@liveblocks/node`'s `broadcastEvent` payload type.
 */
export interface DesignAgentStatusMessage extends AiStatusMessage, Record<string, Json | undefined> {
  text: string
  stage: DesignAgentStatusStage
}

/** Broadcasts a status update to `ai-status-feed` (ephemeral, no Storage write). */
export async function broadcastDesignAgentStatus(roomId: string, message: DesignAgentStatusMessage): Promise<void> {
  await getLiveblocksClient().broadcastEvent(roomId, message)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function parseGraphNode(id: string, value: unknown): DesignAgentGraphNode | null {
  if (typeof value !== "object" || value === null) return null
  const candidate = value as Record<string, unknown>

  const position = candidate.position
  if (typeof position !== "object" || position === null) return null
  const pos = position as Record<string, unknown>
  if (!isFiniteNumber(pos.x) || !isFiniteNumber(pos.y)) return null

  const data = candidate.data
  const dataObject = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {}
  const shape =
    typeof dataObject.shape === "string" && (CANVAS_SHAPES as readonly string[]).includes(dataObject.shape)
      ? (dataObject.shape as NodeShape)
      : "rectangle"
  const label = typeof dataObject.label === "string" ? dataObject.label : ""

  return { id, label, shape, x: pos.x, y: pos.y }
}

function parseGraphEdge(id: string, value: unknown): DesignAgentGraphEdge | null {
  if (typeof value !== "object" || value === null) return null
  const candidate = value as Record<string, unknown>

  if (typeof candidate.source !== "string" || typeof candidate.target !== "string") return null

  const data = candidate.data
  const dataObject = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {}
  const label = typeof dataObject.label === "string" ? dataObject.label : undefined

  return {
    id,
    sourceNodeId: candidate.source,
    targetNodeId: candidate.target,
    ...(label !== undefined ? { label } : {}),
  }
}

/**
 * Reads the room's **current** Liveblocks Storage content — not the
 * spec-21 Vercel Blob autosave snapshot, which can lag up to
 * `CANVAS_AUTOSAVE_DEBOUNCE_MS` behind live edits — satisfying
 * `architecture-context.md`'s "current canvas state" AI generation input
 * and acceptance criterion 2. A room with no `"flow"` Storage key yet (a
 * brand-new, never-edited canvas) or a malformed entry degrades to an empty
 * graph rather than throwing — this is legitimate "nothing here yet" state,
 * not a failure. A genuine upstream failure (network/auth/room-not-found)
 * is left to propagate, matching `lib/canvas-blob.ts#fetchCanvasSnapshot`'s
 * established "only 'nothing usable' cases resolve to empty, real errors
 * throw" convention.
 */
export async function getCurrentDesignGraph(roomId: string): Promise<DesignAgentGraphSummary> {
  const raw: unknown = await getLiveblocksClient().getStorageDocument(roomId, "json")

  if (typeof raw !== "object" || raw === null) return { nodes: [], edges: [] }
  const root = raw as Record<string, unknown>

  const flow = root.flow
  if (typeof flow !== "object" || flow === null) return { nodes: [], edges: [] }
  const flowObject = flow as Record<string, unknown>

  const nodesRecord =
    typeof flowObject.nodes === "object" && flowObject.nodes !== null
      ? (flowObject.nodes as Record<string, unknown>)
      : {}
  const edgesRecord =
    typeof flowObject.edges === "object" && flowObject.edges !== null
      ? (flowObject.edges as Record<string, unknown>)
      : {}

  const nodes = Object.entries(nodesRecord)
    .map(([id, value]) => parseGraphNode(id, value))
    .filter((node): node is DesignAgentGraphNode => node !== null)
  const edges = Object.entries(edgesRecord)
    .map(([id, value]) => parseGraphEdge(id, value))
    .filter((edge): edge is DesignAgentGraphEdge => edge !== null)

  return { nodes, edges }
}

/**
 * Applies the full generated action batch inside one atomic `mutateStorage`
 * callback (via `mutateFlow`, which wraps exactly one such call) — mirrors
 * spec 18's "one atomic Storage commit" precedent for template import, so a
 * connected collaborator never observes a transient, partially-applied
 * state. See the brief's Open Questions #8. Every action targets a specific
 * node/edge ID (never a wholesale clear-and-replace) — Open Questions #9.
 */
export async function applyDesignAgentActions(roomId: string, actions: DesignAgentAction[]): Promise<void> {
  if (actions.length === 0) return

  await mutateFlow<CanvasNodeAlias, CanvasEdgeAlias>({ client: getLiveblocksClient(), roomId }, (flow) => {
    for (const action of actions) {
      switch (action.kind) {
        case "addNode":
          flow.addNode({
            id: action.nodeId,
            type: CANVAS_NODE_TYPE,
            position: { x: action.x, y: action.y },
            width: action.width,
            height: action.height,
            data: {
              label: action.label,
              color: action.color,
              textColor: action.textColor,
              shape: action.shape,
            },
          })
          break
        case "moveNode":
          flow.updateNode(action.nodeId, { position: { x: action.x, y: action.y } })
          break
        case "resizeNode":
          flow.updateNode(action.nodeId, { width: action.width, height: action.height })
          break
        case "updateNodeData": {
          const dataUpdate: Partial<CanvasNodeAlias["data"]> = {}
          if (action.label !== undefined) dataUpdate.label = action.label
          if (action.color !== undefined) dataUpdate.color = action.color
          if (action.textColor !== undefined) dataUpdate.textColor = action.textColor
          flow.updateNodeData(action.nodeId, dataUpdate)
          break
        }
        case "deleteNode":
          flow.removeNode(action.nodeId)
          break
        case "addEdge":
          flow.addEdge({
            id: action.edgeId,
            type: CANVAS_EDGE_TYPE,
            source: action.sourceNodeId,
            target: action.targetNodeId,
            data: action.label !== undefined ? { label: action.label } : {},
          })
          break
        case "deleteEdge":
          flow.removeEdge(action.edgeId)
          break
        default:
          break
      }
    }
  })
}
