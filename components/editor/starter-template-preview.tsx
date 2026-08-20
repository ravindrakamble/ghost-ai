import type { CanvasTemplate } from "@/components/editor/starter-templates"
import type { CanvasNode } from "@/types/canvas"

/**
 * Lightweight, non-React-Flow diagram preview for a single template card —
 * spec 18. SVG, not `<canvas>`: `<canvas>`'s 2D context isn't available
 * under jsdom without an extra native dependency, and every other
 * canvas-adjacent component in this codebase (`ShapeVisual`, `CanvasNode`,
 * `CanvasEdge`) is tested via RTL queries against real DOM nodes — an SVG
 * preview keeps that same testable-via-RTL property. SVG's own
 * `viewBox`/`preserveAspectRatio` also already does "fit an arbitrary-sized
 * diagram into a fixed-size box" natively, the same idiom `ShapeVisual`
 * (spec 13) already relies on for scaling an individual shape into a node's
 * box — reused here at the whole-diagram level. See spec 18's Analyst
 * Brief, Concrete deliverables, and the mirrored write-up in
 * `context/ui-context.md`'s "Starter Templates" section.
 *
 * No `@xyflow/react` import anywhere in this file, and no `ShapeVisual`
 * import either — the diamond/hexagon/cylinder geometry below deliberately
 * mirrors `shape-visual.tsx`'s own constants (a documented visual-
 * consistency choice) rather than importing/reusing that component, since
 * `ShapeVisual` is a `<div>`-rooted component not designed to nest inside an
 * SVG `<g>`, and touching it would risk crossing this spec's "don't change
 * node or edge rendering" Scope Limit.
 */

const PREVIEW_WIDTH = 280
const PREVIEW_HEIGHT = 160
const PREVIEW_PADDING = 20

interface TemplateBounds {
  minX: number
  minY: number
  width: number
  height: number
}

/**
 * Computes the diagram's bounding box from the template's own node
 * positions/sizes (never a hardcoded per-template value), padded on all
 * four sides so a node sitting exactly on the boundary isn't clipped by its
 * own stroke width.
 */
function getTemplateBounds(nodes: readonly CanvasNode[]): TemplateBounds {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const node of nodes) {
    const width = node.width ?? 0
    const height = node.height ?? 0
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + width)
    maxY = Math.max(maxY, node.position.y + height)
  }

  return {
    minX: minX - PREVIEW_PADDING,
    minY: minY - PREVIEW_PADDING,
    width: maxX - minX + PREVIEW_PADDING * 2,
    height: maxY - minY + PREVIEW_PADDING * 2,
  }
}

function nodeCenter(node: CanvasNode): { x: number; y: number } {
  return {
    x: node.position.x + (node.width ?? 0) / 2,
    y: node.position.y + (node.height ?? 0) / 2,
  }
}

const STROKE = "var(--border-default)"

/**
 * Per-node shape rendering. `rectangle`/`pill`/`circle` are a plain SVG
 * `<rect>`/`<circle>` at the node's real flow-space position/size.
 * `diamond`/`hexagon`/`cylinder` reuse `shape-visual.tsx`'s own normalized
 * 0-100 polygon/path point strings, wrapped in a per-node
 * `<g transform="translate(x, y) scale(w/100, h/100)">` so each complex
 * shape renders at its own real footprint within the shared viewBox.
 */
function TemplateNodeShape({ node }: { node: CanvasNode }) {
  const { x, y } = node.position
  const width = node.width ?? 0
  const height = node.height ?? 0
  const { color, shape } = node.data

  switch (shape) {
    case "rectangle":
      return (
        <rect x={x} y={y} width={width} height={height} rx={12} fill={color} stroke={STROKE} strokeWidth={2} />
      )
    case "pill":
      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={height / 2}
          fill={color}
          stroke={STROKE}
          strokeWidth={2}
        />
      )
    case "circle": {
      const r = Math.min(width, height) / 2
      return <circle cx={x + width / 2} cy={y + height / 2} r={r} fill={color} stroke={STROKE} strokeWidth={2} />
    }
    case "diamond":
      return (
        <g transform={`translate(${x}, ${y}) scale(${width / 100}, ${height / 100})`}>
          <polygon points="50,2 98,50 50,98 2,50" fill={color} stroke={STROKE} strokeWidth={3} strokeLinejoin="round" />
        </g>
      )
    case "hexagon":
      return (
        <g transform={`translate(${x}, ${y}) scale(${width / 100}, ${height / 100})`}>
          <polygon
            points="25,2 75,2 98,50 75,98 25,98 2,50"
            fill={color}
            stroke={STROKE}
            strokeWidth={3}
            strokeLinejoin="round"
          />
        </g>
      )
    case "cylinder":
      return (
        <g transform={`translate(${x}, ${y}) scale(${width / 100}, ${height / 100})`}>
          <path
            d="M5,22 L5,80 A45,14 0 0 0 95,80 L95,22"
            fill={color}
            stroke={STROKE}
            strokeWidth={3}
            strokeLinejoin="round"
          />
          <ellipse cx="50" cy="22" rx="45" ry="14" fill={color} stroke={STROKE} strokeWidth={3} />
        </g>
      )
    default:
      return null
  }
}

interface StarterTemplatePreviewProps {
  template: CanvasTemplate
}

/**
 * Renders a single template's node/edge diagram as a fixed-size SVG.
 * Bounds come from `getTemplateBounds` (this template's own node
 * positions), the default `preserveAspectRatio` (`xMidYMid meet`, not
 * `ShapeVisual`'s `"none"`) keeps the diagram's real proportions and centers
 * it rather than stretching to fill the box. Edges are plain `<line>`s
 * between node centers — no routing, no arrowheads, no labels.
 */
export function StarterTemplatePreview({ template }: StarterTemplatePreviewProps) {
  const bounds = getTemplateBounds(template.nodes)
  const nodesById = new Map(template.nodes.map((node) => [node.id, node]))

  return (
    <svg
      width={PREVIEW_WIDTH}
      height={PREVIEW_HEIGHT}
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      role="img"
      aria-label={`${template.name} preview`}
    >
      {template.edges.map((edge) => {
        const source = nodesById.get(edge.source)
        const target = nodesById.get(edge.target)
        if (!source || !target) return null

        const sourceCenter = nodeCenter(source)
        const targetCenter = nodeCenter(target)

        return (
          <line
            key={edge.id}
            data-testid="template-preview-edge"
            x1={sourceCenter.x}
            y1={sourceCenter.y}
            x2={targetCenter.x}
            y2={targetCenter.y}
            stroke={STROKE}
            strokeWidth={2}
          />
        )
      })}
      {template.nodes.map((node) => (
        <g key={node.id} data-testid="template-preview-node" data-node-id={node.id}>
          <TemplateNodeShape node={node} />
        </g>
      ))}
    </svg>
  )
}

export { getTemplateBounds }
