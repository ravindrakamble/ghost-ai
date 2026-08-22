"use client"

import { useState } from "react"
import { Bot, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AiArchitectTab } from "@/components/editor/ai-architect-tab"
import { SpecsTab } from "@/components/editor/specs-tab"
import type {
  AiChatMessage,
  AiStatusMessage,
  SendAgentChatMessage,
  SendChatMessage,
} from "@/types/tasks"

interface AiSidebarProps {
  isOpen: boolean
  onClose: () => void
  /**
   * The current project's ID (spec 26) — `AiArchitectTab`'s submit flow
   * needs it directly for `POST /api/ai/design`'s `{ prompt, roomId,
   * projectId }` body (both fields must equal the current project's ID, per
   * that route's own validation). Forwarded straight through, no new state
   * owned here.
   */
  projectId: string
  /**
   * Latest validated `ai-status-feed` message (spec 24), pushed down from
   * `WorkspaceShell` (via `Canvas`'s `onAiStatusChange` callback) — forwarded
   * straight through to `AiArchitectTab`, the only tab that renders anything
   * off of it. No new state owned here, per the brief's "pass the real
   * mechanism down as props" posture (specs 18/21 precedent).
   */
  aiStatus: AiStatusMessage | null
  /**
   * Ordered, schema-validated `ai-chat` messages (spec 25), pushed down from
   * `WorkspaceShell` (via `Canvas`'s `onChatMessagesChange` callback) —
   * forwarded straight through to `AiArchitectTab`. Same posture as
   * `aiStatus` above.
   */
  chatMessages: AiChatMessage[]
  /**
   * The real, room-connected function to send a chat message (spec 25),
   * threaded down from `WorkspaceShell` (via `Canvas`'s
   * `onSendChatMessageChange` callback, the bidirectional counterpart
   * `aiStatus` didn't need) — forwarded straight through to
   * `AiArchitectTab`, the component that owns the input/Send button.
   */
  sendChatMessage: SendChatMessage
  /**
   * The real, room-connected function to push an AI-authored/error message
   * onto `ai-chat` (spec 26), threaded down from `WorkspaceShell` (via
   * `Canvas`'s `onSendAgentMessageChange` callback) — forwarded straight
   * through to `AiArchitectTab`, the component that owns the
   * `useRealtimeRun` subscription that calls it.
   */
  sendAgentMessage: SendAgentChatMessage
}

/** Active vs. inactive tab styling — see the brief's Open Questions #2:
 * reuses the same `bg-accent-dim`/`text-brand` "active" pairing
 * `project-sidebar.tsx`/`share-dialog.tsx` already establish.
 *
 * Both the plain `data-active:` pair AND the `dark:data-active:` pair are
 * required. `components/ui/tabs.tsx` bakes in two competing rule sets for
 * the active state: `data-active:bg-background data-active:text-foreground`
 * (plain) and `dark:data-active:border-input dark:data-active:bg-input/30
 * dark:data-active:text-foreground` (dark-mode-specific). Overriding with
 * only the plain `data-active:*` pair (as an earlier fix attempt did) drops
 * the base's plain rules via `tailwind-merge`, but the dark-prefixed rules
 * survive untouched — and since this app's `<html>` always carries the
 * `dark` class (see `app/layout.tsx`, no light/dark toggle exists), the
 * `dark:data-active:bg-input/30`/`dark:data-active:text-foreground` selectors
 * (`.dark\:data-active\:bg-input\/30:is(.dark *)...`) carry a higher class
 * count than our plain `data-active:bg-accent-dim` override, so they still
 * win on real specificity even after the plain-pair fix — verified with a
 * real `next build` + Playwright `getComputedStyle()` check. Matching both
 * modifier combinations (`data-active:` and `dark:data-active:`) puts our
 * override in the same `tailwind-merge` conflict group as *both* of the
 * base's competing rule sets, so both are correctly dropped. */
const TAB_TRIGGER_CLASS_NAME =
  "flex-1 text-copy-muted data-active:bg-accent-dim data-active:text-brand dark:data-active:bg-accent-dim dark:data-active:text-brand"

/**
 * Standalone AI sidebar shell (spec 20) — supersedes `AiSidebarPlaceholder`.
 * Preserves the placeholder's floating position (`absolute top-0 right-0`,
 * full height, `w-80`), slide transform, and border/background treatment
 * exactly (see the brief's Open Questions #1), and adds a real header plus
 * an "AI Architect"/"Specs" tabbed layout. `isOpen` stays controlled by
 * `WorkspaceShell`'s existing `isAiSidebarOpen` state; the new in-sidebar
 * close button calls the new `onClose` prop `WorkspaceShell` wires to
 * `setIsAiSidebarOpen(false)`.
 *
 * Presentational only — this file itself makes no Liveblocks calls, no
 * `/api/ai/*` calls, and no Trigger.dev calls. Spec 24 adds the `aiStatus`
 * prop above, a plain value forwarded straight through to `AiArchitectTab`
 * (the room-scoped `ai-status-feed` subscription itself lives in
 * `CanvasFlow`, inside the Liveblocks room boundary this component sits
 * outside of — see `components/editor/canvas.tsx`'s docblock). Spec 25 adds
 * `chatMessages`/`sendChatMessage` the same way — the real `ai-chat` Storage
 * subscription and mutation both live in `CanvasFlow` too.
 *
 * Spec 26 adds `projectId`/`sendAgentMessage` the same "forward straight
 * through" way — the actual `/api/ai/*` calls and `useRealtimeRun`
 * subscription live in `AiArchitectTab` itself, not in this shell.
 *
 * Spec 29 threads the same, already-received `projectId` prop straight
 * through to `SpecsTab` too (it needs it for `useProjectSpecs`' own fetch
 * and every preview/download URL it builds) — no new state owned here, and
 * the Specs tab's own `TabsContent` className was widened from a plain
 * `flex-1 overflow-y-auto` to the same `flex flex-1 flex-col
 * overflow-hidden` the AI Architect tab's `TabsContent` already uses, so
 * `SpecsTab`'s own internal `ScrollArea` gets a real bounded height rather
 * than relying on this ancestor's overflow. Triggering a *new*
 * spec-generation run from the "Generate Spec" button remains out of scope
 * (see `SpecsTab`'s own docblock).
 */
export function AiSidebar({
  isOpen,
  onClose,
  projectId,
  aiStatus,
  chatMessages,
  sendChatMessage,
  sendAgentMessage,
}: AiSidebarProps) {
  const [activeTab, setActiveTab] = useState<"architect" | "specs">("architect")

  return (
    <aside
      aria-hidden={!isOpen}
      className={`absolute top-0 right-0 z-10 flex h-full w-80 flex-col border-l border-surface-border bg-elevated/95 backdrop-blur transition-transform duration-200 ease-in-out ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-surface-border px-4">
        <Bot className="h-5 w-5 shrink-0 text-ai-text" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-copy-primary">AI Workspace</p>
          <p className="truncate text-xs text-copy-muted">Collaborate with Ghost AI</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X />
          <span className="sr-only">Close AI sidebar</span>
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "architect" | "specs")}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList className="mx-3 mt-3 w-auto">
          <TabsTrigger value="architect" className={TAB_TRIGGER_CLASS_NAME}>
            AI Architect
          </TabsTrigger>
          <TabsTrigger value="specs" className={TAB_TRIGGER_CLASS_NAME}>
            Specs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="architect" keepMounted className="flex flex-1 flex-col overflow-hidden">
          <AiArchitectTab
            projectId={projectId}
            aiStatus={aiStatus}
            chatMessages={chatMessages}
            sendMessage={sendChatMessage}
            sendAgentMessage={sendAgentMessage}
          />
        </TabsContent>
        <TabsContent value="specs" className="flex flex-1 flex-col overflow-hidden">
          <SpecsTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </aside>
  )
}
