import { task, logger, metadata } from "@trigger.dev/sdk"
import { z } from "zod"
import {
  generateSpecMarkdown,
  type GenerateSpecGraphNode,
  type GenerateSpecGraphEdge,
} from "@/lib/generate-spec-ai"
import { AiChatMessageSchema, type AiChatMessage, type AiStatusStage, type AiStatusMessage } from "@/types/tasks"

/**
 * Payload accepted by the generate-spec task. `roomId`/`projectId` are the
 * same value by convention (spec 10, 11, 21, 22) — `app/api/ai/spec/route.ts`
 * is the boundary that derives and access-checks `roomId` before triggering,
 * populating this task's own `projectId` field from that already-trusted
 * value, never from anything a client separately claims (this spec's
 * acceptance criterion 1 — no client-supplied `projectId` is ever trusted).
 *
 * `chatHistory` reuses `AiChatMessage[]` (`types/tasks.ts`, spec 25)
 * unmodified — the room's full sender/role/content/timestamp chat context.
 * `nodes`/`edges` use the narrow structural graph-summary types from
 * `lib/generate-spec-ai.ts`, not the full `CanvasNode`/`CanvasEdge` React
 * Flow generics. See spec 27's Analyst Brief, Open Questions #2 and #7.
 */
export interface GenerateSpecPayload {
  projectId: string
  roomId: string
  chatHistory: AiChatMessage[]
  nodes: GenerateSpecGraphNode[]
  edges: GenerateSpecGraphEdge[]
}

export interface GenerateSpecResult {
  roomId: string
  projectId: string
  /** The generated Markdown spec — returned as task output only, never persisted (this spec's own Scope Limit). */
  markdown: string
}

export const GENERATE_SPEC_TASK_ID = "generate-spec"

/**
 * Real Zod schemas the payload is validated against before Gemini is ever
 * called — the raw spec text's own explicit "validates input with Zod"
 * instruction, unlike spec 22/23's manual-type-guard precedent for the
 * design-agent task (acceptance criterion 6). Exported so
 * `app/api/ai/spec/route.ts` can validate the same shape from the client
 * request body without duplicating an equivalent schema
 * (`code-standards.md`'s "fix root causes — do not layer workarounds").
 */
export const GenerateSpecGraphNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  shape: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
})

export const GenerateSpecGraphEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  label: z.string().optional(),
})

const GenerateSpecPayloadSchema = z.object({
  projectId: z.string().min(1),
  roomId: z.string().min(1),
  chatHistory: z.array(AiChatMessageSchema),
  nodes: z.array(GenerateSpecGraphNodeSchema),
  edges: z.array(GenerateSpecGraphEdgeSchema),
})

/**
 * Publishes the run's progress via Trigger.dev's own native run-metadata
 * mechanism (`metadata.set`, `@trigger.dev/sdk`) — not a Liveblocks
 * `ai-status-feed` broadcast like `trigger/design-agent.ts`. Per spec 27's
 * Analyst Brief, Open Questions #1: the raw spec text's own wording ("run
 * metadata") is Trigger.dev's own vocabulary, this spec's Scope Limits
 * forbid frontend logic (a Liveblocks broadcast is only observable through
 * frontend wiring that doesn't exist for this flow yet), and reusing the
 * single, latest-message-only `ai-status-feed` for a second, structurally
 * different producer risked a viewer being unable to tell which flow's
 * status they were currently seeing. Consumable client-side later via
 * `@trigger.dev/react-hooks#useRealtimeRun`'s own metadata field, once a
 * future spec wires up the frontend. Reuses `AiStatusStage`/`AiStatusMessage`
 * (`types/tasks.ts`) for the payload shape only — a different transport, the
 * same status vocabulary spec 23/24 already established.
 */
function setGenerateSpecStatus(stage: AiStatusStage, text: string): void {
  metadata.set("status", { stage, text } satisfies AiStatusMessage)
}

/**
 * The task's actual run logic, exported separately from the `task(...)`
 * registration below so it's directly unit-testable without going through
 * Trigger.dev's runtime machinery — same "unit-testable without Trigger.dev's
 * runtime" reasoning spec 22/23 already established for
 * `trigger/design-agent.ts#runDesignAgent`.
 *
 * Validates the payload with a real Zod schema first — rejecting malformed
 * input (e.g. non-array `nodes`/`edges`, a wrong-shaped `chatHistory` entry)
 * before any status is published or Gemini is ever called (acceptance
 * criterion 6). Read-only: unlike `runDesignAgent` (which mutates Liveblocks
 * Storage), this task only reads the `nodes`/`edges`/`chatHistory` already
 * passed in — no canvas/Liveblocks room mutation of any kind.
 */
export async function runGenerateSpec(payload: GenerateSpecPayload): Promise<GenerateSpecResult> {
  const validated = GenerateSpecPayloadSchema.parse(payload)
  const { projectId, roomId, chatHistory, nodes, edges } = validated

  try {
    setGenerateSpecStatus("start", "Ghost AI is reading the canvas and chat history…")
    setGenerateSpecStatus("processing", "Ghost AI is drafting the technical spec…")

    const markdown = await generateSpecMarkdown({ chatHistory, nodes, edges })

    setGenerateSpecStatus("complete", "Ghost AI finished drafting the spec.")

    logger.log("generate-spec task completed", { roomId, projectId, markdownLength: markdown.length })

    return { roomId, projectId, markdown }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error("generate-spec task failed", { roomId, projectId, error: message })

    // A second failure here (e.g. the metadata call itself failing) must not
    // mask or replace the original error — caught and logged separately,
    // never swallowed silently. Mirrors `runDesignAgent`'s own
    // error-status-broadcast-can't-mask-the-real-error convention.
    try {
      setGenerateSpecStatus("error", "Ghost AI couldn't generate a spec. Please try again.")
    } catch (statusError) {
      logger.error("generate-spec failed to set its own error status", {
        roomId,
        projectId,
        error: statusError instanceof Error ? statusError.message : String(statusError),
      })
    }

    throw error
  }
}

export const generateSpecTask = task({
  id: GENERATE_SPEC_TASK_ID,
  run: runGenerateSpec,
})
