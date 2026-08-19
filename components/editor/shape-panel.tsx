"use client"

import type { DragEvent } from "react"
import { Circle, Cylinder, Diamond, Hexagon, Pill, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CANVAS_DRAG_MIME_TYPE, CANVAS_SHAPES, SHAPE_LABELS, serializeShapeDragPayload } from "@/lib/canvas-shapes"
import type { NodeShape } from "@/types/canvas"

const SHAPE_ICONS: Record<NodeShape, typeof Square> = {
  rectangle: Square,
  diamond: Diamond,
  circle: Circle,
  pill: Pill,
  cylinder: Cylinder,
  hexagon: Hexagon,
}

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
 */
export function ShapePanel() {
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-surface-border bg-elevated p-1.5 shadow-lg">
        {CANVAS_SHAPES.map((shape) => (
          <ShapeButton key={shape} shape={shape} />
        ))}
      </div>
    </div>
  )
}

function ShapeButton({ shape }: { shape: NodeShape }) {
  const Icon = SHAPE_ICONS[shape]
  const label = SHAPE_LABELS[shape]

  function handleDragStart(event: DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData(CANVAS_DRAG_MIME_TYPE, serializeShapeDragPayload(shape))
    event.dataTransfer.effectAllowed = "copy"
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
