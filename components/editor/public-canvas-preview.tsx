import { getTemplateBounds } from "@/components/editor/starter-template-preview"
import type { CanvasNode, CanvasEdge } from "@/types/canvas"

/**
 * Full-page, read-only diagram preview for `/share/[token]` (spec 34) — the
 * public page's own equivalent of `starter-template-preview.tsx`'s SVG
 * diagram, reused at a page-appropriate size instead of that file's fixed
 * 280x160 card-thumbnail box. Reuses `getTemplateBounds` directly (exported
 * from that file) for the diagram's bounding box; the per-shape SVG
 * switch/`STROKE` token below mirrors (does not import) that file's
 * `TemplateNodeShape`/`STROKE`, since neither is exported and `ShapeVisual`
 * itself is a `<div>`-rooted component that can't nest inside this SVG (spec
 * 34's Analyst Brief, Open Questions #4). Edges render as plain `<line>`s
 * between node centers — no routing, no arrowheads, no labels, matching the
 * same static-preview convention.
 *
 * No `@xyflow/react` import, no interactivity of any kind — a public
 * visitor never joins the live Liveblocks room (spec 34's Scope Limit).
 */

const STROKE = "var(--border-default)"

function nodeCenter(node: CanvasNode): { x: number; y: number } {
  return {
    x: node.position.x + (node.width ?? 0) / 2,
    y: node.position.y + (node.height ?? 0) / 2,
  }
}

function PublicNodeShape({ node }: { node: CanvasNode }) {
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

interface PublicCanvasPreviewProps {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

/**
 * Renders the last-saved canvas snapshot as a static, full-width SVG. A
 * project with no saved canvas yet (`nodes.length === 0`) shows an explicit
 * empty state rather than an empty/broken-looking SVG — see spec 34's
 * Analyst Brief, Open Questions #3, and acceptance criterion 6.
 */
export function PublicCanvasPreview({ nodes, edges }: PublicCanvasPreviewProps) {
  if (nodes.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-2xl border border-surface-border bg-elevated">
        <p className="text-sm text-copy-muted">No diagram has been saved for this project yet.</p>
      </div>
    )
  }

  const bounds = getTemplateBounds(nodes)
  const nodesById = new Map(nodes.map((node) => [node.id, node]))

  return (
    <div className="h-[70vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-surface-border bg-elevated">
      <svg
        width="100%"
        height="100%"
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Project diagram preview"
      >
        {edges.map((edge) => {
          const source = nodesById.get(edge.source)
          const target = nodesById.get(edge.target)
          if (!source || !target) return null

          const sourceCenter = nodeCenter(source)
          const targetCenter = nodeCenter(target)

          return (
            <line
              key={edge.id}
              data-testid="public-preview-edge"
              x1={sourceCenter.x}
              y1={sourceCenter.y}
              x2={targetCenter.x}
              y2={targetCenter.y}
              stroke={STROKE}
              strokeWidth={2}
            />
          )
        })}
        {nodes.map((node) => (
          <g key={node.id} data-testid="public-preview-node" data-node-id={node.id}>
            <PublicNodeShape node={node} />
          </g>
        ))}
      </svg>
    </div>
  )
}
