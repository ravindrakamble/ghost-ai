"use client"

import { createContext, useContext } from "react"
import type { CanvasNodeData } from "@/types/canvas"

/**
 * Dispatches a `data` update (currently just the label) for a single canvas
 * node back through `CanvasFlow`'s real `onNodesChange` — the same synced
 * path `NodeResizer`'s dimension changes already use. See spec 14's Analyst
 * Brief, Open Questions #1.
 *
 * `CanvasNode` is a leaf React Flow node component with no direct access to
 * `onNodesChange` (it lives in `components/editor/canvas.tsx`'s
 * `CanvasFlow`), and neither of the two tempting shortcuts is safe:
 * - Embedding a callback directly in `data` (e.g. `data.onLabelChange`)
 *   would break Liveblocks Storage's JSON-serializability requirement —
 *   functions aren't serializable, and `useLiveblocksFlow`'s node `data` is
 *   expected to stay plain JSON.
 * - Calling `useReactFlow().setNodes()`/`updateNodeData()` from inside
 *   `CanvasNode` only mutates React Flow's internal store — `<ReactFlow
 *   nodes={nodes}>` here is controlled from `useLiveblocksFlow`'s `nodes`,
 *   so a local-only mutation wouldn't reach Liveblocks Storage (no sync to
 *   other participants, doesn't survive a refresh).
 *
 * `CanvasNodeUpdateContext` is provided by `CanvasFlow`, wrapping a real
 * `onNodesChange([{ type: "replace", ... }])` call — see spec 14's Analyst
 * Brief, Concrete deliverables (React-context option chosen over a
 * standalone hook wrapping `useReactFlow`, since the value genuinely needs
 * to originate from `CanvasFlow`, not be recomputed by each consumer).
 */
export type UpdateCanvasNodeData = (nodeId: string, data: Partial<CanvasNodeData>) => void

export const CanvasNodeUpdateContext = createContext<UpdateCanvasNodeData | null>(null)

/**
 * Consumed by leaf node components (e.g. `CanvasNode`) to update their own
 * node's `data`. Returns `null` outside `CanvasFlow`'s provider (e.g. an
 * isolated component test that doesn't wrap in the context) — callers must
 * null-check before calling.
 */
export function useUpdateCanvasNode(): UpdateCanvasNodeData | null {
  return useContext(CanvasNodeUpdateContext)
}
