"use client"

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react"
import { AlertCircle, Bot, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { AiChatMessage, AiStatusMessage, SendChatMessage } from "@/types/tasks"

const STARTER_PROMPTS = [
  "Design an e-commerce backend",
  "Create a chat app architecture",
  "Build a CI/CD pipeline",
] as const

/**
 * Formats an `AiChatMessage.timestamp` (epoch-ms) for display next to a
 * bubble's sender name. Locale pinned to `"en-US"` for a deterministic
 * format *shape* across environments (this repo's test runner's own system
 * locale isn't controlled) — the exact clock time is still whatever the
 * local/test timezone resolves it to, which is expected and untested
 * precisely for that reason (see `ai-architect-tab.test.tsx`).
 */
function formatMessageTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

/**
 * A single chat bubble. Exported separately (rather than inlined in the
 * message list) so both the user- and assistant-role styling (acceptance
 * criterion 7) can be unit tested directly — the assistant branch isn't
 * reachable through this spec's own send path (no AI reply exists yet;
 * that's spec 26's job to wire), but the styling contract is real code
 * either way, not aspirational.
 *
 * Spec 25 extends this from a content-only bubble (spec 20) to also show
 * `sender` and a formatted `timestamp`, per the spec's own "show sender,
 * timestamp, and message content" text — real, persisted `AiChatMessage`
 * shape (`types/tasks.ts`), not the old local-only `ChatMessage` shape.
 */
export function ChatBubble({ message }: { message: AiChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          isUser
            ? "border border-brand bg-accent-dim text-copy-primary"
            : "border border-surface-border bg-subtle text-ai-text"
        }`}
      >
        <div className="mb-1 flex items-center gap-2 text-xs text-copy-muted">
          <span className="font-medium">{message.sender}</span>
          <span>{formatMessageTimestamp(message.timestamp)}</span>
        </div>
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}

interface AiArchitectTabProps {
  /**
   * Latest validated `ai-status-feed` message (spec 24) — the *shared,
   * room-wide* signal every connected participant sees while a design-agent
   * run is active, not local-only state (acceptance criterion 4). Threaded
   * down from `WorkspaceShell` → `AiSidebar` unchanged. `null`/`undefined`
   * means no run has been observed yet this session, or the sidebar is
   * rendered standalone (e.g. in a test) with nothing wired up.
   */
  aiStatus?: AiStatusMessage | null
  /**
   * Ordered, schema-validated `ai-chat` messages (spec 25) — the real,
   * persisted, room-wide chat feed, replacing this component's previous
   * local-only `useState<ChatMessage[]>` array (spec 20). Defaults to an
   * empty array so this component still renders sensibly standalone (e.g.
   * in a test) with nothing wired up.
   */
  chatMessages?: AiChatMessage[]
  /**
   * The real, room-connected function to send a chat message (spec 25),
   * threaded down from `WorkspaceShell` → `AiSidebar`. Defaults to a
   * function that throws, matching `WorkspaceShell`'s own "not ready yet"
   * default for the same window before `CanvasFlow`'s real mutation reaches
   * this component — a send attempted in that window surfaces as a genuine
   * failure (input preserved, error shown), not a silent no-op.
   */
  sendMessage?: SendChatMessage
}

/** Stages during which a design-agent run is actively working — matches
 * spec 23's own "start, processing, complete" broadcast points and this
 * spec's acceptance criteria 5/6 ("while the latest status's stage is
 * 'start' or 'processing'"). */
const ACTIVE_GENERATION_STAGES: ReadonlySet<AiStatusMessage["stage"]> = new Set(["start", "processing"])

/** Fallback status-line copy for a `start`/`processing` message that omits
 * the optional `text` field (schema-valid per `types/tasks.ts`) — the status
 * line itself must still render something legible rather than nothing. */
const DEFAULT_GENERATING_TEXT = "Ghost AI is working…"

/** Default `sendMessage` before a real, room-connected one reaches this
 * component as a prop — see `AiArchitectTabProps.sendMessage`'s own doc. */
function chatNotReadyYet(): never {
  throw new Error("Chat is not ready yet.")
}

/**
 * AI Architect tab (spec 20/24/25) — chat UI shell. Submitting (Enter
 * without Shift, or the Send button) calls the real `sendMessage` prop
 * (spec 25, `hooks/use-ai-chat-feed.ts` via `CanvasFlow`) with the trimmed
 * input. The rendered message list is the real, persisted `chatMessages`
 * prop — not local component state (spec 20's own docblock flagged that
 * local array as something "spec 25 owns," fully replaced here, not run
 * alongside).
 *
 * On a successful send, the input clears. On a failed send — the outgoing
 * message failing `AiChatMessageSchema`'s own validation, or the underlying
 * Storage mutation itself throwing (e.g. genuinely disconnected from the
 * room) — the input's contents are preserved and a small inline error
 * indicator appears (`text-state-error`, matching `SaveStatusIndicator`'s
 * existing error convention). See spec 25's Analyst Brief, Open Questions
 * #5.
 *
 * Spec 24's shared "AI is working" signal sits on top of the same shell: a
 * non-blocking status line (icon + `aiStatus.text`) while `aiStatus.stage`
 * is `"start"`/`"processing"`, disabling the input/Send button for that same
 * window, and swapping the Send icon for a spinner — all driven purely by
 * the room-broadcast `ai-status-feed`, not local submit-flow state (that
 * stays spec 26's job to layer on top, per spec 24's Analyst Brief, Open
 * Questions #5). Nothing else in this component — starter chips, the
 * message list, tab switching (owned by `AiSidebar`) — is disabled or
 * dimmed (both specs' own explicit Scope Limit).
 */
export function AiArchitectTab({
  aiStatus = null,
  chatMessages = [],
  sendMessage = chatNotReadyYet,
}: AiArchitectTabProps) {
  const [input, setInput] = useState("")
  const [sendError, setSendError] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isGenerating = aiStatus !== null && ACTIVE_GENERATION_STAGES.has(aiStatus.stage)

  function handleSubmit() {
    const trimmed = input.trim()
    if (!trimmed) return

    try {
      sendMessage(trimmed)
      setInput("")
      setSendError(false)
    } catch {
      // Preserve the input's contents on failure (spec 25's acceptance
      // criterion 4) — no `setInput("")` here.
      setSendError(true)
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value)
    // A fresh edit means the user is trying again — clear a stale error
    // from a previous failed attempt rather than leaving it showing
    // indefinitely next to text that's already changed.
    if (sendError) {
      setSendError(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  function handleStarterPrompt(prompt: string) {
    setInput(prompt)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        {chatMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Bot className="h-8 w-8 text-copy-muted" />
            <p className="text-sm text-copy-muted">
              Describe the system you want to design and Ghost AI will help you architect it.
            </p>
            <div className="flex flex-col gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleStarterPrompt(prompt)}
                  className="rounded-full border border-surface-border bg-elevated px-3 py-1.5 text-xs text-ai-text hover:bg-subtle"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {chatMessages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-surface-border p-3">
        {/*
          Spec 24: non-blocking "AI is working" status line — visible only
          while a run is active, rendering nothing before the first message
          of the session arrives or once a run reaches "complete"/"error",
          mirroring `SaveStatusIndicator`'s "nothing for idle" convention
          (spec 21) rather than inventing a new visibility rule.
        */}
        {isGenerating ? (
          <div className="flex items-center gap-2 text-xs text-ai-text">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span className="truncate">{aiStatus?.text ?? DEFAULT_GENERATING_TEXT}</span>
          </div>
        ) : null}
        {/*
          Spec 25: small inline error indicator on a failed send — same
          `text-state-error`/icon convention `SaveStatusIndicator` (spec 21)
          already established for its own "Save failed" state.
        */}
        {sendError ? (
          <div className="flex items-center gap-2 text-xs text-state-error">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Failed to send. Try again.</span>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe your system..."
            aria-label="Message Ghost AI"
            disabled={isGenerating}
            className="min-h-[72px] max-h-[160px] resize-none overflow-y-auto text-copy-primary"
          />
          <Button
            type="button"
            size="icon"
            onClick={handleSubmit}
            disabled={!input.trim() || isGenerating}
            className="shrink-0 bg-ai text-copy-primary hover:bg-ai/80"
          >
            {isGenerating ? <Loader2 className="animate-spin" /> : <Send />}
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
