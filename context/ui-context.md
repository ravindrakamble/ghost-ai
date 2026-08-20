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

Implemented in `components/editor/canvas-edge.tsx` (spec 16, Edge Behavior) — the first spec to consume `CanvasEdgeData`/`CANVAS_EDGE_TYPE` (defined in spec 11). Registered as `edgeTypes={{ [CANVAS_EDGE_TYPE]: CanvasEdge }}` in `canvas.tsx`, with `defaultEdgeOptions` (`type: CANVAS_EDGE_TYPE`, an arrow `markerEnd`) so edges created via dragging a handle-to-handle connection (`onConnect`) use the custom renderer and marker from creation, not React Flow's default `bezier` edge.

- Routing: right-angle/smooth-step path via `@xyflow/react`'s `getSmoothStepPath` (never a hand-rolled routing algorithm). The label position (`EdgeLabelRenderer`, below) uses that same call's own returned `labelX`/`labelY` (the path's real midpoint), never a manually computed one.
- Color: rest state uses the same subtle `var(--border-default)` token `ShapeVisual` uses for an unselected node border; hovered-or-selected ("bright") uses the same brand-accent `var(--accent-primary)` token used for a selected node border — one shared "bright" state for both hover and selection, not a three-tier system (spec 16's Analyst Brief, Open Questions #2). Stroke width is fixed (not widened on hover/selected) — only color changes, the same rest/selected convention `ShapeVisual`'s own border already follows.
- Hit area: `<BaseEdge>`'s own `interactionWidth` (default 20px) already renders a wider, `strokeOpacity: 0` sibling path alongside the thin visible one — the standard React Flow technique for "easier to click without increasing visible thickness." No separate hand-rolled invisible path.
- Marker: an arrow (`MarkerType.ArrowClosed`), fixed color (`var(--text-secondary)`), not hover/selected-tracking — React Flow resolves `markerEnd` into a static per-edge SVG `<marker>` def from the edge's own persisted data, not a per-render style, so making it track hover state would need a hand-rolled marker instead of React Flow's own marker system (spec 16's Analyst Brief, Open Questions #5, a minor recommendation, not a literal requirement).
- Label editing: double-clicking anywhere on the edge (the line itself, or an existing label) opens inline editing — an `<input>` inside `EdgeLabelRenderer`, positioned at the path's own `labelX`/`labelY`, same double-click-to-edit convention as Node Label Editing below. Updates dispatch on every keystroke through `hooks/use-update-canvas-edge.ts`'s `CanvasEdgeUpdateContext` (provided by `CanvasFlow`, mirroring `CanvasNodeUpdateContext`) — a real `onEdgesChange([{ type: "replace", ... }])` call, not a local-only mutation or a non-serializable callback embedded in `data`. Blur, `Enter`, and `Escape` all just exit edit mode (the value is already synced live by then). A saved label renders as a small `rounded-full`/`bg-elevated`/`border-surface-border` pill badge; while editing with no label yet, the input's own `placeholder` shows a faint (`placeholder:text-copy-faint`) hint instead — an edge at rest with no label renders no label content at all, not an empty hint. The label's interactive elements carry `nodrag nopan` so clicking, selecting, or typing there never starts a node drag or canvas pan.

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

Implemented in `components/editor/canvas-node.tsx` (spec 16, Edge Behavior) — four `@xyflow/react` `Handle` components, one per `Position` (`Top`/`Right`/`Bottom`/`Left`), styled `bg-copy-primary` (near-white fill) with a `border-base` (dark) border, `opacity-0` at rest with `group-hover:opacity-100` (the node's own root wraps `ShapeVisual` and the four handles in a `group relative` `<div>` so hover-driven visibility doesn't require touching `ShapeVisual` itself — the one explicitly permitted exception to spec 16's "don't redesign the node renderer" Scope Limit). Each handle is `type="source"` — with `connectionMode={ConnectionMode.Loose}` already set on `<ReactFlow>` (spec 11), Loose mode's own connection-validity check only requires the two endpoints not be the exact same handle, regardless of `type`, so a single handle per side (not a stacked source+target pair) already supports dragging a connection from any handle to any other handle (spec 16's Analyst Brief, Open Questions #4).

### Canvas Background

React Flow `<Background>` component. Canvas sits on the base background color.

### Floating Shape Panel

Bottom-center pill-shaped toolbar for dragging new shapes onto the canvas (spec 12). Convention: `rounded-full` container (the standard way to get a true pill shape — the Border Radius scale has no dedicated "pill" entry), `bg-elevated` background with `border-surface-border`, matching the same floating-overlay visual language documented for sidebars above. Positioned via `absolute bottom-* left-1/2 -translate-x-1/2` inside the canvas's `relative` wrapper; does not overlap the bottom-left Canvas Control Bar (below) — spec 17 removed the previous default `MiniMap` this section used to reference.

Drag mechanism: pointer-events-based, not native HTML5 `draggable`/`dragstart`/`drop`. Spec 13's original native-DnD implementation (cursor-attached ghost via `dataTransfer.setDragImage`) was replaced after a human smoke test found native drag unreliably failed to *start* for several shapes (rectangle/circle/pill/hexagon needed repeated attempts; diamond/cylinder worked immediately) — a known general weak spot of the browser's native DnD session-initiation, not a bug in the drop logic itself. Each shape button now tracks `pointerdown`/`pointermove`/`pointerup` on `window` and renders its own cursor-following ghost (`ShapeVisual` in a `position: fixed` element centered on the pointer) directly from React state — no off-screen preview elements or `setDragImage` needed. A drop is accepted only when the pointer is released over React Flow's own `.react-flow__pane` (checked via `document.elementFromPoint`), then reported through an `onDropShape` callback into `CanvasFlow`, which converts the screen position via `screenToFlowPosition` and creates the node through the same `onNodesChange` path as before.

### Canvas Control Bar

Floating pill-shaped toolbar (`components/editor/canvas-control-bar.tsx`, spec 17) positioned bottom-left, above the bottom-center Floating Shape Panel so the two never overlap. Same visual language as that panel: `rounded-full` container, `bg-elevated` background with `border-surface-border`. Positioned via `absolute bottom-24 left-6` inside the canvas's `relative` wrapper (a higher `bottom` offset than the Shape Panel's `bottom-6`, so the two stay vertically separated regardless of viewport width, not just relying on the left/center horizontal split).

Two button groups, separated by a thin single-token divider (`border-surface-border`'s paired `--color-surface-border`, applied as a 1px `bg-surface-border` vertical rule — not a new visual element or token):

- **Zoom controls**: zoom out, fit view, zoom in — call the real React Flow instance's `zoomOut`/`fitView`/`zoomIn` (from `useReactFlow()`, already called in `CanvasFlow` for `screenToFlowPosition`), each passed `{ duration: 200 }` for `@xyflow/react`'s own animated viewport transition (not a hand-rolled CSS transition). 200ms is a Dev-level choice within the spec's own recommended 150–300ms range.
- **History controls**: undo, redo — call Liveblocks' `useUndo()`/`useRedo()` handlers (room-scoped canvas-edit history, not a local-only or React-Flow-only mechanism). Disabled (via the shadcn `Button`'s native `disabled` prop, which already ships `disabled:opacity-50`) when `useCanUndo()`/`useCanRedo()` report `false` — no custom dimming CSS needed.

`hooks/use-keyboard-shortcuts.ts` mirrors the same five actions on a single `window` `keydown` listener: `+`/`=` zooms in, `-` zooms out, `Cmd/Ctrl+Z` undoes, `Cmd/Ctrl+Shift+Z` and `Cmd/Ctrl+Y` both redo. Ignored entirely when the event's target or `document.activeElement` is an `<input>`, `<textarea>`, or another `isContentEditable`/`contenteditable` element — the guard that keeps shortcuts from hijacking the node-label (spec 14) and edge-label (spec 16) inline-editing fields. Every recognized shortcut calls `event.preventDefault()` so the app's handling wins over the browser's own native zoom/undo behavior for the same keys.

`CanvasFlow` (`components/editor/canvas.tsx`) is the single source for all of the above — it calls `useReactFlow()`'s zoom methods and Liveblocks' four history hooks directly (valid since it already sits inside `RoomProvider`), then passes the results down as plain props to `CanvasControlBar` and as arguments to `useKeyboardShortcuts`, not through a new React context (both are siblings `CanvasFlow` itself instantiates). No `MiniMap` renders anywhere on the canvas — removed as part of this spec.

### Starter Templates

A fixed, code-defined library of starter canvas templates (`components/editor/starter-templates.ts`, spec 18) — `CANVAS_TEMPLATES`, at least 3 entries (microservices, CI/CD pipeline, event-driven system), each a real `CanvasTemplate` (`{ id, name, description, nodes: CanvasNode[], edges: CanvasEdge[] }`). Every node's `shape`/`color`/`textColor` is a real `NodeShape`/`NODE_COLORS` pair, sized per `SHAPE_DEFAULT_SIZES`, built via a small `templateNode()`/`templateEdge()` helper pair rather than repeated object literals. Node/edge IDs are static, human-readable strings authored directly in the file (e.g. `microservices-api-gateway`) — not `generateNodeId()`, whose timestamp+counter recipe is for dynamically dropped nodes and would produce a different ID every call. No template saving, no custom/user-authored templates, no server persistence — a plain array resolved by ID at import time, per `architecture-context.md`'s Starter System Designs.

**Navbar entry point**: a `LayoutTemplate`-icon button in `workspace-navbar.tsx` (same `variant="outline" size="sm"` styling as the adjacent Share button), calling a new `onOpenTemplates` prop that mirrors the existing `onOpenShare` prop.

**Modal** (`components/editor/starter-templates-modal.tsx`): a dialog built on the same `components/ui/dialog.tsx` primitives `share-dialog.tsx` already uses (`Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`) — `max-w-3xl rounded-3xl` (wider than `ShareDialog`'s `max-w-md` to fit a card grid). `CANVAS_TEMPLATES` renders as a `grid grid-cols-1 sm:grid-cols-2 gap-4` inside a `max-h-[70vh] overflow-y-auto` scroll region, same scrollable-region convention as `ShareDialog`'s collaborator list. Each card (`rounded-2xl`/`border-surface-border`/`bg-elevated`) shows the template's name, description, a `StarterTemplatePreview`, and a full-width Import button. Clicking Import calls `onImport(template)` then closes the dialog.

**Preview mechanism** (`components/editor/starter-template-preview.tsx`): a lightweight SVG diagram, not `<canvas>` and not a React Flow instance — no `@xyflow/react` import anywhere in this file. Reasoning: `<canvas>`'s 2D context isn't available under jsdom without an extra native dependency, and every other canvas-adjacent component in this codebase (`ShapeVisual`, `CanvasNode`, `CanvasEdge`) is tested via RTL queries against real DOM nodes — an SVG preview keeps that same testable-via-RTL property. SVG's own `viewBox`/`preserveAspectRatio` also already does "fit an arbitrary-sized diagram into a fixed-size box" natively, the same idiom `ShapeVisual` (spec 13) already relies on for scaling a single shape into a node's box — reused here at the whole-diagram level instead of hand-rolling scale/translate math.

Mechanism: bounds (`minX`/`minY`/`maxX`/`maxY`) are computed from the template's own node positions/sizes (never hardcoded), padded 20 flow units on all sides so a boundary node's stroke isn't clipped. The `<svg>` gets a fixed pixel `width`/`height` (the card's preview slot) and `viewBox` derived from those padded bounds, with the *default* `preserveAspectRatio` (`xMidYMid meet`, not `ShapeVisual`'s `"none"`) so the diagram's real proportions are preserved and centered rather than stretched. `rectangle`/`pill`/`circle` nodes draw as a plain SVG `<rect>` (with `rx` for rounding)/`<circle>` at the node's real flow-space position/size, filled with `data.color`, stroked with the same `var(--border-default)` token `ShapeVisual` uses at rest (no hover/selection state in a static preview). `diamond`/`hexagon`/`cylinder` nodes wrap the same normalized 0–100 polygon/path point strings `ShapeVisual` uses, in a per-node `<g transform="translate(x, y) scale(w/100, h/100)">` — deliberately mirroring `shape-visual.tsx`'s geometry constants rather than importing/reusing that component, since `ShapeVisual` is a `<div>`-rooted component not designed to nest inside an SVG `<g>`. Edges draw as plain `<line>`s between source/target node centers, same `var(--border-default)` stroke — no routing, no arrowheads, no labels.

**Import mechanism**: `CanvasFlow` (`components/editor/canvas.tsx`) owns `handleImportTemplate`, wired to the modal's `onImport` prop. The modal's own open/close boolean is threaded down as new `Canvas`/`CanvasFlow` props from `WorkspaceShell` (`isTemplatesModalOpen`/`setIsTemplatesModalOpen`) — the same direction `roomId` already flows, and the same "pass the real mechanism down as props, no new context" posture spec 17 established for `CanvasControlBar`. Selecting a template clears every existing node/edge, then adds the template's own nodes/edges, then fits the view — with no confirmation dialog before the clear (the existing Liveblocks undo, spec 17, is the recovery path).

Removal genuinely goes through Liveblocks' `onDelete` mutation (also returned by `useLiveblocksFlow`, alongside `onNodesChange`/`onEdgesChange`) rather than a `{ type: "remove" }` change dispatched through `onNodesChange`/`onEdgesChange` — reading the installed `@liveblocks/react-flow`'s real source showed that `"remove"` case is a no-op in `applyNodeChanges`/`applyEdgeChanges` (removal is only implemented on the separate `onDelete` mutation). `onDelete({ nodes, edges })` is called with the full current node/edge arrays; the template's nodes/edges are then added via the standard `onNodesChange`/`onEdgesChange` `{ type: "add", item }` path (spec 12's pattern), one call each — but all three calls are wrapped in a single `room.batch(...)` (`room` from `useRoom()`, `@liveblocks/react/suspense`), so they coalesce into one Storage commit/broadcast instead of three. This closes a real gap found in QA's bugfix round: each of `onDelete`/`onNodesChange`/`onEdgesChange` is itself a `useMutation`-returned function that already wraps its own call in `room.batch(...)` internally, but `@liveblocks/core`'s `batch()` is documented as reentrant/nestable — a nested `batch()` call runs its callback inline and folds its ops into the enclosing batch rather than flushing on its own — so an *outer* `room.batch(...)` around all three genuinely merges them into one atomic swap, closing the transient-empty-canvas window a remote collaborator could otherwise observe between the `onDelete` commit and the "add" commits. `fitView()` is called synchronously right after the batch — verified via `@xyflow/react`'s own source that `fitView()` only queues a `fitViewQueued` flag consumed on a later internal `setNodes()` call once the newly-imported nodes report `nodesInitialized: true`, so no manual deferral (`requestAnimationFrame`/effect/microtask) is needed for the fit to land on the new diagram's real bounds rather than the stale previous ones.

## Component Library

shadcn/ui on top of Tailwind. No custom design system. Components live in `components/ui/`. Use the `shadcn` CLI to add new components rather than writing them from scratch.

## Layout Patterns

- Editor workspace: full-viewport layout — floating sidebar overlay on the left, center canvas, slide-over AI sidebar on the right.
- Sidebars: floating overlay with dark semi-transparent background and subtle border.
- Modals and dialogs: centered overlay, `rounded-3xl`, dark background with backdrop blur.
- Navbar: top bar with dark background and bottom border.

## Icons

Lucide React. Stroke-based icons only — no filled variants. Icon sizes: `h-4 w-4` for inline, `h-5 w-5` for buttons, `h-8 w-8` for feature icons in empty states.
