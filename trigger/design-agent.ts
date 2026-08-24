import { task, logger } from "@trigger.dev/sdk"
import { interpretDesignPrompt, type DesignAgentAction } from "@/lib/design-agent-ai"
import {
  applyDesignAgentActions,
  broadcastDesignAgentStatus,
  clearDesignAgentPresence,
  getCurrentDesignGraph,
  setDesignAgentPresence,
} from "@/lib/design-agent-room"

/**
 * Payload accepted by the design-agent task. `roomId`/`projectId` are the
 * same value by convention (spec 10, 11, 21) — `app/api/ai/design/route.ts`
 * is the boundary that enforces this before triggering, so this task only
 * ever sees an already-trusted `roomId`.
 */
export interface DesignAgentPayload {
  prompt: string
  roomId: string
}

export interface DesignAgentResult {
  roomId: string
  actionCount: number
  /**
   * The model's own short (1-2 sentence) explanation of what changed and why
   * (spec 32), sourced from `interpretDesignPrompt`'s `summary` field.
   * Non-empty by construction — `isRawDesignAgentActionsResponse`
   * (`lib/design-agent-ai.ts`) validates it as a required non-empty string
   * before `interpretDesignPrompt` can resolve at all, so a schema-invalid
   * response (including a missing/empty `summary`) already makes
   * `generateObject` reject and `runDesignAgent` fall into its `catch`
   * branch before this field is ever populated.
   */
  summary: string
}

export const DESIGN_AGENT_TASK_ID = "design-agent"

/**
 * Position to show as the AI's presence cursor: the target position of the
 * most-recently-added/moved node in the generated batch, or `null` if the
 * batch contains neither (only edits with no spatial target, or an empty
 * batch) — see the brief's Open Questions #4. Not a requirement pinned
 * anywhere in the context docs, a reasonable, non-literal interpretation of
 * "AI cursor" for a background task with no real pointer.
 */
function lastActionCursor(actions: DesignAgentAction[]): { x: number; y: number } | null {
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    const action = actions[i]
    if (action.kind === "addNode" || action.kind === "moveNode") {
      return { x: action.x, y: action.y }
    }
  }
  return null
}

/**
 * The task's actual run logic, exported separately from the `task(...)`
 * registration below so it's directly unit-testable without going through
 * Trigger.dev's runtime machinery — the public `Task` object `task(...)`
 * returns only exposes remote-trigger methods (`.trigger`/`.triggerAndWait`/
 * etc.), not a way to invoke `run` locally.
 *
 * Real implementation for spec 23 (spec 22 only logged/echoed the payload):
 * reads the room's current Storage → calls Gemini for a structured action
 * list → applies the full batch in one atomic Storage write → broadcasts
 * `ai-status-feed` status at start/processing/complete (or error) → sets/
 * clears AI presence (`thinking`/`cursor`) around the whole run, success or
 * failure.
 */
export async function runDesignAgent(payload: DesignAgentPayload): Promise<DesignAgentResult> {
  const { prompt, roomId } = payload

  try {
    await setDesignAgentPresence(roomId, { thinking: true, cursor: null })

    await broadcastDesignAgentStatus(roomId, {
      stage: "start",
      text: "Ghost AI is reading the current design…",
    })

    const currentGraph = await getCurrentDesignGraph(roomId)

    await broadcastDesignAgentStatus(roomId, {
      stage: "processing",
      text: "Ghost AI is generating changes…",
    })

    const { actions, summary } = await interpretDesignPrompt({ prompt, currentGraph })

    await setDesignAgentPresence(roomId, { thinking: true, cursor: lastActionCursor(actions) })

    await applyDesignAgentActions(roomId, actions)

    await broadcastDesignAgentStatus(roomId, {
      stage: "complete",
      // Spec 32: the model's own real summary of what it changed and why,
      // replacing the previous generic count-based string — see
      // `DesignAgentResult.summary`'s own doc for why this is guaranteed
      // non-empty by the time this line runs.
      text: summary,
    })

    logger.log("design-agent task completed", { roomId, actionCount: actions.length })

    return { roomId, actionCount: actions.length, summary }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error("design-agent task failed", { roomId, error: message })

    // A second failure here (e.g. Liveblocks itself unreachable) must not
    // mask or replace the original error — caught and logged separately,
    // never swallowed silently.
    await broadcastDesignAgentStatus(roomId, {
      stage: "error",
      text: "Ghost AI couldn't generate that change. Please try again.",
    }).catch((broadcastError: unknown) => {
      logger.error("design-agent failed to broadcast its own error status", {
        roomId,
        error: broadcastError instanceof Error ? broadcastError.message : String(broadcastError),
      })
    })

    throw error
  } finally {
    // Always clear AI presence, success or failure — acceptance criterion 9.
    await clearDesignAgentPresence(roomId).catch((clearError: unknown) => {
      logger.error("design-agent failed to clear AI presence", {
        roomId,
        error: clearError instanceof Error ? clearError.message : String(clearError),
      })
    })
  }
}

export const designAgentTask = task({
  id: DESIGN_AGENT_TASK_ID,
  run: runDesignAgent,
})
