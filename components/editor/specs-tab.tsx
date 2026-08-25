"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRealtimeRun } from "@trigger.dev/react-hooks"
import { AlertCircle, Download, FileCode, FileText, Loader2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SpecPreviewModal } from "@/components/editor/spec-preview-modal"
import { useProjectSpecs, type ProjectSpecSummary } from "@/hooks/use-project-specs"
import { cn } from "@/lib/utils"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"
import type { AiChatMessage } from "@/types/tasks"
import type { GenerateSpecGraphEdge, GenerateSpecGraphNode } from "@/lib/generate-spec-ai"

interface SpecsTabProps {
  /** The current project's ID -- needed for `useProjectSpecs`' own `GET
   * /api/projects/[projectId]/specs` call and every download/preview URL
   * built below. Threaded down from `AiSidebar` (spec 29). */
  projectId: string
  /**
   * The room's live canvas nodes/edges (spec 30), threaded down from
   * `WorkspaceShell` -> `AiSidebar` via the new `onCanvasGraphChange`
   * push-up. Converted into `POST /api/ai/spec`'s narrower request shape by
   * `toGenerateSpecNodes`/`toGenerateSpecEdges` below. Default to an empty
   * array so this component still renders standalone (e.g. in a test) with
   * nothing wired up.
   */
  nodes?: CanvasNode[]
  edges?: CanvasEdge[]
  /**
   * The room's ordered, schema-validated `ai-chat` messages (spec 25),
   * already threaded to `WorkspaceShell`/`AiSidebar` -- this spec just adds
   * it one hop further to this component's own prop list (no new plumbing
   * needed, per this spec's Analyst Brief, Open Questions #3). Sent as-is
   * as `POST /api/ai/spec`'s `chatHistory` field. Defaults to an empty array,
   * same convention as `nodes`/`edges` above.
   */
  chatMessages?: AiChatMessage[]
}

/**
 * Converts the room's full React Flow `CanvasNode`/`CanvasEdge` shapes into
 * the narrower `GenerateSpecGraphNode`/`GenerateSpecGraphEdge` structural
 * summary `POST /api/ai/spec`'s Zod schema expects (`lib/generate-spec-ai.ts`,
 * reused unmodified by `trigger/generate-spec.ts`). A small, pure, synchronous
 * mapping -- no network call, no business logic -- kept inline in this file
 * per this spec's Analyst Brief, Open Questions #4/#5 (types imported from
 * `lib/generate-spec-ai.ts`, their real origin, not `trigger/generate-spec.ts`,
 * keeping this `components/*` file's import graph off `trigger/*` entirely,
 * even at the type-only level).
 */
function toGenerateSpecNodes(nodes: CanvasNode[]): GenerateSpecGraphNode[] {
  return nodes.map((node) => ({
    id: node.id,
    label: node.data.label,
    shape: node.data.shape,
    x: node.position.x,
    y: node.position.y,
  }))
}

function toGenerateSpecEdges(edges: CanvasEdge[]): GenerateSpecGraphEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    label: edge.data?.label,
  }))
}

/**
 * Shallow runtime shape-checks for `POST /api/ai/spec`'s and
 * `POST /api/ai/spec/token`'s response bodies (`{ runId }`/`{ token }`) --
 * the same convention `ai-architect-tab.tsx`'s `isRunIdBody`/`isTokenBody`
 * already established for the design-agent's own two-call sequence. Kept as
 * a local, deliberately duplicated pair rather than a shared import -- this
 * spec's own Scope Limit forbids touching the design-agent flow, and no
 * shared module for this narrow shape-check currently exists.
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

/** Tolerantly parses a fetch `Response` body as JSON -- same convention as
 * `ai-architect-tab.tsx#parseJsonBody`/`hooks/use-collaborators.ts#parseJson`. */
async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/** Inline error copy shown near the "Generate Spec" button on any failure
 * mode (the initial POST, the token exchange, or the run itself settling as
 * failed/errored) -- same `detail`-when-available convention as
 * `ai-architect-tab.tsx#buildDesignAgentFailureMessage`. */
function buildGenerateSpecFailureMessage(detail?: string): string {
  return detail
    ? `Failed to generate a spec: ${detail}`
    : "Failed to generate a spec. Please try again."
}

/** Formats a spec's ISO `createdAt` for display next to its filename. Locale
 * pinned to `"en-US"` for a deterministic format *shape* across
 * environments, same convention `ai-architect-tab.tsx#formatMessageTimestamp`
 * already established for chat bubble timestamps. */
function formatCreatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
}

/**
 * Specs tab (spec 20's static shell, rewritten by spec 29): a real, fetched
 * list of the current project's generated specs (`useProjectSpecs`, backed
 * by spec 28's `GET /api/projects/[projectId]/specs`), rendered as a
 * compact, scrollable shadcn `ScrollArea` list inside the existing sidebar
 * shell -- only this tab's own internal content changes, `ai-sidebar.tsx`'s
 * header/tab structure stays as spec 20 built it (only the wrapping
 * `TabsContent`'s className was adjusted to match the AI Architect tab's own
 * proven `flex flex-1 flex-col overflow-hidden` layout, needed so this
 * component's internal `ScrollArea` gets a real bounded height to scroll
 * within).
 *
 * Clicking a list item opens `SpecPreviewModal`. Each item also carries its
 * own real `<a href download>` download action pointed at spec 28's
 * download route -- the same route the preview modal's own download button
 * uses, and the same route the modal's `fetch()`-based preview reads from
 * (spec 29's Analyst Brief, Open Questions #2). No Blob URL is ever read or
 * constructed client-side.
 *
 * Spec 35 adds a second, adjacent download action pointed at the new
 * `download-iac` route, downloading the same spec's generated Terraform
 * skeleton (a distinct icon, `FileCode`, so the two aren't visually
 * identical). Rendered as a real `<a href download>` when `spec.hasIac` is
 * `true`; rendered as a visibly-present but natively `disabled` shadcn
 * `Button` (not a live 404-prone link, not omitted entirely) when `false` --
 * a spec generated before spec 35 shipped never has Terraform content to
 * download (spec 35's Analyst Brief, Open Questions #4).
 *
 * Spec 30 wires the "Generate Spec" button: `handleGenerateSpec` converts the
 * current `nodes`/`edges` props via `toGenerateSpecNodes`/`toGenerateSpecEdges`
 * above, then runs the same two-call trigger/token/`useRealtimeRun` sequence
 * `ai-architect-tab.tsx` (spec 26) already established for the design agent
 * -- local `runId`/`publicToken`/`isSubmittingRun` state, a
 * `handledRunIdRef`-guarded completion effect, and the same
 * `realtimeRun.id === runId` staleness guard against `useRealtimeRun`'s
 * stale-previous-run data. On success, calls `useProjectSpecs`'s own
 * `refetch()` so the new spec appears in the list without a manual reload.
 * On any failure (a failed initial POST, a failed token exchange, or the run
 * itself settling as failed/errored), an inline error appears near the
 * button (`text-state-error`/`AlertCircle`, matching
 * `SaveStatusIndicator`'s/`ai-architect-tab.tsx`'s existing convention).
 * `runId`/`publicToken` reset to `null` on both branches once the run
 * settles, so a subsequent click starts a genuinely new run. The button is
 * `disabled` for the combined "this client's own run is in flight" window
 * (`isSubmittingRun || (runId !== null && !isRunSettled)`) -- the same
 * combined-busy convention `ai-architect-tab.tsx` uses. Nothing else in this
 * tab (the existing list, preview modal, download actions) is gated by this
 * state -- this spec's own explicit acceptance criterion.
 */
export function SpecsTab({ projectId, nodes = [], edges = [], chatMessages = [] }: SpecsTabProps) {
  const { specs, isLoading, error, refetch } = useProjectSpecs(projectId)
  const [previewSpec, setPreviewSpec] = useState<ProjectSpecSummary | null>(null)

  const [isSubmittingRun, setIsSubmittingRun] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [publicToken, setPublicToken] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  /**
   * Tracks the most recently handled `runId`, so the completion effect below
   * reacts exactly once per run -- same ref-guard shape (not a second piece
   * of derived state) `ai-architect-tab.tsx#handledRunIdRef` already
   * established, for the same `react-hooks/set-state-in-effect` reason.
   */
  const handledRunIdRef = useRef<string | null>(null)

  const { run: realtimeRun } = useRealtimeRun(runId ?? undefined, {
    accessToken: publicToken ?? undefined,
    enabled: Boolean(runId && publicToken),
  })

  /**
   * Whether the run identified by the current `runId` state has both reached
   * the `useRealtimeRun` subscription (`realtimeRun.id === runId`, not just
   * `realtimeRun` being truthy) and reached a terminal state -- guards
   * against a *previous* run's already-settled data still sitting in
   * `useRealtimeRun`'s internal per-hook-call subscription state for a
   * render or two right after a new `runId` is set. Same guard
   * `ai-architect-tab.tsx#isRunSettled` already established.
   */
  const isRunSettled = Boolean(
    runId && realtimeRun && realtimeRun.id === runId && realtimeRun.isCompleted,
  )
  const isBusy = isSubmittingRun || (runId !== null && !isRunSettled)

  /**
   * Reacts to this client's own triggered run reaching a terminal state:
   * refetches the spec list on success, shows an inline error on failure,
   * and resets `runId`/`publicToken` back to `null` on both branches --
   * mirroring `ai-architect-tab.tsx`'s own completion effect exactly.
   *
   * The conditional *value* for `generateError` is computed first (a plain
   * ternary), then every `setState` call in this effect (`setGenerateError`/
   * `setRunId`/`setPublicToken`) happens unconditionally at the effect's own
   * top level, once the two early-return guards above have passed --
   * `react-hooks/set-state-in-effect` flags a `setState` call found directly
   * inside an `if`/`else` branch, not one made unconditionally after
   * branching logic has already resolved to a plain value. `refetch()` (a
   * plain callback from `useProjectSpecs`, not a `useState` setter this
   * component owns) stays inside its own `if` branch since it isn't a
   * locally-recognized `setState` call the rule tracks.
   */
  useEffect(() => {
    if (!isRunSettled || !runId || !realtimeRun) return
    if (handledRunIdRef.current === runId) return
    handledRunIdRef.current = runId

    if (realtimeRun.isSuccess) {
      void refetch()
    }

    setGenerateError(
      realtimeRun.isSuccess ? null : buildGenerateSpecFailureMessage(realtimeRun.error?.message),
    )
    setRunId(null)
    setPublicToken(null)
  }, [isRunSettled, runId, realtimeRun, refetch])

  const handleGenerateSpec = useCallback(async () => {
    setIsSubmittingRun(true)
    setGenerateError(null)

    try {
      const specResponse = await fetch("/api/ai/spec", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: projectId,
          chatHistory: chatMessages,
          nodes: toGenerateSpecNodes(nodes),
          edges: toGenerateSpecEdges(edges),
        }),
      })
      const specBody = await parseJsonBody(specResponse)
      if (!specResponse.ok || !isRunIdBody(specBody)) {
        throw new Error("Failed to start spec generation")
      }

      const tokenResponse = await fetch("/api/ai/spec/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: specBody.runId }),
      })
      const tokenBody = await parseJsonBody(tokenResponse)
      if (!tokenResponse.ok || !isTokenBody(tokenBody)) {
        throw new Error("Failed to obtain a spec run token")
      }

      setRunId(specBody.runId)
      setPublicToken(tokenBody.token)
    } catch {
      // Failure before a `runId`/subscription ever existed -- no
      // `useRealtimeRun` state to clear.
      setGenerateError(buildGenerateSpecFailureMessage())
      setRunId(null)
      setPublicToken(null)
    } finally {
      setIsSubmittingRun(false)
    }
  }, [projectId, chatMessages, nodes, edges])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-2 p-4">
        <Button type="button" className="w-full" onClick={handleGenerateSpec} disabled={isBusy}>
          {isBusy ? <Loader2 className="animate-spin" /> : null}
          Generate Spec
        </Button>
        {generateError ? (
          <div className="flex items-center gap-2 text-xs text-state-error">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{generateError}</span>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 px-4 pb-4">
        {error ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-xs text-state-error">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-copy-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading specs…
          </div>
        ) : specs.length === 0 ? (
          <p className="py-6 text-center text-sm text-copy-muted">No specs generated yet.</p>
        ) : (
          <ScrollArea className="h-full">
            <ul className="flex flex-col gap-2 pr-3">
              {specs.map((spec) => (
                <li key={spec.id}>
                  <div className="flex items-start gap-2 rounded-2xl border border-surface-border bg-elevated p-3">
                    <button
                      type="button"
                      onClick={() => setPreviewSpec(spec)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-subtle text-ai-text">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-copy-primary">{spec.filename}</p>
                        <p className="truncate text-xs text-copy-muted">{formatCreatedAt(spec.createdAt)}</p>
                      </div>
                    </button>
                    <a
                      href={`/api/projects/${projectId}/specs/${spec.id}/download`}
                      download
                      className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "shrink-0")}
                    >
                      <Download />
                      <span className="sr-only">Download {spec.filename}</span>
                    </a>
                    {spec.hasIac ? (
                      <a
                        href={`/api/projects/${projectId}/specs/${spec.id}/download-iac`}
                        download
                        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "shrink-0")}
                      >
                        <FileCode />
                        <span className="sr-only">Download {spec.filename} as Terraform</span>
                      </a>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled
                        className="shrink-0"
                      >
                        <FileCode />
                        <span className="sr-only">Download {spec.filename} as Terraform</span>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>

      <SpecPreviewModal
        projectId={projectId}
        spec={previewSpec}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewSpec(null)
          }
        }}
      />
    </div>
  )
}
