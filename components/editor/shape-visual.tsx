import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { DEFAULT_NODE_TEXT_COLOR, type NodeShape } from "@/types/canvas"

/**
 * Shared shape geometry consumed by both the real canvas node renderer
 * (`canvas-node.tsx`) and the shape panel's drag-preview elements
 * (`shape-panel.tsx`), so the two rendering paths can't drift into two
 * independently-maintained copies of "what a diamond looks like" — see
 * spec 13's Analyst Brief, Open Questions #3.
 *
 * `rectangle`/`pill`/`circle` render as a plain CSS `<div>` (border-radius
 * only — circle's roundness plus its 1:1 default size from
 * `SHAPE_DEFAULT_SIZES` is what reads as a circle, not a separate CSS
 * trick). `diamond`/`hexagon`/`cylinder` render as an inline `<svg>` on a
 * `viewBox="0 0 100 100"` with `preserveAspectRatio="none"` so the shape
 * stretches to fill whatever box it's given (driven by the node's
 * `width`/`height`) rather than clipping or floating at a fixed size.
 *
 * Border/stroke color: subtle (`--border-default`, via the existing
 * `border-surface-border` token class for CSS shapes) at rest, brand accent
 * (`--accent-primary`, via `border-brand`) when `selected`. SVG shapes use
 * the same two tokens via an inline `stroke` (SVG `stroke` doesn't take a
 * Tailwind class as directly as `border-*` does), referenced as CSS custom
 * properties rather than hardcoded hex so both paths stay in sync with the
 * same theme tokens. See Open Questions #5.
 *
 * Exact SVG coordinates (diamond/hexagon/cylinder) are this spec's own
 * recommendation, not a pinned design reference — see Open Questions #4.
 *
 * `textColor` (spec 15, Nodes Color Toolbar) replaces the previously
 * hardcoded `DEFAULT_NODE_TEXT_COLOR` label color so a node's label
 * automatically pairs with its fill once the color toolbar changes
 * `data.color` — see spec 15's Analyst Brief, Open Questions #1. Kept
 * optional, defaulting to `DEFAULT_NODE_TEXT_COLOR`, so the shape panel's
 * drag-preview elements (which render no label content) don't need an
 * unused prop threaded through.
 */

interface ShapeVisualProps {
  shape: NodeShape
  /** Node fill color (`data.color`, or `DEFAULT_NODE_COLOR` for previews). */
  color: string
  /** Label text color (`data.textColor`). Defaults to `DEFAULT_NODE_TEXT_COLOR`. */
  textColor?: string
  /** Brighter border/stroke when true. Defaults to false (rest state). */
  selected?: boolean
  className?: string
  children?: ReactNode
}

const CSS_SHAPES = new Set<NodeShape>(["rectangle", "pill", "circle"])

const CSS_SHAPE_RADIUS_CLASS: Partial<Record<NodeShape, string>> = {
  rectangle: "rounded-xl",
  pill: "rounded-full",
  circle: "rounded-full",
}

function isCssShape(shape: NodeShape): boolean {
  return CSS_SHAPES.has(shape)
}

export function ShapeVisual({
  shape,
  color,
  textColor = DEFAULT_NODE_TEXT_COLOR,
  selected = false,
  className,
  children,
}: ShapeVisualProps) {
  if (isCssShape(shape)) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center border px-3 text-center text-sm",
          CSS_SHAPE_RADIUS_CLASS[shape],
          selected ? "border-brand" : "border-surface-border",
          className,
        )}
        style={{ backgroundColor: color, color: textColor }}
      >
        {children}
      </div>
    )
  }

  const strokeColor = selected ? "var(--accent-primary)" : "var(--border-default)"

  return (
    <div
      className={cn("relative flex h-full w-full items-center justify-center", className)}
      style={{ color: textColor }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0"
        aria-hidden
      >
        {shape === "diamond" && (
          <polygon
            points="50,2 98,50 50,98 2,50"
            fill={color}
            stroke={strokeColor}
            strokeWidth={3}
            strokeLinejoin="round"
          />
        )}
        {shape === "hexagon" && (
          <polygon
            points="25,2 75,2 98,50 75,98 25,98 2,50"
            fill={color}
            stroke={strokeColor}
            strokeWidth={3}
            strokeLinejoin="round"
          />
        )}
        {shape === "cylinder" && (
          <g>
            <path
              d="M5,22 L5,80 A45,14 0 0 0 95,80 L95,22"
              fill={color}
              stroke={strokeColor}
              strokeWidth={3}
              strokeLinejoin="round"
            />
            <ellipse cx="50" cy="22" rx="45" ry="14" fill={color} stroke={strokeColor} strokeWidth={3} />
          </g>
        )}
      </svg>
      {children ? <div className="relative z-10 px-3 text-center text-sm">{children}</div> : null}
    </div>
  )
}
