/**
 * Formal, code-level schema for the `ai-status-feed` Liveblocks broadcast
 * event — spec 24's own named deliverable ("define the feed payload schema
 * in `types/tasks.ts`"). `AiStatusStage` mirrors spec 23's already-shipped
 * `DesignAgentStatusStage` (`lib/design-agent-room.ts`) exactly, not a
 * redefinition with different values — that module now imports these types
 * directly rather than keeping its own duplicate (spec 24's Analyst Brief,
 * Open Questions #2).
 *
 * Per `architecture-context.md`'s Realtime Conventions, `ai-status-feed` is
 * latest-message-only (no history) and is a separate mechanism from
 * `ai-chat` — nothing here is design-generation-specific, so this schema
 * stays generic enough for spec generation's own status broadcasts later
 * (spec 24's own Out-of-scope callouts).
 */

/** Matches `lib/design-agent-room.ts`'s already-broadcasting stage values exactly. */
export type AiStatusStage = "start" | "processing" | "complete" | "error"

const AI_STATUS_STAGES: readonly AiStatusStage[] = ["start", "processing", "complete", "error"]

/**
 * `text` is optional per this spec's own text ("the payload should support
 * an optional `text` field") — spec 23's actual broadcasts always happen to
 * include `text`, which is a valid subtype of "optional," so no producer
 * change was required for this schema to hold.
 */
export interface AiStatusMessage {
  stage: AiStatusStage
  text?: string
}

/**
 * Runtime type guard validating an incoming `ai-status-feed` broadcast
 * before it touches any UI state (acceptance criterion 2) — manual, no Zod,
 * matching spec 23's own precedent of skipping Zod for this exact feed.
 * Rejects a missing/invalid `stage`, an unrecognized `stage` value, and a
 * non-string `text` when present.
 */
export function isAiStatusMessage(value: unknown): value is AiStatusMessage {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>

  if (
    typeof candidate.stage !== "string" ||
    !AI_STATUS_STAGES.includes(candidate.stage as AiStatusStage)
  ) {
    return false
  }

  if (candidate.text !== undefined && typeof candidate.text !== "string") {
    return false
  }

  return true
}
