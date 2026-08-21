"use client"

import { useEffect, useRef, useState } from "react"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"

export type CanvasSaveStatus = "idle" | "saving" | "saved" | "error"

/**
 * Debounce interval after the last node/edge change before autosaving. Not
 * pinned by the spec text — a short fixed interval in the 1-2s range, same
 * "reasonable unpinned Dev-level value" precedent as
 * `ZOOM_TRANSITION_DURATION_MS` (spec 17, `components/editor/canvas.tsx`)
 * and `NODE_MIN_SIZE` (spec 14, `lib/canvas-shapes.ts`). See spec 21's
 * Analyst Brief, Open Questions #2.
 */
export const CANVAS_AUTOSAVE_DEBOUNCE_MS = 1500

interface UseCanvasAutosaveOptions {
  /** Liveblocks room ID === project ID (spec 10's convention). */
  projectId: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  /**
   * Gates autosave entirely while `false`. `CanvasFlow` only flips this to
   * `true` once its own initial load-or-skip decision (spec 21's Concrete
   * deliverables — checking whether the room already has content before
   * possibly loading a saved snapshot) has settled. Without this gate, a
   * debounced save could fire while the room's `nodes`/`edges` still reflect
   * their momentary empty starting state, overwriting a real saved snapshot
   * in Blob before it's even been loaded back in.
   */
  enabled: boolean
}

/**
 * Watches a project's Liveblocks-synced `nodes`/`edges` and debounces writes
 * to `PUT /api/projects/[projectId]/canvas`, exposing a
 * `saving | saved | error` status (`idle` before the first save attempt this
 * session). Lives in the top-level `hooks/` folder per
 * `architecture-context.md`'s Hooks Convention.
 *
 * A `requestId` ref discards a stale in-flight response — if `nodes`/`edges`
 * change again before an earlier save's `fetch` resolves, only the most
 * recently-dispatched request is allowed to update `status`.
 */
export function useCanvasAutosave({
  projectId,
  nodes,
  edges,
  enabled,
}: UseCanvasAutosaveOptions): CanvasSaveStatus {
  const [status, setStatus] = useState<CanvasSaveStatus>("idle")
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRequestIdRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      return
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      const requestId = latestRequestIdRef.current + 1
      latestRequestIdRef.current = requestId
      setStatus("saving")

      fetch(`/api/projects/${projectId}/canvas`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      })
        .then((response) => {
          if (requestId !== latestRequestIdRef.current) return
          setStatus(response.ok ? "saved" : "error")
        })
        .catch(() => {
          if (requestId !== latestRequestIdRef.current) return
          setStatus("error")
        })
    }, CANVAS_AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [projectId, nodes, edges, enabled])

  return status
}
