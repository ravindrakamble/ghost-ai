"use client"

import { useCallback, useMemo } from "react"
import { useMutation, useSelf, useStorage } from "@liveblocks/react/suspense"
import { AiChatMessageSchema, type AiChatMessage, type SendChatMessage } from "@/types/tasks"

/**
 * Not cryptographically strong — only needs to be unique enough for a React
 * list key and for distinguishing messages within a single room's session,
 * the same "good enough" bar `lib/canvas-shapes.ts#generateNodeId` already
 * sets for this codebase's other client-generated IDs.
 */
function generateChatMessageId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export interface UseAiChatFeedResult {
  /** Ordered, schema-validated messages currently in the room's `ai-chat`
   * Storage `LiveList` — an invalid/malformed entry is dropped, not
   * rendered (acceptance criterion 5). */
  messages: AiChatMessage[]
  sendMessage: SendChatMessage
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
  const self = useSelf()
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
        sender: self.info.name,
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
    [self, pushMessage],
  )

  return { messages, sendMessage }
}
