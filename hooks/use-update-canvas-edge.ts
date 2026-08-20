"use client"

import { createContext, useContext } from "react"
import type { CanvasEdgeData } from "@/types/canvas"

/**
 * Dispatches a `data` update (currently just the label) for a single canvas
 * edge back through `CanvasFlow`'s real `onEdgesChange` — the edge-scoped
 * mirror of `hooks/use-update-canvas-node.ts`'s `CanvasNodeUpdateContext`
 * (spec 14). See spec 16's Analyst Brief, Open Questions #1.
 *
 * `CanvasEdge` is a leaf React Flow edge component with no direct access to
 * `onEdgesChange` (it lives in `components/editor/canvas.tsx`'s
 * `CanvasFlow`), and the same two shortcuts that were unsafe for node label
 * edits are unsafe here too:
 * - Embedding a callback directly in `data` (e.g. `data.onLabelChange`)
 *   would break Liveblocks Storage's JSON-serializability requirement.
 * - Mutating React Flow's internal store directly would only affect the
 *   local client — `<ReactFlow edges={edges}>` here is controlled from
 *   `useLiveblocksFlow`'s `edges`, so a local-only mutation wouldn't reach
 *   Liveblocks Storage.
 *
 * `CanvasEdgeUpdateContext` is provided by `CanvasFlow`, wrapping a real
 * `onEdgesChange([{ type: "replace", ... }])` call — the same synced path
 * node label edits already use, applied to edges instead of nodes.
 */
export type UpdateCanvasEdgeData = (edgeId: string, data: Partial<CanvasEdgeData>) => void

export const CanvasEdgeUpdateContext = createContext<UpdateCanvasEdgeData | null>(null)

/**
 * Consumed by leaf edge components (e.g. `CanvasEdge`) to update their own
 * edge's `data`. Returns `null` outside `CanvasFlow`'s provider (e.g. an
 * isolated component test that doesn't wrap in the context) — callers must
 * null-check before calling.
 */
export function useUpdateCanvasEdge(): UpdateCanvasEdgeData | null {
  return useContext(CanvasEdgeUpdateContext)
}
