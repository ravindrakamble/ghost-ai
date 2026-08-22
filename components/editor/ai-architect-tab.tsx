"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { Bot, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { AiStatusMessage } from "@/types/tasks"

const STARTER_PROMPTS = [
  "Design an e-commerce backend",
  "Create a chat app architecture",
  "Build a CI/CD pipeline",
] as const

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

/**
 * A single chat bubble. Exported separately (rather than inlined in the
 * message list) so both the user- and assistant-role styling (acceptance
 * criterion 7) can be unit tested directly — the assistant branch isn't
 * reachable through this spec's own local-only submit flow (no AI reply
 * exists yet; that's specs 25/26's job to wire), but the styling contract is
 * real code either way, not aspirational.
 */
export function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser
            ? "border border-brand bg-accent-dim text-copy-primary"
            : "border border-surface-border bg-subtle text-ai-text"
        }`}
      >
        {message.content}
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

/**
 * AI Architect tab (spec 20/24) — chat UI shell. Submitting (Enter without
 * Shift, or the Send button) appends an ephemeral user bubble to this
 * component's own `useState`, with no assistant reply, no persistence, and
 * no network call (see spec 20's Open Questions #3; spec 26 wires the real
 * submit flow later).
 *
 * Spec 24 adds the shared "AI is working" signal on top of that same local
 * shell: a non-blocking status line (icon + `aiStatus.text`) while
 * `aiStatus.stage` is `"start"`/`"processing"`, disabling the input/Send
 * button for that same window, and swapping the Send icon for a spinner —
 * all driven purely by the room-broadcast `ai-status-feed`, not local
 * submit-flow state (that stays spec 26's job to layer on top, per this
 * spec's Analyst Brief, Open Questions #5). Nothing else in this component
 * — starter chips, the message list, tab switching (owned by `AiSidebar`) —
 * is disabled or dimmed (this spec's own explicit Scope Limit).
 */
export function AiArchitectTab({ aiStatus = null }: AiArchitectTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const nextMessageId = useRef(0)

  const isGenerating = aiStatus !== null && ACTIVE_GENERATION_STAGES.has(aiStatus.stage)

  function handleSubmit() {
    const trimmed = input.trim()
    if (!trimmed) return

    nextMessageId.current += 1
    setMessages((prev) => [
      ...prev,
      { id: `msg-${nextMessageId.current}`, role: "user", content: trimmed },
    ])
    setInput("")
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
        {messages.length === 0 ? (
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
            {messages.map((message) => (
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
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
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
