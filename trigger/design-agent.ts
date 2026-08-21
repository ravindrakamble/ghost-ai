import { task, logger } from "@trigger.dev/sdk"

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
  received: true
  prompt: string
  roomId: string
}

export const DESIGN_AGENT_TASK_ID = "design-agent"

/**
 * The task's actual run logic, exported separately from the `task(...)`
 * registration below so it's directly unit-testable without going through
 * Trigger.dev's runtime machinery — the public `Task` object `task(...)`
 * returns only exposes remote-trigger methods (`.trigger`/`.triggerAndWait`/
 * etc.), not a way to invoke `run` locally.
 *
 * Deliberately does nothing beyond logging/echoing its input for this spec
 * (22's own text: "don't add AI logic yet"). No AI provider call, no
 * node/edge generation, and no Liveblocks/canvas mutation happen here — that
 * is spec 23's job, built on top of this task shell.
 */
export async function runDesignAgent(payload: DesignAgentPayload): Promise<DesignAgentResult> {
  logger.log("design-agent task received payload", {
    prompt: payload.prompt,
    roomId: payload.roomId,
  })

  return {
    received: true,
    prompt: payload.prompt,
    roomId: payload.roomId,
  }
}

export const designAgentTask = task({
  id: DESIGN_AGENT_TASK_ID,
  run: runDesignAgent,
})
