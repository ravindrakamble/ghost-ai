"use client"

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Circle, Cylinder, Diamond, Hexagon, Pill, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ShapeVisual } from "@/components/editor/shape-visual"
import { CANVAS_SHAPES, SHAPE_DEFAULT_SIZES, SHAPE_LABELS, type ShapeDragPayload } from "@/lib/canvas-shapes"
import { DEFAULT_NODE_COLOR, type NodeShape } from "@/types/canvas"

const SHAPE_ICONS: Record<NodeShape, typeof Square> = {
  rectangle: Square,
  diamond: Diamond,
  circle: Circle,
  pill: Pill,
  cylinder: Cylinder,
  hexagon: Hexagon,
}

/** Screen-space (`clientX`/`clientY`) position a shape was released at. */
export interface ShapeDropPosition {
  x: number
  y: number
}

/** Called once a dragged shape is released over the React Flow canvas. */
export type OnDropShape = (payload: ShapeDragPayload, position: ShapeDropPosition) => void

export interface ShapePanelProps {
  onDropShape: OnDropShape
}

/**
 * Floating pill-shaped toolbar at the bottom-center of the canvas. Each
 * button starts a `pointerdown`-tracked drag rather than native HTML5
 * `draggable`/`dragstart` — a human smoke test of spec 12/13's original
 * native-drag implementation found it unreliably failed to *start* for
 * several shapes (repeated attempts needed for rectangle/circle/pill/hexagon,
 * while diamond/cylinder began on the first try every time), a known general
 * weak spot of the native DnD API rather than a per-shape logic bug — the
 * drop logic itself was always correct for every shape. Tracking the whole
 * gesture through plain `pointermove`/`pointerup` listeners on `window`
 * sidesteps native DnD's session-initiation step entirely.
 *
 * A drop is only accepted when the pointer is released over React Flow's own
 * `.react-flow__pane` element (checked via `document.elementFromPoint`) —
 * releasing over the shape panel itself, the control bar, or outside the
 * canvas is a no-op, the same gating `onDragOver`'s `preventDefault` used to
 * provide for native drag.
 */
export function ShapePanel({ onDropShape }: ShapePanelProps) {
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-surface-border bg-elevated p-1.5 shadow-lg">
        {CANVAS_SHAPES.map((shape) => (
          <ShapeButton key={shape} shape={shape} onDropShape={onDropShape} />
        ))}
      </div>
    </div>
  )
}

function ShapeButton({ shape, onDropShape }: { shape: NodeShape; onDropShape: OnDropShape }) {
  const Icon = SHAPE_ICONS[shape]
  const label = SHAPE_LABELS[shape]
  const [isDragging, setIsDragging] = useState(false)
  const [ghostPosition, setGhostPosition] = useState<ShapeDropPosition | null>(null)

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    setIsDragging(true)
    setGhostPosition({ x: event.clientX, y: event.clientY })
  }

  // Listeners live on `window`, not the button, so the gesture keeps
  // tracking no matter where the pointer travels — attached only while a
  // drag from this button is in progress, torn down as soon as it ends.
  useEffect(() => {
    if (!isDragging) return

    function handlePointerMove(event: PointerEvent) {
      setGhostPosition({ x: event.clientX, y: event.clientY })
    }

    function handlePointerUp(event: PointerEvent) {
      const dropTarget = document.elementFromPoint(event.clientX, event.clientY)
      if (dropTarget?.closest(".react-flow__pane")) {
        const size = SHAPE_DEFAULT_SIZES[shape]
        onDropShape({ shape, width: size.width, height: size.height }, { x: event.clientX, y: event.clientY })
      }
      setIsDragging(false)
      setGhostPosition(null)
    }

    function handlePointerCancel() {
      setIsDragging(false)
      setGhostPosition(null)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
    }
  }, [isDragging, shape, onDropShape])

  return (
    <>
      <Button
        variant="ghost"
        size="icon-lg"
        onPointerDown={handlePointerDown}
        title={label}
        aria-label={`Drag to add a ${label.toLowerCase()} node`}
      >
        <Icon />
      </Button>
      {ghostPosition ? <DragGhost shape={shape} position={ghostPosition} /> : null}
    </>
  )
}

/** Cursor-attached preview shown while a shape is being dragged, centered on the pointer. */
function DragGhost({ shape, position }: { shape: NodeShape; position: ShapeDropPosition }) {
  const size = SHAPE_DEFAULT_SIZES[shape]
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 opacity-80"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        transform: "translate(-50%, -50%)",
      }}
    >
      <ShapeVisual shape={shape} color={DEFAULT_NODE_COLOR} />
    </div>
  )
}
