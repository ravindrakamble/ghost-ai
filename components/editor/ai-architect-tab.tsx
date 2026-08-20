"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { Bot, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

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

/**
 * AI Architect tab (spec 20) — chat UI shell only. Presentational and
 * local-only: submitting (Enter without Shift, or the Send button) appends
 * an ephemeral user bubble to this component's own `useState`, with no
 * assistant reply, no persistence, and no network call (see the brief's
 * Open Questions #3). Specs 24-26 replace this local array with the real
 * Liveblocks `ai-chat`/`ai-status-feed` mechanism and AI backend without
 * needing to redesign this layout.
 */
export function AiArchitectTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const nextMessageId = useRef(0)

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

      <div className="flex shrink-0 items-end gap-2 border-t border-surface-border p-3">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your system..."
          aria-label="Message Ghost AI"
          className="min-h-[72px] max-h-[160px] resize-none overflow-y-auto text-copy-primary"
        />
        <Button
          type="button"
          size="icon"
          onClick={handleSubmit}
          disabled={!input.trim()}
          className="shrink-0 bg-ai text-copy-primary hover:bg-ai/80"
        >
          <Send />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </div>
  )
}
