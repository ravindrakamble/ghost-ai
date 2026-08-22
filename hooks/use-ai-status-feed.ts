"use client"

import { useState } from "react"
import { useEventListener } from "@liveblocks/react/suspense"
import { isAiStatusMessage, type AiStatusMessage } from "@/types/tasks"

/**
 * Subscribes to the room's `ai-status-feed` broadcast event (spec 23's
 * producer, `lib/design-agent-room.ts#broadcastDesignAgentStatus`) via
 * Liveblocks' real `useEventListener` (`@liveblocks/react/suspense`) — not
 * polling, not a second websocket, not a parallel realtime system, per
 * `architecture-context.md`'s Realtime Conventions and this spec's
 * acceptance criterion 3.
 *
 * Every incoming event is validated through `isAiStatusMessage`
 * (`types/tasks.ts`) before it can update state — an invalid/foreign
 * broadcast on the same room is discarded, not applied (acceptance
 * criterion 2). Only the single latest valid message is kept — no
 * list/history of past status messages (acceptance criterion 3, this
 * spec's own Scope Limits).
 *
 * Must be called from a component already inside the room's `RoomProvider`
 * boundary — `useEventListener` requires the Liveblocks room context. See
 * spec 24's Analyst Brief, Open Questions #1: `CanvasFlow`
 * (`components/editor/canvas.tsx`) is that component, pushing the latest
 * value up to `WorkspaceShell`/`AiSidebar` via a callback prop rather than
 * this hook being called from the (out-of-boundary) sidebar directly.
 */
export function useAiStatusFeed(): AiStatusMessage | null {
  const [latestStatus, setLatestStatus] = useState<AiStatusMessage | null>(null)

  useEventListener(({ event }) => {
    if (isAiStatusMessage(event)) {
      setLatestStatus(event)
    }
  })

  return latestStatus
}
