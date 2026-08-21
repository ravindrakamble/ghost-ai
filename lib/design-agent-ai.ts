import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { generateObject, jsonSchema, type JSONSchema7 } from "ai"
import { CANVAS_SHAPES, SHAPE_DEFAULT_SIZES, NODE_MIN_SIZE, generateEdgeId, generateNodeId } from "@/lib/canvas-shapes"
import { NODE_COLORS, type NodeShape } from "@/types/canvas"

/**
 * Gemini-backed interpretation of a design prompt into a bounded set of
 * canvas actions, per spec 23's Analyst Brief.
 *
 * Uses the `ai` package's `generateObject` + `jsonSchema()` helper — plain
 * JSON Schema, not Zod (`zod` stays out of this spec's diff, per the
 * brief's Open Questions #1, which explicitly defers adding it until a
 * later spec asks for it by name). `jsonSchema()`'s own `validate` callback
 * is this codebase's existing manual-type-guard convention
 * (`isValidRawAction`/`isRawDesignAgentActionsResponse` below), wired
 * directly into `generateObject`'s own validation path — a response that
 * fails it makes `generateObject` itself reject, surfacing to
 * `trigger/design-agent.ts` as a genuine upstream failure rather than being
 * silently accepted or partially trusted.
 */

const GEMINI_MODEL_ID = "gemini-3.6-flash"

const globalForGemini = globalThis as unknown as {
  googleProvider?: ReturnType<typeof createGoogleGenerativeAI>
}

function requireGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to the environment to interpret design prompts with Gemini.",
    )
  }
  return key
}

/**
 * Lazily instantiated, cached per process — same posture as
 * `lib/liveblocks.ts#getLiveblocksClient`/`lib/canvas-blob.ts`'s
 * `requireBlobToken`, so a missing `GEMINI_API_KEY` only ever surfaces as a
 * handled error from the one task that actually calls Gemini, not at module
 * import time (`next build`'s page-data collection merely imports route
 * modules, it never invokes this).
 */
function getGoogleProvider(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!globalForGemini.googleProvider) {
    globalForGemini.googleProvider = createGoogleGenerativeAI({ apiKey: requireGeminiApiKey() })
  }
  return globalForGemini.googleProvider
}

/** The 7 canvas mutation kinds the design agent may generate — no others. */
export const DESIGN_AGENT_ACTION_KINDS = [
  "addNode",
  "moveNode",
  "resizeNode",
  "updateNodeData",
  "deleteNode",
  "addEdge",
  "deleteEdge",
] as const
export type DesignAgentActionKind = (typeof DESIGN_AGENT_ACTION_KINDS)[number]

/**
 * Named color choices offered to the model, in the same order as
 * `NODE_COLORS` (`types/canvas.ts`) so index lookups stay in sync — mirrors
 * `ui-context.md`'s Node Color Palette table row order. Kept local to this
 * module rather than added to `types/canvas.ts`: these names are a
 * presentation detail of prompting the model, not part of the canvas's own
 * type vocabulary. Asking the model for a color *name* (resolved to a real
 * `NODE_COLORS` pair by index below) rather than raw hex values guarantees
 * every `color`/`textColor` the model can produce is one of the 8 real,
 * correctly-paired palette entries — never an invented value, and never a
 * mismatched fill/text pairing — satisfying acceptance criterion 4 by
 * construction rather than by post-hoc clamping.
 */
const NODE_COLOR_NAMES = ["neutral", "blue", "purple", "orange", "red", "pink", "green", "teal"] as const
type NodeColorName = (typeof NODE_COLOR_NAMES)[number]

/** Current canvas graph, summarized as prompt context for the model. */
export interface DesignAgentGraphNode {
  id: string
  label: string
  shape: NodeShape
  x: number
  y: number
}

export interface DesignAgentGraphEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  label?: string
}

export interface DesignAgentGraphSummary {
  nodes: DesignAgentGraphNode[]
  edges: DesignAgentGraphEdge[]
}

export interface AddNodeAction {
  kind: "addNode"
  nodeId: string
  shape: NodeShape
  label: string
  color: string
  textColor: string
  width: number
  height: number
  x: number
  y: number
}

export interface MoveNodeAction {
  kind: "moveNode"
  nodeId: string
  x: number
  y: number
}

export interface ResizeNodeAction {
  kind: "resizeNode"
  nodeId: string
  width: number
  height: number
}

export interface UpdateNodeDataAction {
  kind: "updateNodeData"
  nodeId: string
  label?: string
  color?: string
  textColor?: string
}

export interface DeleteNodeAction {
  kind: "deleteNode"
  nodeId: string
}

export interface AddEdgeAction {
  kind: "addEdge"
  edgeId: string
  sourceNodeId: string
  targetNodeId: string
  label?: string
}

export interface DeleteEdgeAction {
  kind: "deleteEdge"
  edgeId: string
}

/**
 * The full, bounded set of canvas mutations the design agent may produce —
 * exactly the 7 kinds `DESIGN_AGENT_ACTION_KINDS` names, nothing else (e.g.
 * no wholesale clear-and-replace). See acceptance criterion 3.
 */
export type DesignAgentAction =
  | AddNodeAction
  | MoveNodeAction
  | ResizeNodeAction
  | UpdateNodeDataAction
  | DeleteNodeAction
  | AddEdgeAction
  | DeleteEdgeAction

/**
 * Raw, not-yet-normalized shape of a single action as returned by Gemini.
 * `nodeId`/`edgeId` here may be a model-invented *local* reference (for a
 * node/edge being created in this same response) or a real ID copied from
 * the current-graph context passed into the prompt — `normalizeActions`
 * below resolves the difference.
 */
interface RawDesignAgentAction {
  kind: DesignAgentActionKind
  nodeId?: string
  edgeId?: string
  sourceNodeId?: string
  targetNodeId?: string
  shape?: string
  colorName?: string
  label?: string
  x?: number
  y?: number
  width?: number
  height?: number
}

interface RawDesignAgentActionsResponse {
  actions: RawDesignAgentAction[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isNodeColorName(value: unknown): value is NodeColorName {
  return typeof value === "string" && (NODE_COLOR_NAMES as readonly string[]).includes(value)
}

function isNodeShape(value: unknown): value is NodeShape {
  return typeof value === "string" && (CANVAS_SHAPES as readonly string[]).includes(value)
}

/**
 * Per-kind required-field check. The JSON Schema below (`properties`/
 * `enum`) already constrains the *shape* of each field when present, but it
 * can't express "these fields are required only when `kind` is X" — that
 * per-kind contract is enforced here, the actual authoritative gate wired
 * into `jsonSchema()`'s `validate` option.
 */
function isValidRawAction(value: unknown): value is RawDesignAgentAction {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>

  if (typeof candidate.kind !== "string") return false
  if (!(DESIGN_AGENT_ACTION_KINDS as readonly string[]).includes(candidate.kind)) return false

  const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0
  const isOptionalString = (v: unknown): v is string | undefined => v === undefined || typeof v === "string"

  switch (candidate.kind as DesignAgentActionKind) {
    case "addNode":
      return (
        isNonEmptyString(candidate.nodeId) &&
        isNodeShape(candidate.shape) &&
        isNodeColorName(candidate.colorName) &&
        typeof candidate.label === "string" &&
        isFiniteNumber(candidate.x) &&
        isFiniteNumber(candidate.y)
      )
    case "moveNode":
      return isNonEmptyString(candidate.nodeId) && isFiniteNumber(candidate.x) && isFiniteNumber(candidate.y)
    case "resizeNode":
      return isNonEmptyString(candidate.nodeId) && isFiniteNumber(candidate.width) && isFiniteNumber(candidate.height)
    case "updateNodeData":
      if (!isNonEmptyString(candidate.nodeId)) return false
      if (!isOptionalString(candidate.label)) return false
      if (candidate.colorName !== undefined && !isNodeColorName(candidate.colorName)) return false
      return candidate.label !== undefined || candidate.colorName !== undefined
    case "deleteNode":
      return isNonEmptyString(candidate.nodeId)
    case "addEdge":
      return (
        isNonEmptyString(candidate.edgeId) &&
        isNonEmptyString(candidate.sourceNodeId) &&
        isNonEmptyString(candidate.targetNodeId) &&
        isOptionalString(candidate.label)
      )
    case "deleteEdge":
      return isNonEmptyString(candidate.edgeId)
    default:
      return false
  }
}

function isRawDesignAgentActionsResponse(value: unknown): value is RawDesignAgentActionsResponse {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.actions) && candidate.actions.every(isValidRawAction)
}

/**
 * Per-kind variants, combined via `anyOf` below, each with an exact
 * `properties`/`required`/`additionalProperties: false` set. A single flat
 * object schema (every field optional except `kind`) was tried first and
 * found — via a live smoke test against a real Gemini account, not
 * something a mocked test could have caught — to make the model populate
 * every declared property on every action regardless of `kind` (e.g. an
 * `addNode` action carrying a stray `sourceNodeId: ""`/`width: 0`), since
 * nothing in the schema itself said those fields didn't belong there. A
 * discriminated `anyOf` gives the model — and Gemini's native structured-
 * output/controlled-generation mode specifically — an actual per-kind
 * contract to follow, not just prose instructions in the prompt.
 */
const ADD_NODE_ACTION_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["addNode"] },
    nodeId: { type: "string" },
    shape: { type: "string", enum: [...CANVAS_SHAPES] },
    colorName: { type: "string", enum: [...NODE_COLOR_NAMES] },
    label: { type: "string" },
    x: { type: "number" },
    y: { type: "number" },
  },
  required: ["kind", "nodeId", "shape", "colorName", "label", "x", "y"],
  additionalProperties: false,
}

const MOVE_NODE_ACTION_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["moveNode"] },
    nodeId: { type: "string" },
    x: { type: "number" },
    y: { type: "number" },
  },
  required: ["kind", "nodeId", "x", "y"],
  additionalProperties: false,
}

const RESIZE_NODE_ACTION_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["resizeNode"] },
    nodeId: { type: "string" },
    width: { type: "number" },
    height: { type: "number" },
  },
  required: ["kind", "nodeId", "width", "height"],
  additionalProperties: false,
}

const UPDATE_NODE_DATA_ACTION_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["updateNodeData"] },
    nodeId: { type: "string" },
    label: { type: "string" },
    colorName: { type: "string", enum: [...NODE_COLOR_NAMES] },
  },
  required: ["kind", "nodeId"],
  additionalProperties: false,
}

const DELETE_NODE_ACTION_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["deleteNode"] },
    nodeId: { type: "string" },
  },
  required: ["kind", "nodeId"],
  additionalProperties: false,
}

const ADD_EDGE_ACTION_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["addEdge"] },
    edgeId: { type: "string" },
    sourceNodeId: { type: "string" },
    targetNodeId: { type: "string" },
    label: { type: "string" },
  },
  required: ["kind", "edgeId", "sourceNodeId", "targetNodeId"],
  additionalProperties: false,
}

const DELETE_EDGE_ACTION_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["deleteEdge"] },
    edgeId: { type: "string" },
  },
  required: ["kind", "edgeId"],
  additionalProperties: false,
}

const DESIGN_AGENT_ACTIONS_JSON_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        anyOf: [
          ADD_NODE_ACTION_SCHEMA,
          MOVE_NODE_ACTION_SCHEMA,
          RESIZE_NODE_ACTION_SCHEMA,
          UPDATE_NODE_DATA_ACTION_SCHEMA,
          DELETE_NODE_ACTION_SCHEMA,
          ADD_EDGE_ACTION_SCHEMA,
          DELETE_EDGE_ACTION_SCHEMA,
        ],
      },
    },
  },
  required: ["actions"],
}

const designAgentActionsSchema = jsonSchema<RawDesignAgentActionsResponse>(DESIGN_AGENT_ACTIONS_JSON_SCHEMA, {
  validate: (value) =>
    isRawDesignAgentActionsResponse(value)
      ? { success: true, value }
      : {
          success: false,
          error: new Error("Gemini response did not match the expected design-agent action schema"),
        },
})

function colorNameToPair(colorName: NodeColorName): { color: string; textColor: string } {
  const index = NODE_COLOR_NAMES.indexOf(colorName)
  return NODE_COLORS[index] ?? NODE_COLORS[0]
}

/**
 * Per-kind required-field documentation for the model. The JSON Schema fed
 * to `generateObject` (`DESIGN_AGENT_ACTIONS_JSON_SCHEMA`) only requires
 * `kind` — it can't express "these other fields are required only when
 * `kind` is X" — so without this, the model has no signal at all about
 * which fields each action kind actually needs and produces
 * schema-shaped-but-semantically-incomplete actions (e.g. an `addNode` with
 * no `x`/`y`/`shape`) that `isValidRawAction` correctly rejects. Found via a
 * live smoke test against a real Gemini account — every mocked unit test
 * supplies a complete, already-valid response, so this gap was invisible to
 * the test suite.
 */
const ACTION_FIELD_GUIDE = [
  `addNode: { kind, nodeId (a short local id you invent), shape (one of: ${CANVAS_SHAPES.join(", ")}), colorName (one of: ${NODE_COLOR_NAMES.join(", ")}), label, x, y } — all fields required.`,
  "moveNode: { kind, nodeId (an existing node's real id), x, y } — all fields required.",
  "resizeNode: { kind, nodeId (an existing node's real id), width, height } — all fields required.",
  "updateNodeData: { kind, nodeId (an existing node's real id), label?, colorName? } — at least one of label/colorName must be present.",
  "deleteNode: { kind, nodeId (an existing node's real id) } — no other fields.",
  "addEdge: { kind, edgeId (a short local id you invent), sourceNodeId, targetNodeId (each an existing node's real id, or a local id you invented earlier in this same response), label? } — sourceNodeId/targetNodeId required.",
  "deleteEdge: { kind, edgeId (an existing edge's real id) } — no other fields.",
].join("\n")

function buildPrompt(prompt: string, currentGraph: DesignAgentGraphSummary): string {
  return [
    "You are Ghost AI, a system-design assistant that edits a shared, real-time architecture diagram.",
    `The diagram currently has these nodes: ${JSON.stringify(currentGraph.nodes)}`,
    `and these edges: ${JSON.stringify(currentGraph.edges)}`,
    `The user's request is: ${prompt}`,
    "Respond with a bounded list of actions that edit this diagram to satisfy the request.",
    `Each action must be one of exactly these 7 kinds, with exactly the fields listed below (no other fields, no missing required fields):\n${ACTION_FIELD_GUIDE}`,
    "Only reference existing node/edge IDs from the lists above, or short local IDs you invent for nodes/edges you are adding in this same response (they will be replaced with real IDs).",
    "Prefer editing/extending the existing diagram over replacing it — only delete nodes or edges the request clearly asks to remove.",
    "Space newly added nodes so they do not overlap existing nodes or each other (at least 220 horizontal / 160 vertical units apart).",
  ].join("\n\n")
}

export interface InterpretDesignPromptInput {
  prompt: string
  currentGraph: DesignAgentGraphSummary
}

/**
 * Calls Gemini to turn a design prompt (plus the current canvas graph, for
 * context — acceptance criterion 2) into a validated list of canvas
 * actions, then normalizes model-chosen local node/edge IDs into real,
 * collision-safe IDs (`generateNodeId`/`generateEdgeId`) and resolves
 * references between actions in the same batch (e.g. an `addEdge` action
 * connecting to a node added earlier in the same response).
 */
export async function interpretDesignPrompt(input: InterpretDesignPromptInput): Promise<DesignAgentAction[]> {
  const provider = getGoogleProvider()

  const { object } = await generateObject({
    model: provider(GEMINI_MODEL_ID),
    schema: designAgentActionsSchema,
    prompt: buildPrompt(input.prompt, input.currentGraph),
    // gemini-3.6-flash reasons before producing structured output and
    // rejects thinkingBudget: 0 outright ("Request contains an invalid
    // argument") — found via a live smoke test against a real Gemini
    // account, not something a mocked test could have caught. A generous
    // budget keeps reasoning tokens from truncating the JSON response
    // before it completes.
    maxOutputTokens: 8192,
  })

  return normalizeActions(object.actions, input.currentGraph)
}

/**
 * Resolves model-chosen local IDs into real ones and drops any action whose
 * reference doesn't resolve to either an existing graph node/edge or one
 * newly created earlier in this same batch — a single hallucinated
 * reference shouldn't invalidate an otherwise-valid batch of independently
 * correct actions. See the brief's Open Questions #9 ("actions apply
 * surgically against the current graph").
 */
function normalizeActions(
  rawActions: RawDesignAgentAction[],
  currentGraph: DesignAgentGraphSummary,
): DesignAgentAction[] {
  const knownNodeIds = new Set(currentGraph.nodes.map((node) => node.id))
  const knownEdgeIds = new Set(currentGraph.edges.map((edge) => edge.id))
  const nodeIdMap = new Map<string, string>()
  const edgeIdMap = new Map<string, string>()

  function resolveNodeId(localId: string): string | undefined {
    return nodeIdMap.get(localId) ?? (knownNodeIds.has(localId) ? localId : undefined)
  }

  function resolveEdgeId(localId: string): string | undefined {
    return edgeIdMap.get(localId) ?? (knownEdgeIds.has(localId) ? localId : undefined)
  }

  const actions: DesignAgentAction[] = []

  for (const raw of rawActions) {
    switch (raw.kind) {
      case "addNode": {
        const shape = raw.shape as NodeShape
        const { color, textColor } = colorNameToPair(raw.colorName as NodeColorName)
        const size = SHAPE_DEFAULT_SIZES[shape]
        const realId = generateNodeId(shape)
        nodeIdMap.set(raw.nodeId as string, realId)
        actions.push({
          kind: "addNode",
          nodeId: realId,
          shape,
          label: raw.label as string,
          color,
          textColor,
          width: size.width,
          height: size.height,
          x: raw.x as number,
          y: raw.y as number,
        })
        break
      }
      case "moveNode": {
        const nodeId = resolveNodeId(raw.nodeId as string)
        if (!nodeId) break
        actions.push({ kind: "moveNode", nodeId, x: raw.x as number, y: raw.y as number })
        break
      }
      case "resizeNode": {
        const nodeId = resolveNodeId(raw.nodeId as string)
        if (!nodeId) break
        actions.push({
          kind: "resizeNode",
          nodeId,
          width: Math.max(raw.width as number, NODE_MIN_SIZE.width),
          height: Math.max(raw.height as number, NODE_MIN_SIZE.height),
        })
        break
      }
      case "updateNodeData": {
        const nodeId = resolveNodeId(raw.nodeId as string)
        if (!nodeId) break
        const update: UpdateNodeDataAction = { kind: "updateNodeData", nodeId }
        if (raw.label !== undefined) update.label = raw.label
        if (raw.colorName !== undefined) {
          const pair = colorNameToPair(raw.colorName as NodeColorName)
          update.color = pair.color
          update.textColor = pair.textColor
        }
        actions.push(update)
        break
      }
      case "deleteNode": {
        const nodeId = resolveNodeId(raw.nodeId as string)
        if (!nodeId) break
        actions.push({ kind: "deleteNode", nodeId })
        break
      }
      case "addEdge": {
        const sourceNodeId = resolveNodeId(raw.sourceNodeId as string)
        const targetNodeId = resolveNodeId(raw.targetNodeId as string)
        if (!sourceNodeId || !targetNodeId) break
        const realId = generateEdgeId()
        edgeIdMap.set(raw.edgeId as string, realId)
        actions.push({
          kind: "addEdge",
          edgeId: realId,
          sourceNodeId,
          targetNodeId,
          ...(raw.label !== undefined ? { label: raw.label } : {}),
        })
        break
      }
      case "deleteEdge": {
        const edgeId = resolveEdgeId(raw.edgeId as string)
        if (!edgeId) break
        actions.push({ kind: "deleteEdge", edgeId })
        break
      }
      default:
        break
    }
  }

  return actions
}
