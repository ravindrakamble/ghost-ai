import { z } from "zod"

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

/**
 * Formal, code-level schema for the `ai-chat` Liveblocks Storage `LiveList`
 * entries — spec 25's own named deliverable ("define or reuse a Zod schema
 * in `types/tasks.ts`"). A real `z.object` schema, not a hand-rolled type
 * guard relabeled as one: unlike `isAiStatusMessage` above (a manual guard,
 * matching spec 23's precedent of skipping Zod for that exact feed), spec
 * 25's own spec text names "Zod schema" specifically, twice — an explicit
 * ask this codebase's manual-guard precedent doesn't override. `zod` was
 * genuinely missing from `package.json` before this spec (confirmed by
 * reading it directly) and is now a real dependency, not a dev-only one, the
 * same "the spec's premise didn't hold, install what's actually needed"
 * precedent specs 10/21/22/23 already set. See spec 25's Analyst Brief,
 * Open Questions #1.
 *
 * Per `architecture-context.md`'s Realtime Conventions, `ai-chat` is an
 * ordered, persisted Liveblocks Storage `LiveList` (not `broadcastEvent`,
 * which has no replay/history for a participant joining mid-conversation) —
 * a fully separate mechanism from `ai-status-feed` above: no shared payload
 * type, no shared subscription, no cross-reading of one feed's data as the
 * other's (acceptance criterion 6).
 */
export const AiChatMessageSchema = z.object({
  /**
   * Stable identifier for React list rendering. Not one of the spec text's
   * four named fields (sender/role/content/timestamp), but needed once
   * messages can arrive from multiple senders into a live-appending list —
   * falling back to array index as a key is a known React anti-pattern. See
   * spec 25's Analyst Brief, Open Questions #4(c).
   */
  id: z.string().min(1),
  /**
   * Display name resolved from the room's own already-resolved Liveblocks
   * identity (`useSelf().info.name`, the same name `app/api/liveblocks-auth/
   * route.ts` already computes from the caller's Clerk profile at
   * session-auth time) — not a raw Clerk user ID, for consistency with how
   * names already surface elsewhere in this room (cursor badges, presence
   * avatars). See spec 25's Analyst Brief, Open Questions #4(b).
   */
  sender: z.string().min(1),
  /**
   * Reuses `ChatBubble`'s existing two-role vocabulary (spec 20).
   * `"assistant"` stays schema-supported but is unreachable through this
   * spec's own send path (acceptance criterion 7) — no AI-generated reply
   * exists yet.
   */
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  /**
   * Epoch-ms (`Date.now()`) — sortable, easily formatted, no existing
   * precedent elsewhere in this codebase pins a different format. See spec
   * 25's Analyst Brief, Open Questions #4(a).
   */
  timestamp: z.number().finite(),
})

/** Inferred from `AiChatMessageSchema` — spec 25's own named deliverable
 * ("a TypeScript type inferred from that schema"). */
export type AiChatMessage = z.infer<typeof AiChatMessageSchema>

/**
 * Function shape for sending an outgoing chat message (spec 25) — threaded
 * down through `Canvas` → `WorkspaceShell` → `AiSidebar` → `AiArchitectTab`
 * once `CanvasFlow`'s `useAiChatFeed()` (`hooks/use-ai-chat-feed.ts`)
 * produces a real one. Synchronous (not Promise-returning) — a Liveblocks
 * Storage `LiveList` write via `useMutation` is itself a synchronous,
 * locally-applied operation, not an HTTP-style call that returns a rejecting
 * promise. Throws synchronously if the outgoing message fails this schema's
 * own validation, or if the underlying Storage mutation itself throws (e.g.
 * genuinely disconnected from the room) — see spec 25's Analyst Brief, Open
 * Questions #5.
 */
export type SendChatMessage = (content: string) => void

/**
 * Function shape for pushing an AI-authored (`role: "assistant"`) message
 * onto `ai-chat` (spec 26) — the counterpart to `SendChatMessage` above, kept
 * as a distinct type rather than reusing it so the two send paths can never
 * be accidentally interchanged at a call site: `SendChatMessage` always
 * hardcodes `role: "user"` (spec 25's own acceptance criterion 7, which this
 * spec must not weaken), while this type's own implementation
 * (`useAiChatFeed()`'s `sendAgentMessage`) always hardcodes `role:
 * "assistant"` and a fixed `sender`. Threaded down the same
 * `Canvas` → `WorkspaceShell` → `AiSidebar` → `AiArchitectTab` callback-push
 * path `SendChatMessage` already established. Same synchronous/throwing
 * contract as `SendChatMessage` — see spec 26's Analyst Brief, Concrete
 * deliverables.
 */
export type SendAgentChatMessage = (content: string) => void

/**
 * Formal, code-level schema for spec 37's node-scoped comment threads —
 * one flat, persisted Liveblocks Storage `LiveList` (`root.nodeComments`,
 * `liveblocks.config.ts`) shared by every node in the room, matching
 * `ai-chat`'s own flat-`LiveList`-per-feed shape rather than a
 * `LiveMap`-per-node structure. Every entry carries its own `nodeId` so a
 * single list can serve every node, per the raw spec text.
 *
 * Deliberately a **fully independent schema/type** from
 * `AiChatMessageSchema`/`AiChatMessage` — no shared base type — matching
 * this codebase's existing convention of independent per-feed types (e.g.
 * `AiStatusMessage` vs. `AiChatMessageSchema` staying unrelated above). A
 * `NodeComment` has no `role` field (comments aren't user/assistant-typed
 * the way chat messages are), which is the concrete reason a shared base
 * type wasn't used — see spec 37's Analyst Brief, Open Questions #6.
 */
export const NodeCommentSchema = z.object({
  /** Stable identifier for React list rendering — same rationale as
   * `AiChatMessageSchema.id` above (falling back to array index as a key is
   * a known React anti-pattern once comments can arrive from multiple
   * senders into a live-appending list). */
  id: z.string().min(1),
  /** The canvas node this comment belongs to (`CanvasNode.id`,
   * `types/canvas.ts`) — filtering by this field is what lets one flat
   * `LiveList` serve every node's own thread. */
  nodeId: z.string().min(1),
  /** Display name resolved from the room's own already-resolved Liveblocks
   * identity (`useSelf().info.name`) — same convention as
   * `AiChatMessageSchema.sender`. */
  sender: z.string().min(1),
  content: z.string().min(1),
  /** Epoch-ms (`Date.now()`) — same convention as
   * `AiChatMessageSchema.timestamp`. */
  timestamp: z.number().finite(),
})

/** Inferred from `NodeCommentSchema`. */
export type NodeComment = z.infer<typeof NodeCommentSchema>

/**
 * Function shape for sending an outgoing node comment (spec 37) — mirrors
 * `SendChatMessage`'s own doc/contract conventions: synchronous (a
 * Liveblocks Storage `LiveList` write via `useMutation` is itself a
 * synchronous, locally-applied operation, not an HTTP-style call that
 * returns a rejecting promise), and throws synchronously if the outgoing
 * comment fails `NodeCommentSchema`'s own validation or if the underlying
 * Storage mutation itself throws (e.g. genuinely disconnected from the
 * room).
 */
export type SendNodeComment = (nodeId: string, content: string) => void
