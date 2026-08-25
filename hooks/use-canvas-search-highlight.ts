"use client"

import { createContext, useContext } from "react"

/**
 * The currently-highlighted node's `id` (or `null`) — the temporary
 * "jump to node from search" glow (spec 36, Canvas Node Search). See spec
 * 36's Analyst Brief, Concrete deliverables.
 *
 * Deliberately **not** Liveblocks Presence or Storage: this is a private,
 * ephemeral navigation aid for the searching user only, not collaborative
 * canvas content — it must never be written to Storage/Presence or visible
 * to other collaborators (spec 36's Acceptance Criterion 7).
 *
 * Structurally mirrors `hooks/use-update-canvas-node.ts`'s
 * `CanvasNodeUpdateContext`/`useUpdateCanvasNode` pair — context provided by
 * `CanvasFlow` (`components/editor/canvas.tsx`), consumed by the leaf
 * `CanvasNode` renderer — per `architecture-context.md`'s Hooks Convention.
 * Unlike that pair, this context carries plain data (the highlighted node
 * id itself), not a dispatch function: no leaf node ever needs to *set* this
 * value, only compare it against its own `id`.
 */
export const CanvasSearchHighlightContext = createContext<string | null>(null)

/**
 * Consumed by leaf node components (`CanvasNode`) to know whether they are
 * the current search-jump target. Returns `null` outside `CanvasFlow`'s
 * provider (e.g. an isolated component test that doesn't wrap in the
 * context) — the same "no provider means no highlight" default every other
 * context in this codebase uses.
 */
export function useCanvasSearchHighlight(): string | null {
  return useContext(CanvasSearchHighlightContext)
}
