import { tasks, auth } from "@trigger.dev/sdk"
import { DESIGN_AGENT_TASK_ID, type DesignAgentPayload } from "@/trigger/design-agent"
import type { designAgentTask } from "@/trigger/design-agent"

/**
 * Shared Trigger.dev wrapper for the design-agent task: triggering a run and
 * issuing a run-scoped public token, per spec 22's Analyst Brief.
 *
 * Follows `lib/liveblocks.ts`'s and `lib/canvas-blob.ts`'s lazy-instantiation
 * pattern — `TRIGGER_SECRET_KEY` is not guaranteed to be present in every
 * environment this module gets imported into (same category of gap already
 * logged for `LIVEBLOCKS_SECRET_KEY`/`BLOB_READ_WRITE_TOKEN`). Neither
 * function below touches the network or reads the env var until actually
 * called — the `@trigger.dev/sdk` calls they wrap already resolve
 * `TRIGGER_SECRET_KEY` lazily inside their own function bodies (verified
 * against the installed SDK's `apiClientManager` source, not assumed) — but
 * `requireTriggerSecretKey` below still checks explicitly first, so a
 * missing key surfaces as this module's own legible error rather than the
 * SDK's generic "API client missing" message. This keeps `next build`'s
 * page-data collection (which merely imports route modules, never invokes
 * them) safe with no `TRIGGER_SECRET_KEY` set.
 */

const DESIGN_RUN_TOKEN_EXPIRATION = "1h"

function requireTriggerSecretKey(): void {
  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new Error(
      "TRIGGER_SECRET_KEY is not set. Add it to the environment to trigger Trigger.dev tasks or issue run tokens.",
    )
  }
}

export interface TriggeredDesignRun {
  runId: string
}

/**
 * Triggers the `design-agent` background task and returns the new run's ID.
 */
export async function triggerDesignAgent(payload: DesignAgentPayload): Promise<TriggeredDesignRun> {
  requireTriggerSecretKey()

  const handle = await tasks.trigger<typeof designAgentTask>(DESIGN_AGENT_TASK_ID, payload)

  return { runId: handle.id }
}

/**
 * Issues a Trigger.dev public token scoped to read a single run only, with a
 * 1-hour expiration — per spec 22's Analyst Brief and spec 27's identical
 * requirement (`progress-tracker.md`'s Architecture Decisions).
 */
export async function createDesignRunToken(runId: string): Promise<string> {
  requireTriggerSecretKey()

  return auth.createPublicToken({
    scopes: { read: { runs: [runId] } },
    expirationTime: DESIGN_RUN_TOKEN_EXPIRATION,
  })
}
