"use client"

import { useState, type ChangeEvent, type KeyboardEvent } from "react"
import { MessageCircle, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { useNodeCommentsForNode } from "@/hooks/use-node-comments"
import type { NodeComment } from "@/types/tasks"

/**
 * Formats a `NodeComment.timestamp` (epoch-ms) for display next to a
 * bubble's sender name — same convention as
 * `ai-architect-tab.tsx#formatMessageTimestamp` (locale pinned to `"en-US"`
 * for a deterministic format *shape* across environments).
 */
function formatCommentTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

/**
 * A single comment bubble — mirrors `ChatBubble`'s (`ai-architect-tab.tsx`)
 * sender/timestamp/content *layout convention*, not a literal reuse of that
 * component: `ChatBubble` branches left/right alignment and border/
 * background color on `AiChatMessage.role`, a field `NodeComment`
 * deliberately doesn't have. A uniformly-styled, left-aligned bubble for
 * every entry — no role-based split, since there is no role concept for a
 * comment. See spec 37's Analyst Brief, Open Questions #6.
 */
function CommentBubble({ comment }: { comment: NodeComment }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-subtle px-3 py-2 text-sm text-copy-primary">
      <div className="mb-1 flex items-center gap-2 text-xs text-copy-muted">
        <span className="font-medium">{comment.sender}</span>
        <span>{formatCommentTimestamp(comment.timestamp)}</span>
      </div>
      <p className="whitespace-pre-wrap">{comment.content}</p>
    </div>
  )
}

export interface NodeCommentsPopoverProps {
  /** The canvas node this thread belongs to (`CanvasNode.id`). */
  nodeId: string
}

/**
 * A trigger element (badge/popover-trigger combined, per the raw spec's own
 * "badge/popover trigger" phrasing) built on `components/ui/popover.tsx`
 * (spec 36's addition) — reused as-is, not modified or duplicated. See spec
 * 37's Analyst Brief, Open Questions #2.
 *
 * At zero comments the trigger renders icon-only, hidden at rest and
 * revealed on node hover (the same `opacity-0 group-hover:opacity-100`
 * convention `canvas-node.tsx` already uses for its four connection
 * handles) — so a node with no comments yet still has a reachable way to
 * start its first thread. Once the node has one or more comments, the
 * trigger becomes unconditionally visible with a numeric count badge. See
 * spec 37's Analyst Brief, Open Questions #1.
 *
 * Popover open/close state is local to this component (per-node), not
 * centralized in `CanvasFlow` — opening one node's thread has no bearing on
 * another's. See spec 37's Analyst Brief, Open Questions #5.
 */
export function NodeCommentsPopover({ nodeId }: NodeCommentsPopoverProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const { comments, sendComment } = useNodeCommentsForNode(nodeId)

  const hasComments = comments.length > 0

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.target.value)
  }

  function handleSubmit() {
    const trimmed = draft.trim()
    if (!trimmed) return
    sendComment(trimmed)
    setDraft("")
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={hasComments ? `View ${comments.length} comments` : "Add a comment"}
            className={
              "nodrag nopan absolute -top-2 -right-2 z-20 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border border-surface-border bg-elevated px-1 text-copy-primary transition-opacity duration-150 " +
              (hasComments ? "opacity-100" : "opacity-0 group-hover:opacity-100")
            }
          />
        }
      >
        <MessageCircle className="h-3 w-3" />
        {hasComments ? <span className="text-[10px] leading-none">{comments.length}</span> : null}
      </PopoverTrigger>
      <PopoverContent align="end" side="top">
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {hasComments ? (
            comments.map((comment) => <CommentBubble key={comment.id} comment={comment} />)
          ) : (
            <p className="px-1 py-2 text-xs text-copy-muted">No comments yet.</p>
          )}
        </div>
        <div className="flex items-end gap-2 border-t border-surface-border pt-2">
          <Textarea
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Write a comment…"
            aria-label="Write a comment"
            className="min-h-[52px] max-h-[120px] resize-none overflow-y-auto text-copy-primary"
          />
          <Button
            type="button"
            size="icon"
            onClick={handleSubmit}
            disabled={!draft.trim()}
            className="shrink-0"
          >
            <Send />
            <span className="sr-only">Send comment</span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
