# Spec 12 — Shape Panel

## Analyst Brief

### Scope statement

This spec adds a floating shape toolbar to the canvas that lets a user drag a shape onto the canvas surface to create a new node at the drop position, and adds the first custom node renderer (a bordered rectangle with a centered label) so that new node is actually visible. It does not add shape-specific visuals, node editing/resizing/deleting, edge creation, or persistence.

### Concrete deliverables

- `components/editor/shape-panel.tsx` (new) — the floating pill-shaped toolbar rendered at the bottom-center of the canvas, containing 6 draggable icon buttons (rectangle, diamond, circle, pill, cylinder, hexagon). Each button sets a `dataTransfer` payload on `dragstart` containing the shape name and its default width/height.
- `components/editor/canvas-node.tsx` (new) — the custom node component registered as `CANVAS_NODE_TYPE`. For this unit, renders every shape as a bordered rectangle with the label centered (per the spec's own "for this unit" note) — no shape-specific SVGs yet.
- `lib/canvas-shapes.ts` (new, exact name at Dev's discretion) — shared, non-component logic: the per-shape default size table and the node-ID generator (shape name + timestamp + counter). Proposed as a `lib/` module rather than inline in a component, per `code-standards.md`'s "keep modules small and single-purpose" — both the drag payload (in `shape-panel.tsx`) and the drop handler (in `canvas.tsx`) need the same default-size table, so it shouldn't be defined in only one of them.
- `types/canvas.ts` (modified) — add a `DEFAULT_NODE_COLOR` constant (`"#1F1F1F"`, matching `ui-context.md`'s documented default). Does **not** add the full 8-color `NODE_COLORS` palette array — see Open Questions #3.
- `components/editor/canvas.tsx` (modified) — the substantive change in this spec:
  - Wraps wherever `useReactFlow()`/the drop handler lives in an explicit `<ReactFlowProvider>` from `@xyflow/react` (see Open Questions #4 — this is a hard technical requirement, not a style choice).
  - Adds `onDragOver` (calling `event.preventDefault()`) and `onDrop` handlers, passed as props directly to `<ReactFlow>` (verified to land on the real `react-flow__wrapper` DOM node via React Flow's prop passthrough — see Open Questions #4), satisfying the spec's "add `dragover`/`drop` handling to the canvas wrapper."
  - On drop: reads the shape payload, calls `screenToFlowPosition({ x: event.clientX, y: event.clientY })`, builds a new node (empty label, `DEFAULT_NODE_COLOR`, the dragged shape, the dragged default size, a generated ID, `type: CANVAS_NODE_TYPE`), and adds it via `onNodesChange([{ type: "add", item: newNode }])` — the mechanism `useLiveblocksFlow` actually exposes for mutating node state (see Open Questions #5).
  - Registers `nodeTypes={{ [CANVAS_NODE_TYPE]: CanvasNode }}` on `<ReactFlow>` — this is the "later spec" spec 11's brief explicitly deferred this to (confirmed by direct comparison against `context/spec-status/11-base-canvas.md`'s Open Questions #4/#5 and Dev Notes).
  - Renders `<ShapePanel>` somewhere within the canvas's existing `relative` wrapper.

### Acceptance criteria

1. A floating pill-shaped toolbar renders at the bottom-center of the canvas, with 6 draggable icon buttons: rectangle, diamond, circle, pill, cylinder, hexagon.
2. Starting a drag on a shape button sets a `dataTransfer` payload containing the shape name and a default `{ width, height }`, matching the spec's explicit sizing rules (rectangle wider than tall, circle square, diamond slightly larger than the others) — see Open Questions #2 for the two shapes (pill, cylinder, hexagon) the spec text doesn't pin down.
3. The canvas wrapper handles `dragover` (preventing the default so a drop is allowed) and `drop`.
4. On drop, the handler reads the dragged shape payload, converts the screen position to canvas coordinates via React Flow's real `screenToFlowPosition` (from `useReactFlow()`), and creates a new node at that position with: an empty label, the default node color, and the dragged shape/size.
5. The new node's ID is generated from the shape name, a timestamp, and a counter (see Open Questions #6 on collision risk).
6. The new node has `type: CANVAS_NODE_TYPE` and is added into the Liveblocks-synced node list (visible to other room participants, not just locally).
7. A custom node renderer is registered for `CANVAS_NODE_TYPE` via `nodeTypes` on `<ReactFlow>`; for this unit it renders every shape as a bordered rectangle with the label centered.
8. No edges, edge types, or `CanvasEdgeData`/`CANVAS_EDGE_TYPE` behavior are touched by this spec.
9. `npm run build` and `npx tsc --noEmit` pass without type errors; `npx eslint .` passes with no new errors.

### Dependencies

- Spec 11 (Base Canvas) — **complete**. This spec builds directly on its deliverables: `components/editor/canvas.tsx` (the `Canvas`/`CanvasRoomBoundary`/`CanvasFlow` structure, currently rendering `<ReactFlow>` with no `nodeTypes` and no `<ReactFlowProvider>`), and `types/canvas.ts` (`CanvasNodeData`, `NodeShape`, `CANVAS_NODE_TYPE`, `CanvasNode`), both defined but deliberately unconsumed until "a later spec" — confirmed by direct read of `context/spec-status/11-base-canvas.md` that this is that spec.
- `@xyflow/react` and `@liveblocks/react-flow` — already installed (`package.json`, spec 11). No new third-party packages are required for this spec; confirmed no drag-and-drop library (e.g. `react-dnd`, `@dnd-kit/*`) is installed or needed — the spec explicitly asks for native `dragover`/`drop` handling, which is the correct approach here.
- `ui-context.md`'s Canvas section (Node Color Palette, Node Shapes) — source for the default node color and the 6 supported shapes.

### Open questions

1. **No prior "pill-shaped floating toolbar" convention exists in `ui-context.md`.** The closest documented pattern is sidebars: "floating overlay with dark semi-transparent background and subtle border." `ui-context.md`'s Border Radius scale has no explicit "pill" entry (only `rounded-xl`/`rounded-2xl`/`rounded-3xl`). Recommendation: use `rounded-full` for the toolbar container (the standard way to get a true pill shape), `bg-elevated`/`border-default` tokens to match the existing floating-overlay visual language, positioned via `absolute bottom-* left-1/2 -translate-x-1/2` inside the canvas's existing `relative flex-1 bg-base` wrapper. This does not conflict with the `MiniMap`, which sits bottom-right by default. Flagged as a recommendation, not a settled requirement — `ui-context.md` should be updated with this pattern once built, per the "Keeping Docs In Sync" workflow rule.

2. **Default sizes for pill, cylinder, and hexagon are not specified.** The spec's implementation step 3 only pins sizing rules for rectangle ("wider than tall"), circle ("square"), and diamond ("slightly larger... so labels have room"). Recommendation (concrete pixel values so QA/Dev have something to check against):
   | Shape | Width × Height | Rationale |
   |---|---|---|
   | rectangle | 160 × 80 | wider than tall, per spec text |
   | circle | 80 × 80 | square, per spec text |
   | diamond | 160 × 160 | larger than circle, room for a label inside the diamond's inscribed area, per spec text |
   | pill | 160 × 60 | service/process shape, wider than tall like rectangle but shallower, reading as a pill silhouette |
   | cylinder | 100 × 120 | database/storage shape, taller than wide, typical cylinder proportions |
   | hexagon | 140 × 100 | external system/boundary, roughly rectangle-like footprint |

   These are a recommendation only — nothing in the spec, `project-overview.md`, or `ui-context.md` pins exact pixel values for these three shapes. The Senior Developer may adjust; QA should verify against whatever concrete table Dev actually implements, not silently assume these exact numbers.

3. **Default node color: use the documented default, don't build the full palette yet.** `ui-context.md` states the default node color is `#1F1F1F` fill / `#EDEDED` text. `types/canvas.ts` currently has no `NODE_COLORS` constant (spec 11 deliberately deferred it — see `context/spec-status/11-base-canvas.md` Open Questions #5). Recommendation: add only a `DEFAULT_NODE_COLOR` constant now, not the full 8-color array, since nothing in this spec needs the other 7 colors (no color-picker UI is requested). Flagged so the full palette isn't pulled in as unrequested scope.

4. **`screenToFlowPosition` is real, but requires an explicit `<ReactFlowProvider>` that doesn't currently exist in `canvas.tsx`.** Verified directly against the installed `@xyflow/react` package (not assumed): `screenToFlowPosition` is a real method on the `ReactFlowInstance` returned by `useReactFlow()` (`node_modules/@xyflow/react/dist/esm/types/general.d.ts`). However, `<ReactFlow>`'s own source (`node_modules/@xyflow/react/dist/esm/index.mjs`) shows it only auto-wraps its own JSX **children** in `ReactFlowProvider`/store context (via an internal `Wrapper` component checking `isWrapped`) — the component that *instantiates* `<ReactFlow>` in the same function body (currently `CanvasFlow`) is not itself a descendant of that context. Calling `useReactFlow()` directly inside `CanvasFlow`, as currently structured, would throw a "no provider" error at runtime. Recommendation: wrap `CanvasFlow` (or its parent) in an explicit `<ReactFlowProvider>` from `@xyflow/react` so `useReactFlow()` resolves correctly wherever the drop handler is implemented. Separately confirmed: extra unrecognized props passed to `<ReactFlow>` (e.g. `onDragOver`, `onDrop`) are spread via `...rest` directly onto the real `react-flow__wrapper` DOM div, so attaching `onDragOver`/`onDrop` as plain props on `<ReactFlow>` itself is a valid, verified way to satisfy "add dragover and drop handling to the canvas wrapper" without introducing a separate wrapping `<div>`.

5. **`useLiveblocksFlow` exposes no `setNodes`/`addNodes` — new nodes must be added via `onNodesChange`.** Verified against `@liveblocks/react-flow`'s real type definitions (`node_modules/@liveblocks/react-flow/dist/index.d.ts`): the hook's return value is `{ nodes, edges, onNodesChange, onEdgesChange, onConnect, onDelete }` — no direct node-list setter. `@xyflow/react`'s `NodeChange` union (verified in `@xyflow/system`'s type defs) includes a real `NodeAddChange = { type: "add"; item: NodeType; index?: number }`. Recommendation: create the new node via `onNodesChange([{ type: "add", item: newNode }])`, which routes the addition through Liveblocks' own change handler and keeps it synced to other room participants — this is the load-bearing detail that makes acceptance criterion 6 ("visible to other room participants, not just locally") actually true, not just a locally-rendered node.

6. **Node ID collision risk under concurrent multi-user drops is real, though low-probability.** The spec's literal ID recipe (shape name + timestamp + counter) is generated independently per browser session — two different users' browsers could in principle produce the same ID (same shape, same millisecond, same counter value, e.g. both starting a fresh session) since nothing in the recipe is tied to a specific client. Nodes are stored in a `LiveMap<string, LiveblocksNode>` keyed by ID (confirmed via `@liveblocks/react-flow`'s types), so an ID collision would mean one user's node silently overwrites or conflicts with another's rather than erroring. Recommendation: append a lightweight per-client-unique component to the generated ID (e.g. a short random suffix, or the Liveblocks connection ID if conveniently available) in addition to the spec's named shape/timestamp/counter components, to close this gap cheaply. This is a recommendation, not a decision — the spec's text names only shape/timestamp/counter, and the practical collision probability is low, so the Senior Developer may reasonably implement the literal recipe as-is if a stronger uniqueness guarantee is judged unnecessary for this unit. Flagged rather than silently resolved either way.

7. **This spec is confirmed to be the "later spec" spec 11 deferred custom node rendering to.** Cross-checked directly against `context/spec-status/11-base-canvas.md`'s Dev Notes ("`types/canvas.ts` left unconsumed... a future spec registers them via `nodeTypes`/`edgeTypes` once the actual visual components exist") and this spec's own step 7 ("Add a basic renderer for the custom canvas node type"). No ambiguity here — registering `nodeTypes={{ [CANVAS_NODE_TYPE]: CanvasNode }}` on `<ReactFlow>` in `canvas.tsx`, replacing the currently-absent registration, is squarely in scope for this spec.

### Out-of-scope callouts

- **Shape-specific visuals** (SVG diamond/hexagon/cylinder rendering, per `ui-context.md`'s "Complex shapes... rendered as inline SVGs") — explicitly excluded by the spec's own text: "For this unit, render every shape as a simple bordered rectangle with the label centered. Shape-specific visuals will be added later."
- **The full `NODE_COLORS` 8-color palette / any color-picker UI** — not requested by this spec's text; only the single default color is needed. See Open Questions #3.
- **Connection handles** (hover-revealed, per `ui-context.md`) — not mentioned by this spec; the custom node renderer this spec adds is a bordered rectangle with a centered label only.
- **Edge creation, `CanvasEdgeData`, `CANVAS_EDGE_TYPE`, or any edge rendering** — the spec's text is entirely about nodes/shapes; nothing here touches edges. `onConnect` (already wired from spec 11) is untouched.
- **Node editing after creation** — renaming the (currently empty) label, resizing, moving beyond React Flow's default drag behavior, or deleting — not requested by this spec, which only covers creation via drag-and-drop.
- **`<Controls>` panel** — still not requested by any spec seen so far; remains absent per spec 11's original scope limit.
- **Canvas snapshot persistence to Vercel Blob** — spec 21's job. This spec adds nodes to the live Liveblocks room session only; nothing here saves or loads a snapshot.
- **Live cursor rendering, presence avatar UI, `thinking`-state UI, AI-generated content** — specs 19/24/22/25 respectively; untouched by this spec.
- **Billing, enterprise permission tiers, versioned spec history, production object storage migration, mobile apps** — `project-overview.md`'s Out of Scope wall; nothing in this spec's text comes near any of these.

## Dev Notes

### Files added

- `lib/canvas-shapes.ts` — shared, non-component canvas-shape logic used by both `shape-panel.tsx` (drag source) and `canvas.tsx` (drop target): `CANVAS_SHAPES` (ordered shape list), `SHAPE_DEFAULT_SIZES` (the per-shape default `{ width, height }` table from Open Questions #2), `SHAPE_LABELS`, `CANVAS_DRAG_MIME_TYPE`, `serializeShapeDragPayload`/`parseShapeDragPayload` (the latter validates untrusted `dataTransfer` input read at the drop boundary — rejects malformed JSON, non-object payloads, unknown shape names, and non-positive/non-numeric sizes, per `code-standards.md`'s "validate unknown external input at system boundaries"), `generateNodeId`, `createDroppedNode`.
- `lib/canvas-shapes.test.ts` — unit tests for the above (size-table shape, drag-payload round-trip and rejection cases, node-ID uniqueness, `createDroppedNode`'s output shape).
- `components/editor/canvas-node.tsx` — `CanvasNode`, the custom node renderer registered for `CANVAS_NODE_TYPE`. Renders every shape identically for this unit: a bordered rectangle (`border-surface-border`, `rounded-xl`) with the label centered, or an "Untitled" placeholder when the label is empty (new nodes are created with an empty label — nothing in this spec adds a way to set one, so an empty label needs *some* visible affordance rather than rendering blank). No `"use client"` — no hooks/browser interactivity, consistent with `code-standards.md`'s RSC-by-default rule; it's bundled into the client tree transitively because `canvas.tsx` (a client module) imports and renders it.
- `components/editor/canvas-node.test.tsx` — renders label vs. empty-label placeholder, and verifies both the fill color (`data.color`) and the documented default text color are applied to the bordered container.
- `components/editor/shape-panel.tsx` — `ShapePanel`, the floating pill-shaped toolbar. 6 draggable buttons (`Button variant="ghost" size="icon-lg"`, `lucide-react`'s `Square`/`Diamond`/`Circle`/`Pill`/`Cylinder`/`Hexagon` icons — all 6 exist in the installed `lucide-react` package, confirmed directly rather than assumed). `dragstart` calls `event.dataTransfer.setData(CANVAS_DRAG_MIME_TYPE, serializeShapeDragPayload(shape))` and sets `effectAllowed = "copy"`.
- `components/editor/shape-panel.test.tsx` — renders one draggable button per shape; asserts the exact `dataTransfer` payload (shape + default size) set on `dragstart` for each of the 6 shapes.

### Files changed

- `types/canvas.ts` — added `DEFAULT_NODE_COLOR` (`"#1F1F1F"`, per the brief) and, beyond the brief's literal ask, `DEFAULT_NODE_TEXT_COLOR` (`"#EDEDED"`) — `ui-context.md` documents these as a pair ("Default node color: #1F1F1F with #EDEDED text"), and `CanvasNode` needs a text color to render the label legibly. Treated this as the same "documented data value" precedent as `CURSOR_COLORS` (spec 10) rather than an invented style choice — flagged here since the brief only asked for the fill-color constant. Still not the full 8-color `NODE_COLORS` palette (no color picker in this spec).
- `components/editor/canvas.tsx`:
  - Wrapped `CanvasFlow` in `<ReactFlowProvider>` inside the existing `ClientSideSuspense` — confirmed necessary (not just a style choice) by checking `@xyflow/react`'s own source: `<ReactFlow>` only auto-wraps its *children* in provider context, not the component that instantiates it, so `useReactFlow()` inside `CanvasFlow` would otherwise throw at runtime.
  - `CanvasFlow` now also calls `useReactFlow()` for `screenToFlowPosition`, and adds `handleDragOver`/`handleDrop` (both `useCallback`-memoized) passed directly as `onDragOver`/`onDrop` props on `<ReactFlow>` — confirmed these land on the real `react-flow__wrapper` div via `ReactFlowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'>` (checked directly in `@xyflow/react`'s type defs, not assumed).
  - `handleDragOver` only calls `preventDefault()`/sets `dropEffect` when `event.dataTransfer.types` includes `CANVAS_DRAG_MIME_TYPE` (checking `.types`, not `.getData()`, since some browsers restrict reading actual drag data outside the `drop` event) — so drags of anything else (e.g. browser file drops) aren't hijacked.
  - `handleDrop` reads and validates the payload via `parseShapeDragPayload` (bails out with no `onNodesChange` call if invalid/absent — a no-op rather than a thrown error, since a `drop` event without a recognized payload is an expected occurrence, not a bug), converts screen coordinates via `screenToFlowPosition`, builds the node via `createDroppedNode`, and adds it via `onNodesChange([{ type: "add", item: newNode }])` — the only node-mutation entry point `useLiveblocksFlow` exposes (verified against `@liveblocks/react-flow`'s real types), which is what actually syncs the new node to other room participants.
  - `useLiveblocksFlow` and the module-level `CANVAS_NODE_TYPES` constant are now explicitly generic-typed over `CanvasNode`/`CanvasEdge` (previously implicit `BuiltInNode`/`BuiltInEdge`) so the node/edge types flowing through `nodes`, `onNodesChange`, and `nodeTypes` all agree with the shape actually being created and rendered.
  - Registered `nodeTypes={{ [CANVAS_NODE_TYPE]: CanvasNode }}` as a module-level constant (`CANVAS_NODE_TYPES`) rather than inline in `CanvasFlow`, so the reference stays stable across renders (React Flow expects `nodeTypes` to be referentially stable).
  - `<ShapePanel>` renders as a sibling inside `Canvas`'s existing top-level `relative` wrapper (outside the Liveblocks/Suspense tree — it doesn't need room state itself, only the drop target inside `CanvasFlow` does).
- `components/editor/canvas.test.tsx` — extended the existing `@xyflow/react` mock with `ReactFlowProvider`/`useReactFlow`, and had the mocked `<ReactFlow>` capture its full prop set (via a `vi.hoisted` ref) so `nodeTypes`/`onDragOver`/`onDrop` can be asserted and invoked directly. Added cases: shape panel renders within the canvas; `nodeTypes` registers exactly `CANVAS_NODE_TYPE`; `dragover` calls `preventDefault`/sets `dropEffect: "copy"` only for a recognized payload; `drop` calls `screenToFlowPosition` with the raw client coordinates and adds exactly one `NodeAddChange` with the expected shape/size/color/type via `onNodesChange`; a malformed/missing drop payload adds nothing.
- `context/ui-context.md` — added a "Floating Shape Panel" subsection under Canvas, documenting the `rounded-full`/`bg-elevated`/`border-surface-border` pill-toolbar convention this spec introduces (per Open Questions #1's recommendation and the "Keeping Docs In Sync" workflow rule).

### Key decisions

- **Pill-toolbar visual pattern**: followed the brief's Open Questions #1 recommendation as-is (`rounded-full`, `bg-elevated`, `border-surface-border`, `absolute bottom-6 left-1/2 -translate-x-1/2`) and recorded it in `ui-context.md`.
- **Default sizes for pill/cylinder/hexagon**: used the brief's Open Questions #2 recommended table verbatim (pill 160×60, cylinder 100×120, hexagon 140×100) — no concrete reason found to deviate.
- **`DEFAULT_NODE_COLOR`-only, no full palette**: followed Open Questions #3 as-is; added the paired `DEFAULT_NODE_TEXT_COLOR` beyond the brief's literal ask (see "Files changed" above) since the node renderer needs a text color and the pairing is already documented, not invented.
- **`ReactFlowProvider` placement**: wraps `CanvasFlow` inside `ClientSideSuspense` (not further out, e.g. around `RoomProvider`) — `screenToFlowPosition` is only needed once React Flow itself has mounted, and keeping the provider scoped tightly to the component that uses it avoids widening its scope unnecessarily.
- **Node-ID collision mitigation (Open Questions #6)**: implemented the brief's suggested mitigation — appended a short random suffix to the shape+timestamp+counter recipe — rather than the spec's literal 3-component recipe as-is. Cheap to add, closes a real (if low-probability) cross-client collision gap, and the brief explicitly left this as the Senior Developer's call.
- **`ShapePanel` outside the Liveblocks/Suspense tree**: renders unconditionally (even during canvas loading/connection-error states) since it has no dependency on room state. A drag started before the canvas finishes loading is inert (no `onDrop` handler mounted yet to receive it) — not a defect, just an unexercised edge case the spec's acceptance criteria don't cover.
- **`CanvasNode` has no `"use client"`**: it's a plain function component with no hooks/interactivity; RSC-by-default per `code-standards.md`. It's still only ever rendered as part of `canvas.tsx`'s client tree.

### Test coverage added

- `lib/canvas-shapes.test.ts` — 12 tests: default-size table shape/rules, drag-payload serialize/parse round-trip for all 6 shapes, payload rejection (empty string, malformed JSON, non-object, unknown shape, non-numeric/non-positive size), node-ID uniqueness/shape-prefix, `createDroppedNode`'s full output shape and per-call uniqueness.
- `components/editor/canvas-node.test.tsx` — 3 tests: label rendering, empty-label placeholder, fill/text color application.
- `components/editor/shape-panel.test.tsx` — 2 tests: one draggable button per shape; exact `dataTransfer` payload set on `dragstart` for every shape.
- `components/editor/canvas.test.tsx` — extended with 6 new tests (23 total in the file now) covering: shape panel renders within the canvas, `nodeTypes` registers `CANVAS_NODE_TYPE` only, `dragover` behavior (accept/ignore based on MIME type), `drop` creates exactly one node via `onNodesChange` with the correct position/shape/size/color/type, and malformed drop payloads add nothing.
- Commands run: `npx tsc --noEmit` (pass, no errors), `npx eslint .` (pass, 0 errors — 1 pre-existing unrelated warning in `.agents/skills/...`), `npx vitest run` (159/159 passed across 24 files, up from 136/21 after spec 11), `npx next build` (pass, Turbopack build succeeded, all routes compiled).

### Known limitations / deferrals

- Per the brief's Out-of-scope callouts: no shape-specific SVG rendering (every shape still renders as the same bordered rectangle), no color picker/`NODE_COLORS` palette, no connection-handle hover behavior, no edge creation/editing, no node editing after creation (label stays empty forever until a later spec adds editing), no `<Controls>` panel, no canvas snapshot persistence, no cursors/presence/AI UI. All confirmed untouched by this pass.
- No live/manual browser verification of drag-and-drop was performed (no interactive browser session available in this pipeline) — verified via unit tests against the real `@xyflow/system`/`@liveblocks/react-flow` type contracts and a production build, consistent with how spec 11 handled the same constraint. Recommended as a human smoke test alongside spec 11's still-open two-tab room-connection follow-up.

## QA Report

_(pending)_

## Product Owner Review

_(pending)_
