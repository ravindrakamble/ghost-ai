"use client"

import { useCallback, useMemo } from "react"
import { useMutation, useSelf, useStorage } from "@liveblocks/react/suspense"
import {
  AiChatMessageSchema,
  type AiChatMessage,
  type SendAgentChatMessage,
  type SendChatMessage,
} from "@/types/tasks"

/**
 * Not cryptographically strong — only needs to be unique enough for a React
 * list key and for distinguishing messages within a single room's session,
 * the same "good enough" bar `lib/canvas-shapes.ts#generateNodeId` already
 * sets for this codebase's other client-generated IDs.
 */
function generateChatMessageId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Fixed display name for AI-authored `ai-chat` messages (spec 26) — reuses
 * `lib/design-agent-room.ts#GHOST_AI_USER_NAME`'s already-established
 * display name for the same conceptual actor (the design agent's cursor/
 * presence identity), rather than inventing a second name for the same
 * "who sent this" concept. Not imported directly from that server-only
 * module (`lib/design-agent-room.ts` pulls in `lib/liveblocks.ts`'s
 * server-side Liveblocks client, unsuitable to import into this client
 * hook) — kept as an independent constant with the same literal value. See
 * spec 26's Analyst Brief, Concrete deliverables.
 */
const GHOST_AI_SENDER_NAME = "Ghost AI"

export interface UseAiChatFeedResult {
  /** Ordered, schema-validated messages currently in the room's `ai-chat`
   * Storage `LiveList` — an invalid/malformed entry is dropped, not
   * rendered (acceptance criterion 5). */
  messages: AiChatMessage[]
  sendMessage: SendChatMessage
  /**
   * Pushes an AI-authored (`role: "assistant"`, `sender: "Ghost AI"`)
   * message onto the same `ai-chat` Storage `LiveList` `sendMessage` writes
   * to — spec 26's own additive capability, needed since nothing else in
   * this codebase can produce a `role: "assistant"` entry (`sendMessage`
   * itself hardcodes `role: "user"` by design, and
   * `trigger/design-agent.ts` never writes to `ai-chat`). See spec 26's
   * Analyst Brief, Open Questions #5.
   */
  sendAgentMessage: SendAgentChatMessage
}

/**
 * Subscribes to the room's `ai-chat` Storage `LiveList` (`root.messages`,
 * `liveblocks.config.ts`'s new `Storage` type) via Liveblocks' real
 * `useStorage` — not polling, not a second websocket, not a parallel
 * realtime system (acceptance criterion 3) — and builds a `sendMessage`
 * function on `useMutation` that validates the outgoing message against
 * `AiChatMessageSchema` before appending it to the list.
 *
 * Must be called from a component already inside the room's `RoomProvider`
 * boundary — both `useStorage`/`useMutation` and `useSelf` require the
 * Liveblocks room context. See spec 25's Analyst Brief, Open Questions #3:
 * `CanvasFlow` (`components/editor/canvas.tsx`) is that component, pushing
 * the validated message list up and the `sendMessage` function down via
 * callback props, mirroring — and extending, bidirectionally — spec 24's
 * `useAiStatusFeed` convention.
 */
export function useAiChatFeed(): UseAiChatFeedResult {
  /**
   * Narrowed to just the sender name `sendMessage` needs below — an
   * unselected `useSelf()` re-renders (and gives `sendMessage` a new
   * identity) on *every* presence change, including the `presence.cursor`
   * field `CanvasFlow`'s `handlePaneMouseMove` updates on every mouse move.
   * That churn fed `CanvasFlow`'s `onSendChatMessageChange`/
   * `onSendAgentMessageChange` effects a new function on every mousemove,
   * which push into `WorkspaceShell` state setters and re-trigger those same
   * effects — a runaway loop only while the pointer moves ("Maximum update
   * depth exceeded" at `handlePaneMouseMove`). Same narrow-selector
   * convention `presence-avatars.tsx`'s `useOthers` call already uses.
   */
  const selfName = useSelf((me) => me.info.name)
  const rawMessages = useStorage((root) => root.messages)

  /**
   * Liveblocks Storage reads are immutable and structurally shared — `root
   * .messages` keeps the same array reference across renders unless the
   * `messages` LiveList itself actually changes, so this validation pass
   * only re-runs when there's genuinely new/changed data to validate, not
   * on every unrelated room/storage update (`performant-storage-with-
   * selectors`, this repo's bundled Liveblocks skill).
   */
  const messages = useMemo(() => {
    const validated: AiChatMessage[] = []
    for (const candidate of rawMessages) {
      const parsed = AiChatMessageSchema.safeParse(candidate)
      if (parsed.success) {
        validated.push(parsed.data)
      }
    }
    return validated
  }, [rawMessages])

  const pushMessage = useMutation(({ storage }, message: AiChatMessage) => {
    storage.get("messages").push(message)
  }, [])

  const sendMessage = useCallback<SendChatMessage>(
    (content: string) => {
      const candidate = {
        id: generateChatMessageId(),
        sender: selfName,
        role: "user" as const,
        content,
        timestamp: Date.now(),
      }

      // Validate before ever touching Storage — spec 25's Analyst Brief,
      // Concrete deliverables ("validate an outgoing message before it's
      // written to Storage"). Throws synchronously rather than silently
      // dropping the message, so the caller's own try/catch (this spec's
      // Open Questions #5 failure-mode interpretation) can preserve the
      // input and show an error indicator.
      const parsed = AiChatMessageSchema.safeParse(candidate)
      if (!parsed.success) {
        throw new Error("Cannot send an invalid chat message")
      }

      pushMessage(parsed.data)
    },
    [selfName, pushMessage],
  )

  const sendAgentMessage = useCallback<SendAgentChatMessage>(
    (content: string) => {
      const candidate = {
        id: generateChatMessageId(),
        sender: GHOST_AI_SENDER_NAME,
        role: "assistant" as const,
        content,
        timestamp: Date.now(),
      }

      // Same validate-before-mutate contract as `sendMessage` above.
      const parsed = AiChatMessageSchema.safeParse(candidate)
      if (!parsed.success) {
        throw new Error("Cannot send an invalid chat message")
      }

      pushMessage(parsed.data)
    },
    [pushMessage],
  )

  return { messages, sendMessage, sendAgentMessage }
}
