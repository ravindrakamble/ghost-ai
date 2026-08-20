"use client"

import { useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react"
import { NodeResizer, type NodeProps } from "@xyflow/react"
import { ShapeVisual } from "@/components/editor/shape-visual"
import { useUpdateCanvasNode } from "@/hooks/use-update-canvas-node"
import { NODE_MIN_SIZE } from "@/lib/canvas-shapes"
import { type CanvasNode as CanvasNodeType } from "@/types/canvas"

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
 */
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

  // Textarea mounts fresh each time editing starts (conditional render, not
  // a persistent hidden element) — a ref callback focuses it as soon as the
  // DOM node exists, without an extra effect or the `autofocus` attribute.
  function focusOnMount(element: HTMLTextAreaElement | null) {
    element?.focus()
  }

  return (
    <>
      <ShapeVisual shape={data.shape} color={data.color} selected={selected}>
        {/*
          `nodrag`/`nopan` — React Flow's own convention for interactive
          content inside a node (also used internally by `NodeResizer`'s own
          controls) — keeps clicking, selecting text, and typing here from
          starting a node drag or canvas pan.
        */}
        <div className="nodrag nopan" onDoubleClick={handleDoubleClick}>
          {isEditing ? (
            <textarea
              ref={focusOnMount}
              value={data.label}
              onChange={handleChange}
              onBlur={() => setIsEditing(false)}
              onKeyDown={handleKeyDown}
              placeholder="Untitled"
              rows={1}
              className="resize-none bg-transparent text-center text-sm text-copy-primary outline-none placeholder:text-copy-faint"
            />
          ) : data.label ? (
            <span className="truncate">{data.label}</span>
          ) : (
            <span className="text-copy-faint">Untitled</span>
          )}
        </div>
      </ShapeVisual>
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
    </>
  )
}
