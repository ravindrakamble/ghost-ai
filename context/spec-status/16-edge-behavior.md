# Spec 16 — Edge Behavior

## Analyst Brief

### Scope statement

This spec replaces React Flow's default edge rendering with a custom canvas edge (right-angle/smooth-step routing, dimmed-at-rest/brightened-on-hover-or-select, an easier-to-hit interaction target, and an arrowhead marker) and adds visible-on-hover connection handles to every node on all four sides so edges can be drawn between any two handles; it also adds inline, collaboratively-synced edge label editing (double-click to edit, pill-badge display when saved, faint hint when empty). It does not change how nodes are created, the shape panel, node shape/resize/color behavior, or anything about node rendering beyond the required connection handles.

### Concrete deliverables

- `components/editor/canvas-node.tsx` (modified) — add four `Handle` components (`@xyflow/react`), one per side (`Position.Top`/`Right`/`Bottom`/`Left`), styled as small white dots with a dark border, hidden by default and faded in on node hover (e.g. a `group`/`group-hover` opacity transition on the node's outer wrapper). This is the one explicitly permitted exception to this spec's "don't redesign the node renderer" Scope Limit — no other change to `ShapeVisual`, `NodeResizer`, the label-editing textarea, or the color toolbar.
- New file, e.g. `components/editor/canvas-edge.tsx` — the custom edge renderer (naming precedent: same "component name shadows the type-alias name" pattern `canvas-node.tsx`'s `CanvasNode` already has against `types/canvas.ts`'s `CanvasNode` type, resolved in `canvas.tsx` via an import alias — the edge version will need the same treatment for `CanvasEdge`). Built on React Flow's `getSmoothStepPath` (right-angle routing with rounded corners — this is also what `ui-context.md`'s existing "Edge Style" section already describes, so this spec is the first to actually implement documentation that predates it, the same relationship spec 13 had to the pre-existing Node Shapes doc section), `BaseEdge`, and `EdgeLabelRenderer` positioned at the path's own returned midpoint coordinates (`labelX`/`labelY`) — never computed manually. Owns: dimmed/brightened stroke state (rest vs. hover vs. `selected`), a wider invisible/transparent hit-path stroked alongside the thin visible one (the standard React Flow technique for "easier to click without increasing visible thickness"), the arrow marker, and double-click-to-edit label state (mirroring `canvas-node.tsx`'s existing `isEditing` local-state pattern) with `nodrag nopan` on the label's interactive wrapper.
- `components/editor/canvas.tsx` (modified) — registers `edgeTypes={{ [CANVAS_EDGE_TYPE]: CanvasEdge }}` (mirroring the existing `CANVAS_NODE_TYPES` module-scope-stable-reference pattern) and sets `defaultEdgeOptions` on `<ReactFlow>` (`type: CANVAS_EDGE_TYPE`, arrow `markerEnd`) so edges created via `onConnect` (dragging from a handle) use the custom type and style from creation, per the spec's step 2 ("make new connections use the custom canvas edge renderer"). `onConnect`/`onEdgesChange` from `useLiveblocksFlow` are passed to `<ReactFlow>` largely as-is (they already exist in the current code, currently unused by any custom edge type). See Open Questions #1 for whether `CanvasFlow` also needs to provide a new edge-update context, mirroring `updateNodeData`/`CanvasNodeUpdateContext`.
- Likely new file, `hooks/use-update-canvas-edge.ts` (or an extension of the existing hook file) — see Open Questions #1. Flagged as "likely," not "confirmed," because the spec's own phrase — "update labels through the existing collaborative edge data flow" — is genuinely ambiguous about whether it means literally reuse something that exists today (nothing does; no code anywhere consumes `CanvasEdgeData` yet) or "reuse the same *kind* of sync mechanism/pattern" spec 14 established for nodes. This brief's recommendation is the latter reading.
- `types/canvas.ts` — likely unchanged (`CanvasEdgeData` already has an optional `label?: string` and `CANVAS_EDGE_TYPE` already exists, both from spec 11, never consumed until now). Possible additive-only change: a small edge-color/style constant (e.g. default stroke hex, dimmed/brightened variants) if Dev judges raw hex belongs in a typed constant rather than inline in `canvas-edge.tsx`, following the same precedent `NODE_COLORS` set in spec 15 for palette data.
- `context/ui-context.md` (modified) — the existing "Edge Style" section is currently aspirational/doc-only (smooth-step + arrow marker, described but not yet built); update it to reflect the real implementation once built (right-angle/smooth-step routing, dimmed/brightened states, wider hit target, handle styling/hover-fade convention, inline label editing convention), per "Keeping Docs In Sync."
- Test files, per `code-standards.md`'s Testing section: `components/editor/canvas-node.test.tsx` (gains handle-presence/hover-visibility coverage), a new `components/editor/canvas-edge.test.tsx` (label edit open/save/cancel, pill-badge vs. faint-hint rendering, `nodrag`/`nopan`, midpoint positioning via `EdgeLabelRenderer`), and — if a new edge-update hook is added — a new `hooks/use-update-canvas-edge.test.tsx` mirroring `use-update-canvas-node.test.tsx`.

### Acceptance criteria

Directly from the spec's own "Check When Done" list, expanded with the underlying implementation details from "Implementation" so Dev/QA can verify concretely:

1. Every node renders four connection handles (top, right, bottom, left) — small white dots with a dark border — hidden by default and visible only while hovering that node.
2. A connection can be dragged from any handle to any other handle (consistent with the canvas's existing `ConnectionMode.Loose`, already set in `canvas.tsx`).
3. New edges created via a handle-to-handle connection use the custom `CANVAS_EDGE_TYPE` renderer (not React Flow's default `bezier`/`straight`/`step` edge) and render with an arrowhead marker and a light, rounded-end stroke.
4. The custom edge renderer routes edges as clean right-angle/smooth-step paths (via `getSmoothStepPath`, not a hand-rolled routing algorithm).
5. Edges are visibly dimmed at rest and visibly brighter when hovered or `selected`.
6. Edges have an enlarged invisible/transparent hit area for hover/click, without any change to the visible line's stroke width.
7. Double-clicking an edge enters label-edit mode; the input grows with the label's text content.
8. The edge label is positioned using `EdgeLabelRenderer` and the path's own midpoint coordinates returned by `getSmoothStepPath` — not a manually computed midpoint.
9. The label saves on blur, `Enter`, or `Escape`.
10. A saved label renders as a small pill badge; an active (edit-mode) edge with no label shows a faint placeholder hint instead of nothing.
11. Clicking into or typing in the label input never starts a node drag or canvas pan (`nodrag`/`nopan` present and effective on the label's interactive elements).
12. Label edits are dispatched through the same kind of real, Liveblocks-synced update path (`onEdgesChange`) spec 14 established for node data — not a local-only React Flow store mutation and not a non-serializable callback embedded in edge `data`.
13. `npm run build`/`npx tsc --noEmit` pass without type errors; `npx eslint .` passes with no new errors.

### Dependencies

- Spec 11 (Base Canvas) — **complete**. Provides `CanvasEdgeData`/`CANVAS_EDGE_TYPE` in `types/canvas.ts` (defined, never consumed until now) and `useLiveblocksFlow`'s `onConnect`/`onEdgesChange`, already passed to `<ReactFlow>` in `canvas.tsx` but currently doing nothing beyond React Flow's default edge behavior.
- Spec 12 (Shape Panel) — **complete**. Provides `CanvasNode` (`components/editor/canvas-node.tsx`), the node renderer this spec adds handles to.
- Spec 13 (Node Shape) — **complete**. Provides `ShapeVisual`'s existing rest/selected border-token convention (`border-surface-border`/`border-brand`, `var(--border-default)`/`var(--accent-primary)`) — the edge renderer's own dimmed/brightened states should follow the same subtle-at-rest/brand-accent-when-active precedent for visual consistency, though the spec text doesn't literally require reusing the same token.
- Spec 14 (Node Editing) — **complete, direct dependency**. Provides the pattern this spec's edge-label editing and edge-data-sync should mirror: `hooks/use-update-canvas-node.ts`'s `CanvasNodeUpdateContext`, a leaf node/edge renderer dispatching a data update back through `CanvasFlow`'s real `onNodesChange`/`onEdgesChange` rather than a local-only store mutation or an embedded non-serializable callback. Also establishes the `nodrag`/`nopan` and double-click-to-edit conventions this spec reuses for edge labels.
- Spec 15 (Nodes Color Toolbar) — **complete**. No direct dependency, but confirms `canvas-node.tsx`'s current real structure (this brief's file references above are read directly from the post-spec-15 code, not from an older Dev Notes summary).
- `ui-context.md`'s existing "Edge Style" section — already documents smooth-step + arrow marker + thin stroke as the target design; this spec is what actually builds it.

All listed dependencies are complete per `progress-tracker.md`.

### Open questions

1. **Does edge label editing need its own update-dispatch mechanism (a new context/hook mirroring `useUpdateCanvasNode`), or can `onEdgesChange` be wired directly without one?** The spec's own text — "update labels through the existing collaborative edge data flow" — doesn't pin this down, and no edge-data-update mechanism exists in the codebase today (`CanvasEdgeData` has never been consumed by any component). The custom edge renderer (`canvas-edge.tsx`) will be a leaf component instantiated by React Flow's `edgeTypes`, with no direct access to `CanvasFlow`'s `onEdgesChange` — structurally the same problem spec 14's Analyst Brief (Open Questions #1) solved for node labels by introducing `CanvasNodeUpdateContext`. **Recommendation:** add a parallel, edge-scoped equivalent (e.g. `hooks/use-update-canvas-edge.ts`, provided by `CanvasFlow` alongside the existing node context) rather than trying to overload the existing node context with a second, differently-shaped data type and a different underlying `*Change` function. This is a recommendation, not a decision — flagged explicitly since the spec's own wording could be read either way, and it's the one point in this brief most likely to need Dev's judgment call, similar in spirit to spec 14's Open Questions #1.
2. **Should hovering an edge that's also selected show the same "brightened" state as hover-only, or a visually distinct third state?** The spec says "brighten edges when hovered or selected" without distinguishing the two. **Recommendation:** treat both as the same brightened visual state (simplest reading, matches the spec's own "or" phrasing) rather than inventing a three-tier system not asked for.
3. **Exact stroke widths/colors for rest vs. hover/selected, and the exact width of the enlarged invisible hit-path, aren't pinned** by the spec, `ui-context.md` (whose existing "Edge Style" section names a single default color, `#f8fafc`, with no dimmed/brightened variants or hit-path width), or `project-overview.md`. **Recommendation:** left as a concrete Dev-level styling choice, the same footing as spec 13's SVG shape coordinates and spec 14's `NODE_MIN_SIZE` number — document whatever values are chosen in `ui-context.md`'s Edge Style section afterward, per "Keeping Docs In Sync."
4. **Single vs. dual (stacked source+target) `Handle` per side, given `ConnectionMode.Loose` is already set.** The spec requires "connect from any handle to any other handle," and `canvas.tsx` already sets `connectionMode={ConnectionMode.Loose}` (from spec 11), which relaxes React Flow's normal source-must-connect-to-target rule. **Recommendation:** left to Dev to determine the minimal `Handle` configuration (e.g. one handle per side vs. two stacked source/target handles) that satisfies "any handle to any other handle" given Loose mode is already active — not a product-level decision, an implementation detail.
5. **Should the arrow marker's color track the edge's dimmed/brightened state, or stay fixed?** Not addressed by the spec text. **Recommendation:** have the marker follow the same color/opacity as the stroke it terminates, for visual consistency, but this is a minor styling recommendation, not a literal requirement.

### Out-of-scope callouts

- **Changing how nodes are created** — explicit Scope Limit ("don't change how nodes are created"). `lib/canvas-shapes.ts`'s `createDroppedNode`, drag/drop payload, and `canvas.tsx`'s `handleDrop`/`handleDragOver` stay untouched.
- **The shape panel** — explicit Scope Limit ("don't change the shape panel"). `components/editor/shape-panel.tsx` stays untouched.
- **Redesigning the node renderer beyond connection handles** — explicit Scope Limit. No changes to `ShapeVisual`, `NodeResizer`, node label editing, or the color toolbar (specs 13/14/15) beyond adding the four `Handle` elements and whatever hover-state wiring makes them fade in/out.
- **Edge deletion UI, multi-edge selection, or edge color customization (a per-edge color toolbar analogous to spec 15's node one)** — not mentioned anywhere in this spec's text; nothing here should introduce a UI affordance for choosing edge colors, only the rest/hover/selected states the spec describes.
- **AI-generated edges** — this spec is about user-drawn/edited edges via the canvas UI; AI Architecture Generation writing edges into the room is a separate, later feature area per `architecture-context.md`'s AI Generation Model.
- **Billing, enterprise permission tiers, versioned spec history, production object storage migration, mobile apps** — `project-overview.md`'s Out of Scope wall; nothing in this spec's text comes near any of these.

## Handoff

Brief ready for Senior Developer at `context/spec-status/16-edge-behavior.md`.

## Dev Notes

### Files added

- `hooks/use-update-canvas-edge.ts` — `CanvasEdgeUpdateContext`/`useUpdateCanvasEdge()`, the edge-scoped mirror of spec 14's `hooks/use-update-canvas-node.ts`. Resolves Open Questions #1: yes, a new context/hook was needed — `CanvasEdge` is a leaf `edgeTypes` component with no access to `CanvasFlow`'s `onEdgesChange`, structurally identical to the problem spec 14 solved for nodes.
- `components/editor/canvas-edge.tsx` — `CanvasEdge`, the custom edge renderer registered for `CANVAS_EDGE_TYPE`. Built on `getSmoothStepPath`/`BaseEdge`/`EdgeLabelRenderer` per the brief. Wraps everything in one `<g onMouseEnter/onMouseLeave/onDoubleClick>` — `BaseEdge`'s own `interactionWidth` (left at its 20px default) already renders the wider invisible hit-path the brief calls for, and since mouse events bubble from that child path up to the wrapping `<g>`, local hover state didn't need a second hand-rolled invisible path.
- `hooks/use-update-canvas-edge.test.tsx` — mirrors `use-update-canvas-node.test.tsx` (null outside provider, dispatches through the provided function).
- `components/editor/canvas-edge.test.tsx` — routing (smooth-step path, not straight), rest/hover/selected stroke color, fixed stroke width across states, pill-badge vs. nothing-at-rest vs. faint-placeholder-while-editing, open/dispatch/close (blur/Enter/Escape) label editing, `nodrag`/`nopan`, label positioned at `getSmoothStepPath`'s own `labelX`/`labelY`. `EdgeLabelRenderer` is mocked to portal into `document.body` (via `createPortal`, not just returning `children` inline) — `CanvasEdge`'s own root is an SVG `<g>`, and an `<input>`/`<div>` rendered directly inside SVG (rather than portaled out, as the real `EdgeLabelRenderer` does once a real `<ReactFlow>` canvas has mounted) gets created in the SVG namespace and stops behaving like a real `HTMLInputElement` (no `value` setter) — hit this exact failure first, documented in the test file's own comment.

### Files modified

- `components/editor/canvas-node.tsx` — added four `Handle` components (one per `Position`), wrapped with `ShapeVisual` in a new `group relative` `<div>` so `group-hover:opacity-100` can fade them in on node hover without touching `ShapeVisual` itself (the brief's one explicitly permitted exception). `NodeResizer`/`NodeColorToolbar` stay outside that wrapper, byte-for-byte unchanged otherwise. Each handle is `type="source"` (single handle per side, not a stacked source+target pair) — confirmed by reading `@xyflow/system`'s `isValidHandle`: under `ConnectionMode.Loose` (already set in `canvas.tsx` since spec 11), the only validity check is that the two endpoints aren't the exact same handle, regardless of `type`, and `isConnectableStart`/`isConnectableEnd` both default to `true` regardless of `type` too — so a single handle per side already supports "any handle to any other handle."
- `components/editor/canvas.tsx` — registers `edgeTypes={{ [CANVAS_EDGE_TYPE]: CanvasEdge }}` and `defaultEdgeOptions` (`type: CANVAS_EDGE_TYPE`, `markerEnd: { type: MarkerType.ArrowClosed, color: "var(--text-secondary)" }`) on `<ReactFlow>`; adds `updateEdgeData` (mirrors `updateNodeData`'s `onNodesChange`-based pattern, but for `onEdgesChange`) and provides it via `CanvasEdgeUpdateContext.Provider`, nested inside the existing `CanvasNodeUpdateContext.Provider`. No changes to drag/drop/node-creation logic.
- `components/editor/canvas-node.test.tsx` — added a `getShapeRoot(container)` helper (existing tests that read `container.firstElementChild` to reach `ShapeVisual`'s own root now need to go one level deeper, since that's now the new hover-group wrapper) and a `connection handles` describe block (4 handles present with hover-fade classes, distinct `top`/`right`/`bottom`/`left` ids, wrapper contains both `ShapeVisual` and the handles).
- `components/editor/canvas.test.tsx` — extended the existing `@xyflow/react` mock with `Position`/`MarkerType` stubs (both are now dereferenced at `canvas-node.tsx`/`canvas.tsx` module scope — `CONNECTION_HANDLES`/`DEFAULT_EDGE_OPTIONS` — so merely importing `Canvas` now needs them even though `CanvasNode`/`CanvasEdge` never actually render in this test's mocked `ReactFlow`); added one test confirming `edgeTypes`/`defaultEdgeOptions` are wired through correctly.
- `context/ui-context.md` — Edge Style section rewritten from aspirational/doc-only to describe the real implementation (routing, dimmed/brightened tokens, hit-area technique, marker, label-editing convention); Connection Handles section gained an implementation paragraph (styling, hover-group mechanism, single-handle-per-side rationale).

### Skills used

- `liveblocks-best-practices` (`multiplayer-react-flow` reference) — confirmed the `useLiveblocksFlow`/`onEdgesChange`/`onConnect` shape already in use since spec 11 needed no changes; edge creation and edge-data sync both go through mechanisms this spec already assumed correctly.

### Key decisions (Open Questions)

1. **New edge-update context/hook — yes, built.** See `hooks/use-update-canvas-edge.ts` above.
2. **Hover and selected collapse into one "bright" state.** `isBright = Boolean(selected) || isHovered`, both drive the same `var(--accent-primary)` stroke — no third tri-state visual.
3. **Stroke tokens/hit-path width.** Reused existing tokens rather than adding new ones to `types/canvas.ts`: rest `var(--border-default)`, bright `var(--accent-primary)` — the same rest/selected pairing `ShapeVisual` already established for node borders (per this spec's own Dependencies note on spec 13). Stroke width is fixed (`1.5`) across rest/hover/selected — only color changes, mirroring how `ShapeVisual`'s border color (not thickness) toggles on `selected`. Hit-path width left at `BaseEdge`'s own 20px default (not overridden) — no requirement pinned an exact number, and 20px is already a reasonable, easy-to-click target. `types/canvas.ts` was left unmodified — no new color constant was needed since everything routes through existing CSS custom properties, referenced directly the same way `ShapeVisual`'s SVG `stroke` already does.
4. **Single handle per side, `type="source"`.** Verified via `@xyflow/system` source (see Files modified above) rather than assumed — Loose mode plus default `isConnectableStart`/`isConnectableEnd` (`true` regardless of `type`) makes a stacked source+target pair unnecessary.
5. **Marker color: fixed, not hover/selected-tracking.** `markerEnd` is resolved by React Flow into a static per-edge SVG `<marker>` def from the edge's own persisted `data.markerEnd`/`defaultEdgeOptions`, not recomputed per render — tracking `CanvasEdge`'s local hover state would require bypassing React Flow's own marker system entirely (a hand-rolled `<marker>`). Judged not worth the complexity for a recommendation the spec text itself calls minor. Fixed to `var(--text-secondary)`, a neutral tone visible against the dark canvas in both rest and bright edge states.

### Acceptance criterion 10 interpretation

The Scope statement's "faint hint when empty" and acceptance criterion 10's more precise "an active (edit-mode) edge with no label shows a faint placeholder hint instead of nothing" were read together as: the faint hint (an `<input placeholder="Add label…">`) only appears while actively editing an empty label. An edge at rest with no label renders no label content at all (no pill, no persistent hint) — avoids cluttering the canvas with a hint on every unlabeled edge, and matches criterion 10's own "instead of nothing" phrasing, which implies "nothing" is the correct rest-state baseline.

### Test coverage

- `hooks/use-update-canvas-edge.test.tsx` (new, 2 tests).
- `components/editor/canvas-edge.test.tsx` (new, 19 tests: routing, rest/hover/selected color, fixed stroke width across states, pill/nothing/faint-hint rendering, label-editing open/dispatch/close via double-click/blur/Enter/Escape, `nodrag`/`nopan`, midpoint positioning).
- `components/editor/canvas-node.test.tsx` (extended, 3 new tests: 4 handles with hover-fade classes present, distinct per-side ids, shared hover-group wrapper).
- `components/editor/canvas.test.tsx` (extended, 1 new test: `edgeTypes`/`defaultEdgeOptions` wiring; existing `@xyflow/react` mock extended with `Position`/`MarkerType` stubs to keep the file's other 10 pre-existing tests passing).
- 236/236 tests passing across 29 files (up from 211/27 at the end of spec 15).
- `npx tsc --noEmit` — pass, no errors.
- `npx eslint .` — pass, 0 errors (1 pre-existing warning in an unrelated `.agents/skills/` template file, not touched by this spec).
- `npx vitest run` — pass, 236/236.
- `npx next build` — pass, all routes compile.

### Known limitations / deliberate deferrals

- No live browser/multiplayer verification possible in this pipeline (consistent with specs 11–15) — recommended human smoke test: drag a connection between two nodes' handles from any side to any side, confirm the custom smooth-step edge with arrowhead renders and syncs live across two tabs; double-click an edge to add/edit a label and confirm it syncs live; hover an edge to confirm the brighten transition; confirm resize/select interactions on nodes still work unaffected by the new hover-group wrapper.
- Per the brief's Out-of-scope callouts, no edge deletion UI, no multi-edge selection, no per-edge color toolbar, and no AI-generated edges were added — none were in scope for this spec.
- Marker color is fixed rather than hover/selected-tracking, per the Open Questions #5 decision above — flagged as a deliberate, documented trade-off, not an oversight.
