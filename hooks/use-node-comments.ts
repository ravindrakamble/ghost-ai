"use client"

import { createContext, useCallback, useContext, useMemo } from "react"
import { useMutation, useSelf, useStorage } from "@liveblocks/react/suspense"
import { NodeCommentSchema, type NodeComment, type SendNodeComment } from "@/types/tasks"

/**
 * Not cryptographically strong — only needs to be unique enough for a React
 * list key and for distinguishing comments within a single room's session,
 * the same "good enough" bar `hooks/use-ai-chat-feed.ts#generateChatMessageId`
 * already sets for this codebase's other client-generated Liveblocks Storage
 * IDs.
 */
function generateNodeCommentId(): string {
  return `comment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export interface UseNodeCommentsResult {
  /** Every schema-valid comment currently in the room's `nodeComments`
   * Storage `LiveList`, across every node — an invalid/malformed entry is
   * dropped, not rendered, mirroring `useAiChatFeed`'s own contract. */
  comments: NodeComment[]
  sendComment: SendNodeComment
}

/**
 * Subscribes to the room's node-comments Storage `LiveList`
 * (`root.nodeComments`, `liveblocks.config.ts`'s `Storage` type) via
 * Liveblocks' real `useStorage` — not polling, not a second websocket, not a
 * parallel realtime system — and builds a `sendComment` function on
 * `useMutation` that validates the outgoing comment against
 * `NodeCommentSchema` before appending it to the list. Mirrors
 * `hooks/use-ai-chat-feed.ts#useAiChatFeed`'s exact internal shape.
 *
 * Must be called from a component already inside the room's `RoomProvider`
 * boundary — both `useStorage`/`useMutation` and `useSelf` require the
 * Liveblocks room context. Called exactly once, inside `CanvasFlow`
 * (`components/editor/canvas.tsx`) — not parameterized per-node and not
 * called directly inside every `CanvasNode` instance, since that would mean
 * N independent `useStorage` subscriptions each re-validating the *entire*
 * comment list on every change. See spec 37's Analyst Brief, Open Questions
 * #3. Its result is distributed to every `CanvasNode` leaf via
 * `NodeCommentsContext` below, filtered per-node by `useNodeCommentsForNode`.
 */
export function useNodeComments(): UseNodeCommentsResult {
  /**
   * Narrowed to just the sender name `sendComment` needs below — an
   * unselected `useSelf()` re-renders (and gives `sendComment` a new
   * identity) on *every* presence change, including the `presence.cursor`
   * field `CanvasFlow`'s `handlePaneMouseMove` updates on every mouse move.
   * Same narrow-selector convention `useAiChatFeed`'s own `selfName` already
   * uses, and for the same documented reason (see that hook's own comment).
   */
  const selfName = useSelf((me) => me.info.name)
  const rawComments = useStorage((root) => root.nodeComments)

  /**
   * Liveblocks Storage reads are immutable and structurally shared — `root
   * .nodeComments` keeps the same array reference across renders unless the
   * `nodeComments` LiveList itself actually changes, so this validation pass
   * only re-runs when there's genuinely new/changed data to validate, not on
   * every unrelated room/storage update. Same convention as
   * `useAiChatFeed`'s own `messages` `useMemo`.
   */
  const comments = useMemo(() => {
    const validated: NodeComment[] = []
    for (const candidate of rawComments) {
      const parsed = NodeCommentSchema.safeParse(candidate)
      if (parsed.success) {
        validated.push(parsed.data)
      }
    }
    return validated
  }, [rawComments])

  const pushComment = useMutation(({ storage }, comment: NodeComment) => {
    storage.get("nodeComments").push(comment)
  }, [])

  const sendComment = useCallback<SendNodeComment>(
    (nodeId: string, content: string) => {
      const candidate = {
        id: generateNodeCommentId(),
        nodeId,
        sender: selfName,
        content,
        timestamp: Date.now(),
      }

      // Validate before ever touching Storage — same contract as
      // `useAiChatFeed`'s `sendMessage`. Throws synchronously rather than
      // silently dropping the comment, so the caller can preserve the input
      // and show an error indicator.
      const parsed = NodeCommentSchema.safeParse(candidate)
      if (!parsed.success) {
        throw new Error("Cannot send an invalid node comment")
      }

      pushComment(parsed.data)
    },
    [selfName, pushComment],
  )

  return { comments, sendComment }
}

/**
 * Context distributing `useNodeComments()`'s single subscription to every
 * `CanvasNode` leaf — structurally mirrors
 * `hooks/use-update-canvas-node.ts`'s `CanvasNodeUpdateContext`/
 * `hooks/use-canvas-search-highlight.ts`'s `CanvasSearchHighlightContext`
 * pair. Provided by `CanvasFlow`, consumed by `useNodeCommentsForNode` below
 * (via `NodeCommentsPopover`), per `architecture-context.md`'s Hooks
 * Convention.
 */
export const NodeCommentsContext = createContext<UseNodeCommentsResult | null>(null)

/** Default `sendComment` before a real, room-connected `NodeCommentsContext`
 * reaches a consumer — mirrors `ai-architect-tab.tsx#chatNotReadyYet`'s "not
 * ready yet" contract: a comment send attempted with no real mutation behind
 * it should surface as a genuine failure, not a silent no-op. */
function commentsNotReadyYet(): never {
  throw new Error("Node comments are not ready yet.")
}

/**
 * Leaf-facing consumer hook, called by `NodeCommentsPopover`. Reads
 * `NodeCommentsContext`, `useMemo`-filters the full `comments` list down to
 * just this `nodeId` (client-side filtering happens here, not inside
 * `useNodeComments()` itself — see spec 37's Analyst Brief, Open Questions
 * #3), and returns a nodeId-bound `sendComment(content)` plus the filtered
 * `comments`.
 *
 * Returns an empty list and a throwing stub `sendComment` when called with
 * no provider in the tree (mirroring `chatNotReadyYet`'s contract above, not
 * `useCanvasSearchHighlight`'s silent-`null` default).
 */
export function useNodeCommentsForNode(
  nodeId: string,
): { comments: NodeComment[]; sendComment: (content: string) => void } {
  const context = useContext(NodeCommentsContext)

  const comments = useMemo(() => {
    if (!context) return []
    return context.comments.filter((comment) => comment.nodeId === nodeId)
  }, [context, nodeId])

  const sendComment = useCallback(
    (content: string) => {
      if (!context) {
        commentsNotReadyYet()
      }
      context.sendComment(nodeId, content)
    },
    [context, nodeId],
  )

  return { comments, sendComment }
}
