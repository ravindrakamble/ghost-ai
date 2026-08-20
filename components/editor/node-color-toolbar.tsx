"use client"

import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { NODE_COLORS, type NodeColorPair } from "@/types/canvas"

/**
 * Floating swatch toolbar shown above a selected canvas node
 * (`components/editor/canvas-node.tsx`), letting the user pick from the 8
 * predefined `NODE_COLORS` fill/text pairs. No free-form color input exists
 * anywhere here — see spec 15's Analyst Brief, Out-of-scope callouts.
 *
 * Positioned as an absolutely-positioned sibling of `ShapeVisual`/
 * `NodeResizer` within `CanvasNode`'s render, following the same
 * `selected`-gated-visibility convention spec 14 established for
 * `NodeResizer` — see spec 15's Analyst Brief, Open Questions #3.
 * `bottom-full` anchors the toolbar's own bottom edge to the node's top
 * edge, with `mb-2` adding a visible gap so the toolbar never overlaps the
 * node's own shape (acceptance criterion 3).
 *
 * The active swatch (matching the node's current `data.color`) reuses the
 * `border-brand` selected-token convention already used for node borders
 * and resize handles, per Open Questions #5.
 *
 * The hover glow is a tight, non-blurry ring (`box-shadow` with 0 blur,
 * fixed spread) keyed off each swatch's own paired text color, per
 * acceptance criterion 6. Since each swatch needs a *different* glow color
 * sourced from `NODE_COLORS` data rather than a single static theme token,
 * it's applied via a per-swatch CSS custom property (`--swatch-glow`,
 * itself only ever assigned a `NODE_COLORS` value, not an arbitrary
 * hardcoded hex) and a `hover:shadow-[...]` Tailwind arbitrary-value
 * utility referencing that variable — the same "runtime data drives an
 * inline color" pattern `ShapeVisual` already uses for `data.color`/
 * `data.textColor`, not a raw hardcoded color class.
 *
 * `nodrag nopan` on the container (React Flow's own convention, already
 * used by `CanvasNode`'s label-editing wrapper) keeps clicking or hovering
 * a swatch from starting a node drag or a canvas pan.
 */

interface NodeColorToolbarProps {
  /** The node's current fill color (`data.color`), used to mark the active swatch. */
  activeColor: string
  /** Called with the full `{ color, textColor }` pair when a swatch is clicked. */
  onSelect: (pair: NodeColorPair) => void
}

export function NodeColorToolbar({ activeColor, onSelect }: NodeColorToolbarProps) {
  return (
    <div
      className="nodrag nopan absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-surface-border bg-elevated p-1 shadow-lg"
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {NODE_COLORS.map((pair) => {
        const isActive = pair.color === activeColor
        const style = { backgroundColor: pair.color, "--swatch-glow": pair.textColor } as CSSProperties

        return (
          <button
            key={pair.color}
            type="button"
            aria-label={`Set node color to ${pair.color}`}
            aria-pressed={isActive}
            onClick={() => onSelect(pair)}
            className={cn(
              "h-5 w-5 rounded-full border transition-shadow hover:shadow-[0_0_0_2px_var(--swatch-glow)]",
              isActive ? "border-brand" : "border-surface-border",
            )}
            style={style}
          />
        )
      })}
    </div>
  )
}
