"use client"

import { Loader2 } from "lucide-react"
import { shallow, useOther, useOthersConnectionIds } from "@liveblocks/react/suspense"
import { useViewport, type XYPosition } from "@xyflow/react"
import { useCurrentUserId } from "@/hooks/use-current-user-id"

interface LiveCursorsProps {
  /**
   * `CanvasFlow`'s existing `useReactFlow()` call's own `flowToScreenPosition`
   * — converts a presence cursor's stored flow-space `{ x, y }` back to
   * screen coordinates, undoing the `screenToFlowPosition` conversion
   * applied when it was written. Threaded down as a prop (the same
   * "mechanism the parent already has, passed down" convention every prior
   * canvas-overlay component uses, e.g. `CanvasControlBar`'s zoom handlers)
   * rather than calling `useReactFlow()` a second time here.
   */
  flowToScreenPosition: (flowPosition: XYPosition) => XYPosition
}

interface CursorPresence {
  id: string
  name: string
  color: string
  cursor: XYPosition | null
  /**
   * Spec 24 (AI Presence State): the pinned `Presence.thinking` field
   * (`liveblocks.config.ts`), read directly off `other.presence` — decorates
   * the name badge with a small spinner while `true`. Note this only ever
   * has anything to attach to when `other.cursor` is also non-null (the
   * early-return below is unchanged) — spec 23's own presence semantics
   * leave the AI's `cursor` `null` for most of `start`/early-`processing`,
   * so the spinner is a best-effort secondary signal, not the reliable one
   * (that's the sidebar status line, spec 24's Analyst Brief, Open
   * Questions #3).
   */
  thinking: boolean
}

/**
 * Renders one small colored pointer + name badge per other participant with
 * a non-null presence `cursor` — spec 19. Uses `useOthersConnectionIds()`
 * (join/leave-only re-renders) to get the list of connections to render,
 * then a per-connection `LiveCursor` child subscribed via `useOther()` so
 * each cursor only re-renders on *its own* presence changes — the same
 * per-cursor-subscription shape `@liveblocks/react-flow`'s own bundled
 * `<Cursors />`/`PresenceCursor` uses (read as reference at
 * `node_modules/@liveblocks/react-flow/dist/cursors.js`, not imported — see
 * spec 19's Analyst Brief, Open Questions #1). `aria-hidden` on the whole
 * overlay, matching that same reference component's convention — display
 * only, never intercepts pointer events (`pointer-events-none`).
 */
export function LiveCursors({ flowToScreenPosition }: LiveCursorsProps) {
  const connectionIds = useOthersConnectionIds()

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-20">
      {connectionIds.map((connectionId) => (
        <LiveCursor key={connectionId} connectionId={connectionId} flowToScreenPosition={flowToScreenPosition} />
      ))}
    </div>
  )
}

function LiveCursor({
  connectionId,
  flowToScreenPosition,
}: {
  connectionId: number
  flowToScreenPosition: (flowPosition: XYPosition) => XYPosition
}) {
  const currentUserId = useCurrentUserId()
  const other = useOther<CursorPresence>(
    connectionId,
    (candidate) => ({
      id: candidate.id,
      name: candidate.info.name,
      color: candidate.info.color,
      cursor: candidate.presence.cursor,
      thinking: candidate.presence.thinking,
    }),
    shallow,
  )
  // Re-renders this one cursor whenever the local viewport pans/zooms too,
  // so its screen position stays correct even between presence updates from
  // this particular participant — `useViewport` is `@xyflow/react`'s own
  // reactive read of the current pan/zoom transform, a much lighter
  // subscription than duplicating the imperative store-subscription/DOM-ref
  // mechanism `@liveblocks/react-flow`'s own `<Cursors />` uses internally.
  useViewport()

  // Same Clerk-ID self-exclusion as `PresenceAvatars` — never render the
  // current user's own cursor, including a second tab of the same account.
  if (other.id === currentUserId || other.cursor === null) {
    return null
  }

  const screenPosition = flowToScreenPosition(other.cursor)

  // `position: fixed` (the brief's own primary suggestion), not `absolute`:
  // reading `@xyflow/react`'s real source (`dist/esm/index.js`) confirms
  // `flowToScreenPosition` already adds the React Flow pane's own
  // `getBoundingClientRect()` offset back in, so its output is
  // viewport-relative client coordinates — the same space `event.clientX`/
  // `clientY` live in. `position: fixed` maps those values directly with no
  // further offset math; `position: absolute` would double-count that same
  // offset unless the wrapper's own bounding-rect were subtracted back out.
  return (
    <div
      className="fixed top-0 left-0 flex items-center gap-1.5"
      style={{
        transform: `translate3d(${screenPosition.x}px, ${screenPosition.y}px, 0)`,
        // Runtime data (this participant's own presence color) drives an
        // inline CSS custom property — the same pattern `--swatch-glow`
        // (spec 15) already established, rather than a hardcoded class.
        ["--cursor-color" as string]: other.color,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M1 1L7.5 16L9.5 9.5L16 7.5L1 1Z"
          fill="var(--cursor-color)"
          stroke="var(--bg-base)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap text-copy-primary"
        style={{ backgroundColor: "var(--cursor-color)" }}
      >
        {/* Spec 24: small spinner while this participant's presence
         reports `thinking: true` (e.g. Ghost AI mid-run) — nothing when
         `false`/absent. */}
        {other.thinking ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {other.name}
      </span>
    </div>
  )
}
