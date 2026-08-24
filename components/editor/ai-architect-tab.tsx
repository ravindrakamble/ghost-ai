"use client"

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react"
import { useRealtimeRun } from "@trigger.dev/react-hooks"
import { AlertCircle, Bot, Loader2, Send, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type {
  AiChatMessage,
  AiStatusMessage,
  SendAgentChatMessage,
  SendChatMessage,
} from "@/types/tasks"
// Type-only import of the design-agent task (spec 32, Open Questions #1) —
// erased at build, never bundles `@trigger.dev/sdk`/`trigger/design-agent.ts`'s
// server logic into the client bundle. `typeof designAgentTask` is what lets
// `useRealtimeRun<typeof designAgentTask>` below genuinely type
// `realtimeRun.output` as `DesignAgentResult | undefined`, mirroring
// `specs-tab.tsx`'s existing precedent of type-only-importing a narrow type
// from a non-`components/` module.
import type { designAgentTask } from "@/trigger/design-agent"

const STARTER_PROMPTS = [
  "Design an e-commerce backend",
  "Create a chat app architecture",
  "Build a CI/CD pipeline",
] as const

/**
 * Fixed prompt text for the "Critique this design" quick action (spec 32).
 * Deliberately phrased as a review/critique request (so `buildPrompt`'s new
 * critique-mode instruction in `lib/design-agent-ai.ts` actually triggers)
 * and explicitly asks for improvements to be applied, not just described —
 * per the brief's Open Questions #3.
 */
const CRITIQUE_PROMPT =
  "Critique this design — review the current diagram for architectural issues (single points of failure, missing caching or queueing, unclear boundaries) and apply improvements."

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
   * The current project's ID (spec 26) — required by `POST /api/ai/design`'s
   * `{ prompt, roomId, projectId }` body (both room/project fields must equal
   * the current project's ID, per that route's own validation). Defaults to
   * an empty string so this component still renders standalone (e.g. in a
   * test) with nothing wired up; submitting with an empty `projectId` will
   * fail server-side validation, surfacing as this spec's own error path.
   */
  projectId?: string
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
  /**
   * The real, room-connected function to push an AI-authored/error message
   * onto `ai-chat` (spec 26), threaded down from `WorkspaceShell` →
   * `AiSidebar`. Defaults to a throwing stub, same "not ready yet" contract
   * as `sendMessage` above.
   */
  sendAgentMessage?: SendAgentChatMessage
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

/** Default `sendAgentMessage` (spec 26) before a real, room-connected one
 * reaches this component as a prop — same "not ready yet" contract. */
function agentChatNotReadyYet(): never {
  throw new Error("Chat is not ready yet.")
}

/**
 * Shallow runtime shape-checks for `POST /api/ai/design`'s and
 * `POST /api/ai/design/token`'s response bodies (spec 22, `{ runId }` and
 * `{ token }` respectively) — same shallow-validation convention as
 * `canvas.tsx`'s own `isCanvasSnapshotBody` (spec 21): just enough to
 * confirm the field this spec's own submit flow depends on is genuinely a
 * non-empty string before trusting it, not a deep schema check against a
 * third party's arbitrary input.
 */
function isRunIdBody(value: unknown): value is { runId: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.runId === "string" && candidate.runId.length > 0
}

function isTokenBody(value: unknown): value is { token: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.token === "string" && candidate.token.length > 0
}

/**
 * Tolerantly parses a fetch `Response` body as JSON, matching
 * `hooks/use-collaborators.ts#parseJson`'s own convention — a non-JSON or
 * empty body is treated as `null` (which then fails the shape checks above)
 * rather than throwing out of this spec's own try/catch at an unexpected
 * point.
 */
async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Fallback AI-authored message pushed onto `ai-chat` once this client's own
 * triggered run completes successfully, used only when
 * `realtimeRun.output?.summary` (spec 32, the model's own real explanation of
 * what it changed and why) is missing, empty, or not a string — a run must
 * never push an empty or malformed chat message (acceptance criterion 7).
 * Before spec 32 this was the only completion message; it is now strictly a
 * fallback.
 */
const DESIGN_AGENT_SUCCESS_MESSAGE =
  "I've updated the canvas based on your prompt — take a look!"

/**
 * Resolves the real completion message for a successfully settled run: the
 * model's own `summary` (spec 32, acceptance criterion 6) when it is a
 * genuine non-empty string, otherwise the generic fallback above (acceptance
 * criterion 7). `run.output` is typed as `DesignAgentResult | undefined` via
 * `useRealtimeRun<typeof designAgentTask>`'s generic — see this file's
 * `designAgentTask` type-only import — so `output?.summary` is real,
 * non-`any` access, not a cast.
 */
function resolveSuccessMessage(summary: string | undefined): string {
  return typeof summary === "string" && summary.length > 0 ? summary : DESIGN_AGENT_SUCCESS_MESSAGE
}

/**
 * Error-describing message pushed onto `ai-chat` for any failure mode
 * (acceptance criterion 7): the initial `POST` calls failing before a
 * `runId`/subscription ever exists, or the triggered run itself reaching a
 * failed/errored terminal state. `detail`, when available (e.g. a triggered
 * run's own `error.message`), is appended for a more legible message —
 * omitted entirely for the pre-`runId` failure path, which has no
 * comparable structured detail to surface.
 */
function buildDesignAgentFailureMessage(detail?: string): string {
  return detail
    ? `Sorry, something went wrong while generating your design: ${detail}`
    : "Sorry, something went wrong while generating your design. Please try again."
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
 * the room-broadcast `ai-status-feed`, not local submit-flow state. Nothing
 * else in this component — starter chips, the message list, tab switching
 * (owned by `AiSidebar`) — is disabled or dimmed (both specs' own explicit
 * Scope Limit).
 *
 * Spec 26 turns submit into a real orchestration: after the existing
 * `sendMessage` push onto `ai-chat` (above), it calls `POST /api/ai/design`
 * (`{ prompt, roomId: projectId, projectId }`) for a `runId`, then
 * `POST /api/ai/design/token` (`{ runId }`) for a run-scoped public token
 * (spec 22's own two-call design — see spec 26's Analyst Brief, Open
 * Questions #2), storing both in local state. `useRealtimeRun` (from the
 * newly-installed `@trigger.dev/react-hooks`) tracks that specific run;
 * once it reaches a terminal state, a final AI-authored or error-describing
 * message is pushed onto `ai-chat` via `sendAgentMessage` (a `useEffect`
 * guarded by a `handledRunIdRef` ref, not a second piece of derived state,
 * so it fires exactly once per run — that ref-guard shape is what keeps
 * `react-hooks/set-state-in-effect` from firing even though the effect does
 * call `setState` once, directly, after pushing the message). On settling,
 * the effect also resets the local `runId`/`publicToken` state back to
 * `null` on both the success and failure branches, so `enabled:
 * Boolean(runId && publicToken)` correctly falls back to "no run associated
 * with this client" — see `handledRunIdRef`'s own doc in the component
 * body. This local state deliberately lives here, not threaded through the
 * Liveblocks room boundary — `useRealtimeRun` takes its `accessToken`
 * directly as a hook argument and has no dependency on
 * `RoomProvider`/any Liveblocks context. See spec 26's Analyst Brief, Open
 * Questions #3.
 *
 * A local "this client's own run is still in flight" signal (from the
 * moment of submission until `useRealtimeRun` reports a terminal state) is
 * OR-ed into the existing `aiStatus`-driven `isGenerating` condition for the
 * `Textarea`/Send button's `disabled` state and spinner — closing the real
 * timing gap between submission and `ai-status-feed`'s first broadcast that
 * `isGenerating` alone doesn't cover (spec 26's Analyst Brief, Open
 * Questions #6). The status *line* itself stays gated on `isGenerating`
 * alone — spec 24's already-shipped element, not duplicated by a second one
 * (spec 26's Analyst Brief, Open Questions #4).
 *
 * Spec 32 makes two further changes on top of the above, both reusing this
 * exact pipeline unchanged: (1) the completion effect's success branch now
 * reads the model's real `realtimeRun.output?.summary` (typed via
 * `useRealtimeRun<typeof designAgentTask>`'s generic) instead of always
 * pushing the same hardcoded string — see `resolveSuccessMessage`; (2) a
 * "Critique this design" quick action (`handleCritique`) submits a fixed
 * critique prompt through the same `submitPromptText`/`submitDesignRequest`
 * path `handleSubmit` already used for typed prompts — no new request shape,
 * no new endpoint.
 */
export function AiArchitectTab({
  projectId = "",
  aiStatus = null,
  chatMessages = [],
  sendMessage = chatNotReadyYet,
  sendAgentMessage = agentChatNotReadyYet,
}: AiArchitectTabProps) {
  const [input, setInput] = useState("")
  const [sendError, setSendError] = useState(false)
  const [isSubmittingRun, setIsSubmittingRun] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [publicToken, setPublicToken] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  /**
   * Tracks the most recently `pushAgentMessage`-handled `runId`, so the
   * completion effect below fires exactly once per run — a ref mutation
   * (not a second piece of state derived from the same effect's own
   * inputs) is what keeps this guard from tripping
   * `react-hooks/set-state-in-effect`; a single `setState` call made
   * directly inside the effect body, gated by this ref, does not trigger
   * that rule. Once a run settles, the effect resets `runId`/`publicToken`
   * back to `null` on both the success and failure branches (confirmed via
   * `npx eslint` that this does not reintroduce the lint violation), so
   * `isOwnRunInFlight`/`isBusy` fall back to `false` and `enabled:
   * Boolean(runId && publicToken)` stops referring to a run that has
   * already completed.
   */
  const handledRunIdRef = useRef<string | null>(null)

  const { run: realtimeRun } = useRealtimeRun<typeof designAgentTask>(runId ?? undefined, {
    accessToken: publicToken ?? undefined,
    enabled: Boolean(runId && publicToken),
  })

  /**
   * Whether the run identified by the current `runId` state has both (a)
   * actually reached the `useRealtimeRun` subscription (`realtimeRun.id ===
   * runId` — not just `realtimeRun` being truthy) and (b) reached a terminal
   * state. The `realtimeRun.id === runId` check specifically guards against
   * `useRealtimeRun`'s internal subscription state being keyed by a stable
   * per-hook-call id (React's `useId()`), not by `runId` itself — a
   * *previous* run's already-settled data can still be sitting there for a
   * render or two right after a new `runId` is set, before the new
   * subscription's first event actually arrives. Without this guard,
   * submitting a second prompt could immediately (and incorrectly) read as
   * "already settled" off the prior run's stale, already-completed data.
   */
  const isRunSettled = Boolean(
    runId && realtimeRun && realtimeRun.id === runId && realtimeRun.isCompleted,
  )

  const isGenerating = aiStatus !== null && ACTIVE_GENERATION_STAGES.has(aiStatus.stage)
  // Covers the window this client's own submit flow knows about that
  // `aiStatus` alone can't: from the moment Send is clicked (before a
  // `runId` even exists) through to the triggered run reaching a terminal
  // state (see this component's own docblock above).
  const isOwnRunInFlight = isSubmittingRun || (runId !== null && !isRunSettled)
  const isBusy = isGenerating || isOwnRunInFlight

  /**
   * Wraps `sendAgentMessage` so a secondary failure (e.g. the room
   * genuinely disconnected) can't mask the original success/failure this
   * call is trying to report — same "wrap in its own catch" convention
   * `trigger/design-agent.ts` already established for its own
   * status/presence broadcasts.
   */
  const pushAgentMessage = useCallback(
    (content: string) => {
      try {
        sendAgentMessage(content)
      } catch (error) {
        console.error("Failed to push an AI-authored message onto ai-chat", error)
      }
    },
    [sendAgentMessage],
  )

  /**
   * Reacts to this client's own triggered run reaching a terminal state
   * (acceptance criteria 6/7) — pushes the final AI-authored/error message
   * exactly once per `runId` (`handledRunIdRef` guard), then clears the
   * local `runId`/`publicToken` state the same way the pre-`runId`
   * POST-failure path in `submitDesignRequest`'s own `catch` block already
   * does, so `enabled: Boolean(runId && publicToken)` correctly falls back
   * to "no run associated with this client" once the run has settled.
   */
  useEffect(() => {
    if (!isRunSettled || !runId || !realtimeRun) return
    if (handledRunIdRef.current === runId) return
    handledRunIdRef.current = runId

    if (realtimeRun.isSuccess) {
      pushAgentMessage(resolveSuccessMessage(realtimeRun.output?.summary))
    } else {
      pushAgentMessage(buildDesignAgentFailureMessage(realtimeRun.error?.message))
    }

    setRunId(null)
    setPublicToken(null)
  }, [isRunSettled, runId, realtimeRun, pushAgentMessage])

  const submitDesignRequest = useCallback(
    async (prompt: string) => {
      setIsSubmittingRun(true)

      try {
        const designResponse = await fetch("/api/ai/design", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt, roomId: projectId, projectId }),
        })
        const designBody = await parseJsonBody(designResponse)
        if (!designResponse.ok || !isRunIdBody(designBody)) {
          throw new Error("Failed to start design generation")
        }

        const tokenResponse = await fetch("/api/ai/design/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId: designBody.runId }),
        })
        const tokenBody = await parseJsonBody(tokenResponse)
        if (!tokenResponse.ok || !isTokenBody(tokenBody)) {
          throw new Error("Failed to obtain a design run token")
        }

        setRunId(designBody.runId)
        setPublicToken(tokenBody.token)
      } catch {
        // Failure before a `runId`/subscription ever existed (acceptance
        // criterion 7) — no `useRealtimeRun` state to clear.
        pushAgentMessage(buildDesignAgentFailureMessage())
        setRunId(null)
        setPublicToken(null)
      } finally {
        setIsSubmittingRun(false)
      }
    },
    [projectId, pushAgentMessage],
  )

  /**
   * Shared submit path for both the typed-prompt flow (`handleSubmit`) and
   * the "Critique this design" quick action (`handleCritique`, spec 32) —
   * both push the prompt onto `ai-chat` via `sendMessage` and then route it
   * through the exact same `submitDesignRequest`/`POST /api/ai/design`
   * pipeline, per acceptance criterion 9. Only the source of `promptText`
   * and what happens to the textarea afterward differ between the two
   * callers.
   */
  function submitPromptText(promptText: string): boolean {
    try {
      sendMessage(promptText)
    } catch {
      // Preserve the input's contents on failure (spec 25's acceptance
      // criterion 4) — no `setInput("")` here, and the design-agent request
      // never starts if the prompt itself couldn't even be recorded in
      // `ai-chat`.
      setSendError(true)
      return false
    }

    setSendError(false)
    void submitDesignRequest(promptText)
    return true
  }

  function handleSubmit() {
    const trimmed = input.trim()
    if (!trimmed || isBusy) return

    if (submitPromptText(trimmed)) {
      setInput("")
    }
  }

  /**
   * "Critique this design" quick action (spec 32, Open Questions #2).
   * Auto-submits the fixed `CRITIQUE_PROMPT` directly — rather than only
   * filling the textarea like `handleStarterPrompt` — since the raw spec
   * text describes this control as "submitting" a fixed prompt, a
   * deliberately different, one-click contract from the starter chips' own
   * documented fill-only behavior (`ui-context.md`). Routes through the same
   * `submitPromptText`/`submitDesignRequest` path a typed prompt uses, so
   * the request shape hitting `POST /api/ai/design` is identical either way.
   */
  function handleCritique() {
    if (isBusy) return
    submitPromptText(CRITIQUE_PROMPT)
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
        {/*
          Spec 32: "Critique this design" quick action. Deliberately rendered
          here — near the input row, outside the `chatMessages.length === 0`
          empty-state block the `STARTER_PROMPTS` chips live in — so it stays
          reachable for the entire lifetime of a room session, not only
          before the first message is ever sent (Open Questions #2(b)). A
          distinct control from the starter chips: clicking it submits
          immediately (Open Questions #2(a)) rather than only filling the
          textarea.
        */}
        <button
          type="button"
          onClick={handleCritique}
          disabled={isBusy}
          className="flex w-fit items-center gap-1.5 self-start rounded-full border border-surface-border bg-elevated px-3 py-1.5 text-xs text-ai-text hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          Critique this design
        </button>
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe your system..."
            aria-label="Message Ghost AI"
            disabled={isBusy}
            className="min-h-[72px] max-h-[160px] resize-none overflow-y-auto text-copy-primary"
          />
          <Button
            type="button"
            size="icon"
            onClick={handleSubmit}
            disabled={!input.trim() || isBusy}
            className="shrink-0 bg-ai text-copy-primary hover:bg-ai/80"
          >
            {isBusy ? <Loader2 className="animate-spin" /> : <Send />}
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
