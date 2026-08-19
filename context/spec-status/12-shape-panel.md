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

**Overall verdict: PASS**

### Mechanical gate

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass — no errors |
| `npx eslint .` | Pass — 0 errors, 1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/.../__root.tsx` (unrelated to this spec, not touched) |
| `npx vitest run` | Pass — 159/159 tests across 24 files |
| `npx next build` | Pass — Turbopack build succeeds, all routes compile |

All figures independently reproduced; they match the Dev Notes claims exactly.

### Acceptance criteria checklist

1. Floating pill-shaped toolbar at bottom-center with 6 draggable icon buttons (rectangle, diamond, circle, pill, cylinder, hexagon) — Pass. `components/editor/shape-panel.tsx` renders `CANVAS_SHAPES.map(...)` (order: rectangle, diamond, circle, pill, cylinder, hexagon, matching the spec's literal list) as `Button` elements with `draggable`, positioned `absolute bottom-6 left-1/2 -translate-x-1/2` inside a `rounded-full` container. Confirmed by `shape-panel.test.tsx` (one button per shape, all draggable).
2. `dragstart` sets a `dataTransfer` payload with shape name plus default width/height, matching the spec's sizing rules — Pass. `lib/canvas-shapes.ts`'s `SHAPE_DEFAULT_SIZES`: rectangle 160x80 (wider than tall), circle 80x80 (square), diamond 160x160 (larger than the others, room for a label). Verified `serializeShapeDragPayload`/`ShapeButton`'s `handleDragStart` sets `CANVAS_DRAG_MIME_TYPE` with the JSON payload; round-trip and per-shape-payload tests pass in both `canvas-shapes.test.ts` and `shape-panel.test.tsx`.
3. Canvas wrapper handles `dragover` (preventing default) and `drop` — Pass. `handleDragOver`/`handleDrop` are passed directly as `onDragOver`/`onDrop` props on `<ReactFlow>` in `canvas.tsx`. Independently verified against the real `@xyflow/react` source (`node_modules/@xyflow/react/dist/esm/index.mjs`) that unrecognized props are spread onto the actual `react-flow__wrapper` div — a genuine, not assumed, passthrough.
4. On drop: reads payload, converts screen-to-canvas coords via real `screenToFlowPosition()`, creates node with empty label, default color, dragged shape and size — Pass. `handleDrop` calls `screenToFlowPosition({x: event.clientX, y: event.clientY})` and passes the returned (converted) position into `createDroppedNode`, not the raw client coordinates. Confirmed by `canvas.test.tsx`'s drop test, which mocks `screenToFlowPositionMock` to return a value distinct from the input client coordinates and asserts the created node's position equals the conversion's output, not the raw input.
5. Node ID generated from shape name, timestamp, and counter — Pass (and strengthened). `generateNodeId` produces a shape-timestamp-counter-randomsuffix string, a superset of the literal recipe plus a random suffix per the brief's Open Questions #6 recommendation to close the cross-client collision gap. Uniqueness tested across 50 calls.
6. New node has `type: CANVAS_NODE_TYPE` and is added into the Liveblocks-synced node list, visible to other room participants — Pass, and this is the one criterion with genuine runtime risk that I verified beyond static typing. `handleDrop` calls `onNodesChange([{ type: "add", item: newNode }])`. I read `@xyflow/system`'s real `NodeAddChange` type and confirmed the Dev's object literal matches it exactly. I then read `@liveblocks/react-flow`'s actual unminified implementation (`node_modules/@liveblocks/react-flow/dist/lib/flow.js`)'s `applyNodeChanges` function directly: it has a real `case "add":` branch that sets the new node into the room's LiveMap, i.e. the change is genuinely handled at runtime, not just type-compatible with mocks.
7. Custom node renderer registered for `CANVAS_NODE_TYPE` via `nodeTypes`, rendering every shape as a bordered rectangle with centered label — Pass. `canvas.tsx` registers a module-level, referentially stable `nodeTypes` map. `CanvasNode` never branches on `data.shape` — confirmed by direct read: it renders identically for all shapes.
8. No edges/CanvasEdgeData/CANVAS_EDGE_TYPE behavior touched — Pass. The only edge-related diff lines are doc comments confirming edges are untouched and pre-existing `edges`/`onEdgesChange` plumbing from spec 11 now explicitly generic-typed, with no behavioral change; `edgeTypes` is still not registered.
9. Build/typecheck/lint pass — Pass, reproduced directly, matching Dev Notes' claims exactly.

All 9 acceptance criteria pass.

### Architecture invariants (context/architecture-context.md)

- Invariant 1 (no long-running AI work in request handlers): N/A — no request handlers touched.
- Invariant 2 (metadata vs. blob storage separation): N/A — no persistence code added; nodes only exist in the live Liveblocks room session.
- Invariant 3 (auth/ownership enforced at every mutation boundary): N/A directly (no new auth boundary added), but the node-add mutation still routes through the same Liveblocks room connection spec 10's `/api/liveblocks-auth` already gates — unchanged from spec 11, not weakened.
- Invariant 4 (client components only where needed): `canvas-node.tsx` correctly has no `"use client"` (no hooks/interactivity — RSC-eligible, still bundled transitively via `canvas.tsx`'s client tree) — confirmed by reading the file. `shape-panel.tsx` correctly has `"use client"` (drag event handlers need it). `canvas.tsx` was already `"use client"` from spec 11. No unnecessary client boundaries introduced.
- Invariant 5 (canvas schema consistency): `createDroppedNode`'s output (label/color/shape) matches the schema `types/canvas.ts` already pinned in spec 11 — no divergent or ad hoc fields added.

No invariant violations found.

### Standards compliance (context/code-standards.md)

- No `any` usage anywhere in the new/changed files — confirmed via targeted grep across `lib/canvas-shapes.ts`, `components/editor/canvas-node.tsx`, `components/editor/shape-panel.tsx`, `components/editor/canvas.tsx`, `types/canvas.ts` plus a clean `tsc --noEmit`.
- No raw Tailwind color classes (zinc-/slate-) or hardcoded hex values outside the two documented constants — confirmed via grep across the full diff; the only hex-literal matches are `DEFAULT_NODE_COLOR = "#1F1F1F"` and `DEFAULT_NODE_TEXT_COLOR = "#EDEDED"` in `types/canvas.ts`, both directly traceable to `ui-context.md`'s documented default ("Default node color: #1F1F1F with #EDEDED text"). This is the same "documented data value" precedent as spec 10's `CURSOR_COLORS`, and is a reasonable, justified addition even though the brief's literal text only asked for the fill-color constant — the paired text color is necessary for the node's label to actually be legible, and nothing in the brief's Out-of-scope callouts prohibits it.
- `components/ui/*` untouched — confirmed via `git diff main...spec/12-shape-panel --stat -- components/ui/`, empty output.
- Test files correctly co-located and named (`lib/canvas-shapes.test.ts`, `components/editor/canvas-node.test.tsx`, `components/editor/shape-panel.test.tsx`, extended `components/editor/canvas.test.tsx`), `@vitest-environment jsdom` docblocks present where DOM rendering is needed, third-party SDKs (`@xyflow/react`, `@liveblocks/react-flow`, `@liveblocks/react/suspense`) mocked via `vi.mock`/`vi.hoisted` rather than exercised for real — consistent with the Testing section's conventions and spec 11's precedent.
- `icon-lg` Button size variant and the six lucide-react icons (Square/Diamond/Circle/Pill/Cylinder/Hexagon) genuinely exist in the installed packages — confirmed by reading `components/ui/button.tsx` directly (not assumed) and by the clean tsc/build (an unresolvable icon import would fail both).

### Error handling

The main failure mode in this spec's scope is malformed or untrusted drop input (a dataTransfer payload that isn't a well-formed shape-drag payload — e.g. a file drag, a corrupted or foreign payload, or an unrecognized shape name). `parseShapeDragPayload` validates JSON parse success, object shape, NodeShape membership, and numeric/positive width/height, returning null for anything untrusted; `handleDrop` treats a null parse as a silent no-op (no `onNodesChange` call, no thrown error) rather than crashing — correctly tested in both `canvas-shapes.test.ts` (6 rejection cases) and `canvas.test.tsx` ("does not add a node when the dropped payload is missing or malformed"). `handleDragOver` similarly only claims the drop target for recognized payloads (checked via dataTransfer.types, not getData(), correctly noting in a comment that some browsers restrict reading actual data outside the drop event), so non-shape drags (e.g. browser file drops) aren't hijacked. This is proportionate to the spec's scope — no server-side or auth failure modes apply here since nothing new touches a request handler or a persistence boundary.

### Housekeeping

`context/progress-tracker.md` was updated accurately: Current Phase/Goal moved to "Phase 12: Shape Panel — implemented, awaiting QA", the "In Progress" entry lists the actual files added/changed and their real responsibilities (matches the code, not just Dev Notes prose), and "Completed"/"Next Up" are consistent with the rest of the pipeline. `context/ui-context.md` was also updated with a new "Floating Shape Panel" subsection documenting the pill-toolbar convention this spec introduces, per the "Keeping Docs In Sync" workflow rule — read directly and confirmed it accurately describes what was actually built (rounded-full, bg-elevated/border-surface-border, positioning, no MiniMap overlap).

### Other verification performed

- Independently re-derived (not trusted from Dev Notes) that `<ReactFlow>`'s own `Wrapper` component only auto-provides `ReactFlowProvider`/`StoreContext` to its own JSX children, gated on `useContext(StoreContext)` (`node_modules/@xyflow/react/dist/esm/index.mjs`, the `Wrapper`/`ReactFlowProvider` functions) — confirming the brief's Open Questions #4 concern was real, not overstated. Then confirmed the actual fix in `canvas.tsx`: `<ReactFlowProvider><CanvasFlow /></ReactFlowProvider>` wraps `CanvasFlow` from outside, and `CanvasFlow` is the component that calls `useReactFlow()` internally — this is the correct placement (an ancestor provider, not a sibling or a provider wrapping only unrelated JSX), so `useReactFlow()` resolves correctly at runtime rather than throwing a "no provider" error.
- Independently read `@liveblocks/react-flow`'s actual unminified `lib/flow.js` and `lib/shared.js` source (not just its `.d.ts` type declarations) to confirm the `type: "add"` NodeChange is functionally wired into the Liveblocks LiveMap via `useMutation`/`applyNodeChanges`, not just type-compatible — this was the specific "tests with mocked onNodesChange could miss" risk called out in the QA instructions, and it checks out against the real library code.
- Confirmed via `git diff main...spec/12-shape-panel --stat` that the full changeset matches Dev Notes' claimed file list exactly (`lib/canvas-shapes.ts` + test, `components/editor/canvas-node.tsx` + test, `components/editor/shape-panel.tsx` + test, `components/editor/canvas.tsx` + test, `types/canvas.ts`, `context/ui-context.md`, `context/progress-tracker.md`, this spec-status file) — no unexplained scope creep, and `components/ui/*` confirmed untouched.
- Per this task's instructions and consistent with specs 08/10/11's QA treatment: interactive drag-and-drop cannot be visually verified in a browser in this environment. Given the genuine runtime-correctness risk this spec carries (provider placement, change-object shape), I went further than prior specs and independently verified both concerns against the real installed library source (not .d.ts declarations alone, and not Dev Notes' claims) rather than relying solely on the passing unit-test suite with its mocked @xyflow/react and @liveblocks/react-flow. Both check out. The absence of a live two-browser-tab smoke test remains a noted limitation, not a defect — recommended as a human follow-up alongside spec 11's still-open two-tab room-connection check.

### Issues found

None. No [Bug -> Dev] or [Spec gap -> Analyst] items to log.

### Handoff

QA passed — ready for Product Owner review.

## Product Owner Review

_(pending)_

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Success criteria fit

Judged against `project-overview.md`'s Success Criteria list:

- This spec is the first place a user can actually put content on the shared canvas (drag a shape → a node appears, synced through Liveblocks to other participants). It is a direct, concrete step toward **Success Criterion 2** ("Multiple users can collaborate in the same canvas simultaneously") — spec 11 wired the room/sync mechanism with an empty canvas; this spec is the first thing a second user in that room would actually *see* change. Consistent with how specs 08-11 were each judged as building blocks toward a specific criterion rather than standalone end-to-end features: this spec doesn't claim to satisfy Criterion 2 on its own (no live cursors/presence yet — specs 19/24), only to add the node-creation primitive that criterion depends on.
- It also lays necessary groundwork for **Criterion 4** ("AI can generate an architecture into the shared room from a prompt") and **Criterion 5** ("the graph can be converted into a persisted Markdown spec") — both eventually need a real `CANVAS_NODE_TYPE` renderer and a node-creation code path to exist; this spec is the first to establish both, even though AI generation and spec conversion are untouched here.
- No claim is made against Criteria 1, 3, or 6 — correctly, nothing in this spec touches project creation, starter templates, or metadata/artifact storage.

### Scope check against project-overview.md and the spec's own limits

- **`project-overview.md`'s Out of Scope wall** (billing, permission tiers, versioned spec history, production object storage migration, mobile apps) — untouched; nothing in the diff comes near any of these.
- **This spec's own explicit scope limits**, checked directly against the diff (`git diff main..spec/12-shape-panel --stat` and the `types/canvas.ts`/`canvas.tsx` diff content read in full):
  - No shape-specific SVG visuals — confirmed; `CanvasNode` renders the same bordered rectangle for every `data.shape` value, no branching.
  - No edges touched — confirmed; the only edge-related diff lines are a generic-type annotation on already-existing `edges`/`onEdgesChange` plumbing from spec 11, no behavioral change, `edgeTypes` still unregistered.
  - No node editing after creation — confirmed; nodes are created with a permanently empty label (rendered as an "Untitled" placeholder), no rename/resize/delete UI added.
  - No `<Controls>` panel — confirmed absent from `CanvasFlow`'s JSX.
  - No persistence — confirmed; `useLiveblocksFlow` still starts from `{ initial: [] }`, no blob/fetch/localStorage calls anywhere in the diff. Node creation only mutates the live in-room Liveblocks state, not any snapshot.
  - No AI behavior — confirmed, nothing in the diff touches prompts, generation, or `broadcastEvent`/chat.
- Diff surface matches Dev Notes/QA's claimed file list exactly (`lib/canvas-shapes.ts`+test, `components/editor/canvas-node.tsx`+test, `components/editor/shape-panel.tsx`+test, `components/editor/canvas.tsx`+test, `types/canvas.ts`, `context/ui-context.md`, `context/progress-tracker.md`, this status file — 12 files, 763/-37 lines). `components/ui/*`, `prisma/schema.prisma`, and all API routes are diff-empty. No unexplained scope creep.

### `DEFAULT_NODE_TEXT_COLOR` deviation — sanity check

Confirmed this holds up as a reasonable judgment call, not scope creep: it's not an invented style choice, it's the other half of a value pair `ui-context.md` already documents in one line ("Default node color: #1F1F1F with #EDEDED text"), and it's needed for the very first custom node renderer's label to actually be legible — without it, this spec's own acceptance criterion 7 ("renders every shape as a bordered rectangle with the label centered") would ship with unreadable text. The `NODE_COLORS` 8-color palette and any color-picker UI are correctly still absent — the deviation is scoped to exactly the one paired value needed, nothing more. Treating it the same way spec 10's `CURSOR_COLORS` constant was treated is the right precedent to apply.

### Rough edges — acceptable at this stage, one flagged for human smoke test

- **No live browser verification of drag-and-drop was performed** — expected and unavoidable in this pipeline environment (no interactive browser session), and QA went beyond the unit-test suite's mocked libraries to independently read the real `@xyflow/react` and `@liveblocks/react-flow` source to confirm provider placement and that the `"add"` NodeChange genuinely writes into the room's LiveMap, not just type-compatible with mocks. That closes most of the runtime-correctness risk at the code level, but it is not a substitute for actually seeing a shape land on the canvas. **Flagging this explicitly as a human smoke test before considering this spec fully done**, mirroring spec 11's still-open two-tab room-connection smoke test: drag each of the 6 shapes (rectangle, diamond, circle, pill, cylinder, hexagon) onto the canvas, confirm a bordered-rectangle node appears at roughly the drop position for each, and confirm the node is visible in a second browser tab open on the same project (per spec 11's now-established two-tab verification pattern) to confirm the Liveblocks sync is real end-to-end, not just at the code level.
- Node labels stay permanently empty (no editing UI yet) — explicitly expected per this spec's scope (renaming is a later spec), not a defect.
- Neither rough edge blocks a later spec from building correctly on top of this one: `CanvasNode`, `CANVAS_NODE_TYPE`, and the node-creation path are stable and test-guarded for the shape-specific-visuals and node-editing specs that come next.

### progress-tracker.md accuracy

Read in full. The "In Progress" entry for spec 12 accurately lists the actual files added/changed (`lib/canvas-shapes.ts`, `canvas-node.tsx`, `shape-panel.tsx`, `types/canvas.ts`, `canvas.tsx`, `ui-context.md`) and their real responsibilities, matching what the diff actually contains — not an aspirational description. It correctly notes the mechanical check figures (159/159 tests, tsc/eslint/build all passing), matching both Dev Notes and QA's independently-reproduced numbers. No corrections needed before promotion to "Completed."

### PR creation

- `gh auth status` confirms an authenticated session (`ravindrakamble`, `repo` scope) — no blocker.
- `git branch --show-current` confirms `spec/12-shape-panel` is checked out with one commit ahead of `main` (`f0cd3f2`), so there is real work to hand off.
- Proceeding to push the branch and open a PR against `main` (not merging).
