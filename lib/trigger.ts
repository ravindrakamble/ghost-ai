import { tasks, auth } from "@trigger.dev/sdk"
import { DESIGN_AGENT_TASK_ID, type DesignAgentPayload } from "@/trigger/design-agent"
import type { designAgentTask } from "@/trigger/design-agent"
import { GENERATE_SPEC_TASK_ID, type GenerateSpecPayload } from "@/trigger/generate-spec"
import type { generateSpecTask } from "@/trigger/generate-spec"

/**
 * Shared Trigger.dev wrapper for the design-agent and generate-spec tasks:
 * triggering a run and issuing a run-scoped public token, per spec 22's and
 * spec 27's Analyst Briefs.
 *
 * Follows `lib/liveblocks.ts`'s and `lib/canvas-blob.ts`'s lazy-instantiation
 * pattern — `TRIGGER_SECRET_KEY` is not guaranteed to be present in every
 * environment this module gets imported into (same category of gap already
 * logged for `LIVEBLOCKS_SECRET_KEY`/`BLOB_READ_WRITE_TOKEN`). Neither
 * trigger function below touches the network or reads the env var until
 * actually called — the `@trigger.dev/sdk` calls they wrap already resolve
 * `TRIGGER_SECRET_KEY` lazily inside their own function bodies (verified
 * against the installed SDK's `apiClientManager` source, not assumed) — but
 * `requireTriggerSecretKey` below still checks explicitly first, so a
 * missing key surfaces as this module's own legible error rather than the
 * SDK's generic "API client missing" message. This keeps `next build`'s
 * page-data collection (which merely imports route modules, never invokes
 * them) safe with no `TRIGGER_SECRET_KEY` set.
 *
 * `createRunToken` was generalized from spec 22's original
 * `createDesignRunToken` (spec 27's Analyst Brief, Open Questions #4) — its
 * body has no design-specific logic; it only scopes a public token to a
 * given `runId` with a fixed expiration, so both `/api/ai/design/token` and
 * `/api/ai/spec/token` now share the one implementation rather than a
 * byte-for-byte duplicate (`code-standards.md`'s "fix root causes — do not
 * layer workarounds"). Purely a rename/generalization — no behavior change;
 * callers only ever cared about the return value.
 */

const RUN_TOKEN_EXPIRATION = "1h"

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

export interface TriggeredGenerateSpecRun {
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
 * Triggers the `generate-spec` background task and returns the new run's ID.
 * Mirrors `triggerDesignAgent` exactly (spec 27's Analyst Brief).
 */
export async function triggerGenerateSpec(payload: GenerateSpecPayload): Promise<TriggeredGenerateSpecRun> {
  requireTriggerSecretKey()

  const handle = await tasks.trigger<typeof generateSpecTask>(GENERATE_SPEC_TASK_ID, payload)

  return { runId: handle.id }
}

/**
 * Issues a Trigger.dev public token scoped to read a single run only, with a
 * 1-hour expiration — per spec 22's Analyst Brief and spec 27's identical
 * requirement (`progress-tracker.md`'s Architecture Decisions). Task-
 * agnostic: works for a design-agent run, a generate-spec run, or any future
 * task type, since ownership is enforced purely via `TaskRun.userId`
 * regardless of which task produced a given `runId` (spec 27's Analyst
 * Brief, Open Questions #5).
 */
export async function createRunToken(runId: string): Promise<string> {
  requireTriggerSecretKey()

  return auth.createPublicToken({
    scopes: { read: { runs: [runId] } },
    expirationTime: RUN_TOKEN_EXPIRATION,
  })
}
