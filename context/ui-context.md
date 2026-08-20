# UI Context

## Theme

Dark only. No light mode. The visual language is a dark technical workspace — near-black backgrounds, layered surfaces, and vivid accent colors for interactive elements.

All colors are defined as CSS custom properties in `globals.css` and mapped to Tailwind tokens via `@theme inline`. Components must use these tokens — no hardcoded hex values or raw Tailwind color classes like `zinc-*`.

| Role             | CSS Variable           | Hex / Value               |
| ---------------- | ---------------------- | ------------------------- |
| Page background  | `--bg-base`            | `#080809`                 |
| Surface          | `--bg-surface`         | `#111114`                 |
| Elevated surface | `--bg-elevated`        | `#18181c`                 |
| Subtle surface   | `--bg-subtle`          | `#1e1e23`                 |
| Default border   | `--border-default`     | `#2a2a30`                 |
| Subtle border    | `--border-subtle`      | `#3a3a42`                 |
| Primary text     | `--text-primary`       | `#f0f0f4`                 |
| Secondary text   | `--text-secondary`     | `#c0c0cc`                 |
| Muted text       | `--text-muted`         | `#808090`                 |
| Faint text       | `--text-faint`         | `#505060`                 |
| Brand accent     | `--accent-primary`     | `#00c8d4` (cyan)          |
| Brand dim        | `--accent-primary-dim` | `rgba(0, 200, 212, 0.12)` |
| AI accent        | `--accent-ai`          | `#6457f9` (indigo-purple) |
| AI text          | `--accent-ai-text`     | `#8b82ff`                 |
| Error            | `--state-error`        | `#ff4d4f`                 |
| Success          | `--state-success`      | `#34d399`                 |
| Warning          | `--state-warning`      | `#fbbf24`                 |

Tailwind utility names map to these variables. Use `bg-base`, `bg-surface`, `text-copy-primary`, `text-copy-muted`, `border-surface-border`, `text-brand`, `bg-accent-dim`, etc.

## Typography

| Role      | Font       | CSS Variable        |
| --------- | ---------- | ------------------- |
| UI text   | Geist Sans | `--font-geist-sans` |
| Code/mono | Geist Mono | `--font-geist-mono` |

Both fonts are loaded via `next/font/google` and applied as CSS variables on the `<html>` element. The base `body` uses Geist Sans with `antialiased`.

## Border Radius

Radius increases with surface depth — smaller for inner elements, larger for outer containers.

| Context           | Class         |
| ----------------- | ------------- |
| Inline / small UI | `rounded-xl`  |
| Cards / panels    | `rounded-2xl` |
| Modal / overlay   | `rounded-3xl` |

## Canvas

### Node Color Palette

8 defined color pairs. Each pair specifies a dark node fill and a vivid contrasting text color tuned for readability on the dark canvas. Defined in `types/canvas.ts` as `NODE_COLORS`.

| Node fill | Text color | Character              |
| --------- | ---------- | ---------------------- |
| `#1F1F1F` | `#EDEDED`  | Neutral dark (default) |
| `#10233D` | `#52A8FF`  | Blue                   |
| `#2E1938` | `#BF7AF0`  | Purple                 |
| `#331B00` | `#FF990A`  | Orange                 |
| `#3C1618` | `#FF6166`  | Red                    |
| `#3A1726` | `#F75F8F`  | Pink                   |
| `#0F2E18` | `#62C073`  | Green                  |
| `#062822` | `#0AC7B4`  | Teal                   |

Default node color: `#1F1F1F` with `#EDEDED` text.

The table above is implemented as a real, exported constant — `NODE_COLORS: readonly { color: string; textColor: string }[]` in `types/canvas.ts` (spec 15, Nodes Color Toolbar) — in the same order as the table, first entry equal to `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR`. `CanvasNodeData` carries both `color` and `textColor` fields; `ShapeVisual` (`components/editor/shape-visual.tsx`) takes `textColor` as a prop (defaulting to `DEFAULT_NODE_TEXT_COLOR` when omitted, e.g. the shape panel's drag-preview elements, which render no label) so a node's label always pairs with its own fill rather than a single fixed color for every node.

### Edge Style

Smooth-step path with an arrow marker. Default edge color: `#f8fafc`. Stroke width is thin — edges are visually secondary to nodes.

### Node Shapes

6 supported shapes, defined in `types/canvas.ts` as `NODE_SHAPES`. Complex shapes (diamond, hexagon, cylinder) are rendered as inline SVGs rather than CSS borders.

- `rectangle` — default general-purpose node
- `diamond` — decision / gateway
- `circle` — event / endpoint
- `pill` — service / process
- `cylinder` — database / storage
- `hexagon` — external system / boundary

Rendering, per spec 13 (`components/editor/shape-visual.tsx`, shared by `CanvasNode` and the shape panel's drag preview so both stay in sync):

- `rectangle`/`pill`/`circle` are a plain CSS `<div>` — `rounded-xl` for rectangle, `rounded-full` for pill and circle (circle's 1:1 default size is what makes the roundness read as a circle, not a separate CSS trick).
- `diamond`/`hexagon`/`cylinder` are an inline `<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">` so the shape stretches to fill the node's actual `width`/`height` rather than clipping or floating at a fixed size. Geometry: diamond is a 4-point polygon (`50,2 98,50 50,98 2,50`), hexagon a flat-topped 6-point polygon (`25,2 75,2 98,50 75,98 25,98 2,50`), cylinder the standard database-drum idiom (a filled body path plus a top ellipse drawn over it). These coordinates are a Dev-level styling choice, not a pinned design reference.
- Border/stroke: subtle (`--border-default`, via the `border-surface-border` token class on CSS shapes) at rest, brand accent (`--accent-primary`, via `border-brand`) when the node is selected (React Flow's `NodeProps.selected`). SVG shapes use the same two tokens via an inline `stroke` referencing the CSS custom property directly (`var(--border-default)`/`var(--accent-primary)`) rather than a hardcoded hex, since SVG `stroke` doesn't take a Tailwind class as directly as `border-*` does.

### Node Resize

`components/editor/canvas-node.tsx` renders `@xyflow/react`'s built-in `<NodeResizer>` as a sibling of `ShapeVisual` (spec 14), visible only when the node is selected (`isVisible={selected}`) — an unselected node shows no resize affordance at all. Styling follows the same subtle-at-rest/brand-accent-when-active token pairing spec 13 established for node borders, since handles only ever appear alongside that already-brand-colored selected border: handles are small brand-accent (`border-brand`) circles on a `bg-base` fill, the connecting resize line is the subtle `border-surface-border` token. No raw hex — `NodeResizer`'s `handleClassName`/`lineClassName` props take Tailwind utility classes (with `!important` to reliably override the library's own default `style.css`), not its `color` prop (which only accepts a raw CSS color string).

Minimum node size is a flat `NODE_MIN_SIZE` (`lib/canvas-shapes.ts`): 40×40, well below every shape's `SHAPE_DEFAULT_SIZES` entry. A flat floor (not per-shape) was chosen since nothing in the spec text pins an exact number or a per-shape rule — see spec 14's Analyst Brief, Open Questions #3.

### Node Label Editing

Double-clicking a node's label/center area (spec 14) enters inline editing: a `<textarea>` replaces the label `<span>`/"Untitled" placeholder in the same slot, inheriting `ShapeVisual`'s existing centering rather than reimplementing it. The label updates live on every keystroke (not just on close) so the change is visible to other participants collaboratively, dispatched through a small React context (`hooks/use-update-canvas-node.ts`, provided by `CanvasFlow`) that wraps a real `onNodesChange([{ type: "replace", ... }])` call — the same synced path `NodeResizer`'s own dimension changes already use, not a local-only React Flow store mutation or a non-serializable callback embedded in node `data`. Editing closes on blur or `Escape`. The editable wrapper carries React Flow's `nodrag nopan` classes so clicking, selecting text, or typing doesn't start a node drag or canvas pan.

### Node Color Toolbar

A floating swatch toolbar (`components/editor/node-color-toolbar.tsx`, spec 15) renders above a canvas node only while it is `selected` — same `selected`-gated-visibility convention as Node Resize above, rendered as a sibling of `ShapeVisual`/`NodeResizer` within `CanvasNode`. Positioned via `absolute bottom-full left-1/2 -translate-x-1/2` with a small `mb-2` gap, so it sits above the node without overlapping its shape.

The toolbar shows exactly one swatch button per `NODE_COLORS` pair (8 total, `rounded-full`, `bg-elevated`/`border-surface-border` container matching the shape panel's pill convention). The swatch matching the node's current `data.color` gets the same `border-brand` selected-token treatment used for node borders and resize handles; inactive swatches use `border-surface-border`. Hovering a swatch shows a tight, non-blurry ring (`box-shadow` with zero blur, fixed spread) in that swatch's own paired text color — since this color varies per swatch (sourced from `NODE_COLORS` data, not a single static theme token), it's applied via a per-swatch CSS custom property (`--swatch-glow`) and a `hover:shadow-[0_0_0_2px_var(--swatch-glow)]` Tailwind arbitrary-value utility, the same "runtime data drives an inline color" pattern `ShapeVisual` already uses for `data.color`. Clicking a swatch dispatches `{ color, textColor }` together through the existing `useUpdateCanvasNode()` mechanism (spec 14) — no new sync path. The container carries `nodrag nopan` so interacting with it never starts a node drag or canvas pan. No free-form color input (hex field, native color picker, custom swatch) exists anywhere on the canvas.

### Connection Handles

Small white circular handles, hidden by default, revealed on node hover. Appear at all four sides of a node.

### Canvas Background

React Flow `<Background>` component. Canvas sits on the base background color.

### Floating Shape Panel

Bottom-center pill-shaped toolbar for dragging new shapes onto the canvas (spec 12). Convention: `rounded-full` container (the standard way to get a true pill shape — the Border Radius scale has no dedicated "pill" entry), `bg-elevated` background with `border-surface-border`, matching the same floating-overlay visual language documented for sidebars above. Positioned via `absolute bottom-* left-1/2 -translate-x-1/2` inside the canvas's `relative` wrapper; does not overlap the default bottom-right `MiniMap`.

Drag preview (spec 13): starting a drag from a shape button shows a cursor-attached ghost preview via the native `dataTransfer.setDragImage(element, xOffset, yOffset)` API — not a custom `mousemove`-tracked floating element. The panel keeps one always-mounted, off-screen preview `<div>` per shape (sized per `SHAPE_DEFAULT_SIZES`, rendered with the same `ShapeVisual` geometry `CanvasNode` uses), because `setDragImage` needs a real, already-rendered DOM node at the moment `dragstart` fires — state committed inside that same synchronous handler wouldn't exist in the DOM yet. The browser positions and removes the ghost automatically for the whole drag (drop or cancel), so no extra cleanup code is needed.

## Component Library

shadcn/ui on top of Tailwind. No custom design system. Components live in `components/ui/`. Use the `shadcn` CLI to add new components rather than writing them from scratch.

## Layout Patterns

- Editor workspace: full-viewport layout — floating sidebar overlay on the left, center canvas, slide-over AI sidebar on the right.
- Sidebars: floating overlay with dark semi-transparent background and subtle border.
- Modals and dialogs: centered overlay, `rounded-3xl`, dark background with backdrop blur.
- Navbar: top bar with dark background and bottom border.

## Icons

Lucide React. Stroke-based icons only — no filled variants. Icon sizes: `h-4 w-4` for inline, `h-5 w-5` for buttons, `h-8 w-8` for feature icons in empty states.
