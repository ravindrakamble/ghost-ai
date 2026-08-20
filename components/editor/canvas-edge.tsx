"use client"

import { useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react"
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react"
import { useUpdateCanvasEdge } from "@/hooks/use-update-canvas-edge"
import { type CanvasEdge as CanvasEdgeType } from "@/types/canvas"

/**
 * Custom edge renderer registered for `CANVAS_EDGE_TYPE`. First spec to
 * consume `CanvasEdgeData` (defined in spec 11, never rendered until now).
 * Naming precedent: same "component name shadows the type-alias name"
 * pattern `canvas-node.tsx`'s `CanvasNode` already has against
 * `types/canvas.ts`'s `CanvasNode` type — resolved here the same way
 * `canvas.tsx` resolves it for nodes, via an import alias (`CanvasEdgeType`).
 *
 * Routing: right-angle/smooth-step path via `getSmoothStepPath` (never a
 * hand-rolled routing algorithm) — the path's own returned `labelX`/`labelY`
 * (the path's real midpoint) drive `EdgeLabelRenderer`'s label position, not
 * a manually computed midpoint.
 *
 * Dimmed-at-rest / brightened-on-hover-or-select: local `isHovered` state
 * (no `hovered` field exists on React Flow's `EdgeProps`) combined with the
 * real `selected` prop, both collapsed into a single "bright" state per this
 * spec's Analyst Brief, Open Questions #2 (no third tri-state visual).
 * Reuses the same subtle-at-rest/brand-accent-when-active token pairing
 * `ShapeVisual` established for node borders (spec 13's Analyst Brief,
 * Dependencies) — `var(--border-default)` at rest, `var(--accent-primary)`
 * when bright — rather than inventing new hex values. See Open Questions #3.
 *
 * Hit area: `<BaseEdge>`'s own `interactionWidth` already renders a wider,
 * `strokeOpacity: 0` sibling path alongside the thin visible one — the
 * standard React Flow technique this spec's brief calls out for "easier to
 * click without increasing visible thickness." Mouse events on that
 * invisible path bubble to the wrapping `<g>` below (React's synthetic
 * `onMouseEnter`/`onMouseLeave` fire on the nearest ancestor with a
 * listener, matching non-bubbling `:hover` semantics), so hover state is
 * tracked there rather than by hand-rolling a second invisible path.
 *
 * Label editing mirrors `canvas-node.tsx`'s `isEditing` local-state pattern:
 * double-click (on the edge line itself, or on an existing pill label)
 * opens an `<input>` inside `EdgeLabelRenderer`, dispatching through
 * `useUpdateCanvasEdge()` (the edge-scoped mirror of spec 14's
 * `useUpdateCanvasNode()`) on every keystroke — already-synced by the time
 * blur/Enter/Escape close editing, so those three just exit edit mode rather
 * than performing a separate "save" step. `nodrag nopan` on the label's
 * interactive wrapper, same convention as node label editing.
 */
export function CanvasEdge({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  style,
}: EdgeProps<CanvasEdgeType>) {
  const [isHovered, setIsHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const updateEdgeData = useUpdateCanvasEdge()

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const isBright = Boolean(selected) || isHovered
  const strokeColor = isBright ? "var(--accent-primary)" : "var(--border-default)"
  const label = typeof data?.label === "string" ? data.label : ""

  function handleDoubleClick(event: MouseEvent) {
    event.stopPropagation()
    setIsEditing(true)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    // Dispatch on every keystroke, same live-per-keystroke convention as
    // node label editing (spec 14) — see this file's module docblock.
    updateEdgeData?.(id, { label: event.target.value })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault()
      setIsEditing(false)
    }
  }

  function focusOnMount(element: HTMLInputElement | null) {
    element?.focus()
  }

  return (
    <g onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onDoubleClick={handleDoubleClick}>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ ...style, stroke: strokeColor, strokeWidth: 1.5, strokeLinecap: "round" }}
      />
      {isEditing ? (
        <EdgeLabelRenderer>
          <input
            ref={focusOnMount}
            value={label}
            onChange={handleChange}
            onBlur={() => setIsEditing(false)}
            onKeyDown={handleKeyDown}
            placeholder="Add label…"
            size={Math.max(label.length, 1)}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan min-w-8 rounded-full border border-surface-border bg-elevated px-2 py-0.5 text-center text-xs text-copy-primary outline-none placeholder:text-copy-faint"
          />
        </EdgeLabelRenderer>
      ) : label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onDoubleClick={handleDoubleClick}
            className="nodrag nopan rounded-full border border-surface-border bg-elevated px-2 py-0.5 text-xs text-copy-secondary"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  )
}
