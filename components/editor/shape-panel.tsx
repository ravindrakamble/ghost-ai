"use client"

import { useRef, type DragEvent, type MutableRefObject } from "react"
import { Circle, Cylinder, Diamond, Hexagon, Pill, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ShapeVisual } from "@/components/editor/shape-visual"
import {
  CANVAS_DRAG_MIME_TYPE,
  CANVAS_SHAPES,
  SHAPE_DEFAULT_SIZES,
  SHAPE_LABELS,
  serializeShapeDragPayload,
} from "@/lib/canvas-shapes"
import { DEFAULT_NODE_COLOR, type NodeShape } from "@/types/canvas"

const SHAPE_ICONS: Record<NodeShape, typeof Square> = {
  rectangle: Square,
  diamond: Diamond,
  circle: Circle,
  pill: Pill,
  cylinder: Cylinder,
  hexagon: Hexagon,
}

/** Holds one already-rendered preview `<div>` per shape, keyed by shape name. */
type PreviewRefs = MutableRefObject<Partial<Record<NodeShape, HTMLDivElement>>>

/**
 * Floating pill-shaped toolbar at the bottom-center of the canvas. Each
 * button is a native HTML5 drag source: starting a drag sets a
 * `dataTransfer` payload (shape name + default size) that `canvas.tsx`'s
 * `onDrop` handler reads to create a new node. No drag-and-drop library is
 * used — see spec 12's Analyst Brief, Dependencies.
 *
 * Positioning/visual language (`rounded-full`, `bg-elevated`/
 * `border-surface-border`) follows `ui-context.md`'s documented
 * floating-overlay pattern since no prior "pill toolbar" convention exists
 * yet — see spec 12's Analyst Brief, Open Questions #1.
 *
 * Spec 13 adds a cursor-attached ghost drag preview via the native
 * `dataTransfer.setDragImage` API — see spec 13's Analyst Brief, Open
 * Questions #1 and #2. The panel's own layout/buttons are unchanged.
 */
export function ShapePanel() {
  const previewRefs = useRef<Partial<Record<NodeShape, HTMLDivElement>>>({})

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-surface-border bg-elevated p-1.5 shadow-lg">
        {CANVAS_SHAPES.map((shape) => (
          <ShapeButton key={shape} shape={shape} previewRefs={previewRefs} />
        ))}
      </div>
      <ShapeDragPreviews previewRefs={previewRefs} />
    </div>
  )
}

function ShapeButton({ shape, previewRefs }: { shape: NodeShape; previewRefs: PreviewRefs }) {
  const Icon = SHAPE_ICONS[shape]
  const label = SHAPE_LABELS[shape]

  function handleDragStart(event: DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData(CANVAS_DRAG_MIME_TYPE, serializeShapeDragPayload(shape))
    event.dataTransfer.effectAllowed = "copy"

    const previewElement = previewRefs.current[shape]
    if (previewElement) {
      const size = SHAPE_DEFAULT_SIZES[shape]
      event.dataTransfer.setDragImage(previewElement, size.width / 2, size.height / 2)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      draggable
      onDragStart={handleDragStart}
      title={label}
      aria-label={`Drag to add a ${label.toLowerCase()} node`}
    >
      <Icon />
    </Button>
  )
}

/**
 * One always-mounted, off-screen preview element per shape, sized per
 * `SHAPE_DEFAULT_SIZES` and rendered with the same `ShapeVisual` geometry
 * `CanvasNode` uses (so the ghost preview matches the node that will
 * actually be created on drop).
 *
 * `setDragImage` needs a real, already-rendered DOM element the moment
 * `dragstart` fires — a shape/size committed via React state inside that
 * same synchronous event handler would not yet exist in the DOM (state
 * updates are async), so the browser would snapshot stale or default
 * content. Keeping one correctly-shaped element per shape mounted
 * persistently avoids that gap entirely — `dragstart` just hands the
 * already-correct element straight to `setDragImage`. See spec 13's
 * Analyst Brief, Open Questions #2.
 *
 * Positioned off-screen via a large negative `transform` translation, not
 * `display: none` — some browsers won't snapshot a `display: none` element
 * for `setDragImage`.
 */
function ShapeDragPreviews({ previewRefs }: { previewRefs: PreviewRefs }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0"
      style={{ transform: "translate(-9999px, -9999px)" }}
    >
      {CANVAS_SHAPES.map((shape) => {
        const size = SHAPE_DEFAULT_SIZES[shape]
        return (
          <div
            key={shape}
            ref={(element) => {
              if (element) previewRefs.current[shape] = element
            }}
            style={{ width: size.width, height: size.height }}
          >
            <ShapeVisual shape={shape} color={DEFAULT_NODE_COLOR} />
          </div>
        )
      })}
    </div>
  )
}
