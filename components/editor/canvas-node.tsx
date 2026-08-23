"use client"

import { useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react"
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react"
import { NodeColorToolbar } from "@/components/editor/node-color-toolbar"
import { ShapeVisual } from "@/components/editor/shape-visual"
import { useUpdateCanvasNode } from "@/hooks/use-update-canvas-node"
import { NODE_MIN_SIZE } from "@/lib/canvas-shapes"
import { cn } from "@/lib/utils"
import { type CanvasNode as CanvasNodeType, type NodeColorPair } from "@/types/canvas"

/**
 * Custom node renderer registered for `CANVAS_NODE_TYPE`. Shape-correct
 * rendering (CSS for rectangle/pill/circle, inline SVG for diamond/hexagon/
 * cylinder) is delegated to the shared `ShapeVisual` — see spec 13's
 * Analyst Brief, Open Questions #3 — so this component owns the label/
 * placeholder content, the `selected` -> border-brightness wiring, and
 * (spec 14) the drag-to-resize and double-click-to-edit affordances layered
 * around `ShapeVisual`, not inside it.
 *
 * `NodeResizer` is rendered as a sibling of `ShapeVisual`, not inside it,
 * per spec 14's Analyst Brief. Its dimension changes flow through the same
 * `onNodesChange` prop `useLiveblocksFlow` already wires up to Liveblocks
 * Storage, with no additional plumbing — confirmed by reading
 * `@xyflow/react`'s source: `NodeResizer`'s internal `NodeResizeControl`
 * reads and calls the store's `onNodesChange` (the same prop passed to
 * `<ReactFlow>`) via `triggerNodeChanges`.
 *
 * Label editing needs a different mechanism: `CanvasNode` is a leaf
 * component with no access to `onNodesChange`, so it dispatches label
 * updates through `useUpdateCanvasNode()` — a small context provided by
 * `CanvasFlow` (`components/editor/canvas.tsx`) that wraps a real
 * `onNodesChange([{ type: "replace", ... }])` call, keeping the update on
 * the same synced path rather than a local-only React Flow store mutation
 * or a non-serializable callback embedded in `data`. See spec 14's Analyst
 * Brief, Open Questions #1.
 *
 * Spec 15 (Nodes Color Toolbar) adds `<NodeColorToolbar>`, rendered only
 * when `selected` — same convention as `<NodeResizer>` above — dispatching
 * a swatch click's `{ color, textColor }` pair through the same
 * `useUpdateCanvasNode()` mechanism, not a new one. `data.textColor` is
 * threaded into `ShapeVisual` (rest-state label) and applied to the
 * edit-mode `<textarea>` too, so the label doesn't flash to a different
 * color when entering/leaving edit mode — see spec 15's Analyst Brief, Open
 * Questions #2.
 *
 * Spec 16 (Edge Behavior) adds four `Handle` components (one per side),
 * wrapped with `ShapeVisual` in a new `group relative` `<div>` so Tailwind's
 * `group-hover:opacity-100` can fade them in only while hovering the node —
 * the one explicitly permitted exception to this spec's "don't redesign the
 * node renderer" Scope Limit. `NodeResizer`/`NodeColorToolbar` stay outside
 * that wrapper, unchanged, since both already position themselves relative
 * to the node's own absolutely-positioned React Flow wrapper, not this
 * component's local DOM structure. Each `Handle` is `type="source"` (not a
 * stacked source+target pair) — with `connectionMode={ConnectionMode.Loose}`
 * already set on `<ReactFlow>` (spec 11), `isValidHandle`'s own Loose-mode
 * check only requires the two endpoints not be the exact same handle,
 * regardless of `type`, so a single handle per side already supports
 * "connect any handle to any other handle." See spec 16's Analyst Brief,
 * Open Questions #4.
 */
const CONNECTION_HANDLES: ReadonlyArray<{ id: string; position: Position }> = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
]

export function CanvasNode({ id, data, selected }: NodeProps<CanvasNodeType>) {
  const [isEditing, setIsEditing] = useState(false)
  const updateNodeData = useUpdateCanvasNode()

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation()
    setIsEditing(true)
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    // Dispatch on every keystroke rather than only on close, so the label
    // change is genuinely live for other participants, per the spec's
    // "update the label as users type" framing — see spec 14's Analyst
    // Brief, Open Questions #2.
    updateNodeData?.(id, { label: event.target.value })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      setIsEditing(false)
    }
  }

  function handleColorSelect(pair: NodeColorPair) {
    updateNodeData?.(id, { color: pair.color, textColor: pair.textColor })
  }

  // Textarea mounts fresh each time editing starts (conditional render, not
  // a persistent hidden element) — a ref callback focuses it as soon as the
  // DOM node exists, without an extra effect or the `autofocus` attribute.
  function focusOnMount(element: HTMLTextAreaElement | null) {
    element?.focus()
  }

  return (
    <>
      <div className="group relative h-full w-full">
        <ShapeVisual shape={data.shape} color={data.color} textColor={data.textColor} selected={selected}>
          {/*
            `nodrag`/`nopan` — React Flow's own convention for interactive
            content inside a node (also used internally by `NodeResizer`'s
            own controls) — keeps clicking, selecting text, and typing here
            from starting a node drag or canvas pan. `h-full w-full` is only
            applied while `isEditing`: for a CSS-rendered shape (rectangle/
            pill/circle, see `shape-visual.tsx`) that box IS the entire node,
            so keeping it full-size at rest made the whole shape undraggable
            — only the `<textarea>` genuinely needs the full node as its
            nodrag/nopan hit area; the rest-state label should shrink to its
            own text so the surrounding shape stays grabbable, matching how
            the SVG-shape branch (diamond/hexagon/cylinder) already behaves.
          */}
          <div
            className={cn(
              "nodrag nopan flex min-w-0 items-center justify-center",
              isEditing && "h-full w-full",
            )}
            onDoubleClick={handleDoubleClick}
          >
            {isEditing ? (
              <textarea
                ref={focusOnMount}
                value={data.label}
                onChange={handleChange}
                onBlur={() => setIsEditing(false)}
                onKeyDown={handleKeyDown}
                placeholder="Untitled"
                rows={1}
                style={{ color: data.textColor }}
                className="box-border w-full min-w-0 max-w-full resize-none bg-transparent text-center text-sm outline-none placeholder:text-copy-faint"
              />
            ) : data.label ? (
              <span className="truncate">{data.label}</span>
            ) : (
              <span className="text-copy-faint">Untitled</span>
            )}
          </div>
        </ShapeVisual>
        {/*
          Small white dots with a dark border, hidden at rest and faded in
          on node hover — `ui-context.md`'s Connection Handles convention.
          `type="source"` on all four (see this file's module docblock for
          why a single handle per side is enough under Loose mode).
        */}
        {CONNECTION_HANDLES.map(({ id: handleId, position }) => (
          <Handle
            key={handleId}
            id={handleId}
            type="source"
            position={position}
            className="!h-2.5 !w-2.5 !rounded-full !border !border-base !bg-copy-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          />
        ))}
      </div>
      {/*
        Rendered after `ShapeVisual`, not before: its controls are
        `position: absolute`, so for the CSS-shape branch (`position:
        static`) they paint above the shape regardless of DOM order, and
        for the SVG-shape branch (`position: relative`, itself a positioned
        element) later-in-DOM wins the stacking tie — either way the resize
        handles stay clickable above the node's own content.
      */}
      <NodeResizer
        nodeId={id}
        isVisible={selected}
        minWidth={NODE_MIN_SIZE.width}
        minHeight={NODE_MIN_SIZE.height}
        handleClassName="!h-2.5 !w-2.5 !rounded-full !border !border-brand !bg-base"
        lineClassName="!border-surface-border"
      />
      {selected ? <NodeColorToolbar activeColor={data.color} onSelect={handleColorSelect} /> : null}
    </>
  )
}
