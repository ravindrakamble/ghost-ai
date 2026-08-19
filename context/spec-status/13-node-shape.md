# Spec 13 — Node Shape

## Analyst Brief

### Scope statement

This spec replaces `CanvasNode`'s placeholder bordered-rectangle rendering with shape-correct visuals for all 6 supported node shapes (CSS for rectangle/pill/circle, inline SVG for diamond/hexagon/cylinder, scaling with node size, subtle-at-rest/brighter-when-selected borders), and adds a cursor-attached ghost drag preview to the shape panel that mirrors the shape/size being dragged. It does not touch node creation, drop handling, node-ID generation, resize, label editing, or the shape panel's own layout — those stay exactly as spec 12 left them.

### Concrete deliverables

- `components/editor/canvas-node.tsx` (modified) — branch rendering on `data.shape`:
  - `rectangle`, `pill`, `circle` render as a plain styled `<div>` (CSS only): `rounded-xl` for rectangle, `rounded-full` for pill and circle (circle's roundness plus its 1:1 default size, from `SHAPE_DEFAULT_SIZES`, is what makes it read as a circle rather than a pill — no separate circle-specific CSS trick needed).
  - `diamond`, `hexagon`, `cylinder` render as an inline `<svg>` with `width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"` so the shape stretches to fill whatever box React Flow gives the node (driven by the node's `width`/`height`, which `createDroppedNode` already sets as top-level `Node` fields, not `data` fields) — this is what satisfies "SVG shapes should scale with node size" without any manual width/height math in the component.
  - Border/stroke: subtle at rest, visibly brighter when `selected` (React Flow's `NodeProps.selected`, already available with zero new wiring — no existing prop in `canvas.tsx`/`CanvasFlow` disables selection).
  - Label centering and the empty-label "Untitled" placeholder behavior (from spec 12) carry over unchanged for every shape.
- `components/editor/shape-visual.tsx` (new, exact name at Dev's discretion) — recommended: factor the actual shape geometry (the CSS-class-per-shape logic and the 3 SVG `<path>`/`<polygon>` definitions) into one shared, non-node-specific component/helper, so `canvas-node.tsx` and the new drag-preview element in `shape-panel.tsx` render the *same* shape geometry rather than two independently-maintained copies. Not a hard requirement of the spec text, but directly serves the spec's own "use the same shape type and default size that will be used on drop" requirement for the preview — see Open Questions #3.
- `components/editor/shape-panel.tsx` (modified) — add the ghost drag preview:
  - On `dragstart`, call `event.dataTransfer.setDragImage(element, xOffset, yOffset)` pointing at a shape-correct preview element, sized per that shape's `SHAPE_DEFAULT_SIZES` entry (already in `lib/canvas-shapes.ts`, unchanged).
  - No manual cursor-position tracking (`mousemove`/`drag` listeners) — see Open Questions #1.
- `lib/canvas-shapes.ts` — expected to stay as-is; already exports everything this spec's drag-preview sizing needs (`SHAPE_DEFAULT_SIZES`). No changes to `createDroppedNode`, ID generation, or the drag-payload serialize/parse functions (scope limit: "don't change how dropped nodes are created").
- `types/canvas.ts` — expected to stay as-is. `NodeShape`, `CanvasNodeData`, `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR` (spec 12) already provide everything this spec's rendering needs. The full 8-color `NODE_COLORS` palette is still not needed (no color picker in this spec) — see Out-of-scope callouts.
- `context/ui-context.md` (likely modified) — this spec is the first to make concrete, previously-undocumented decisions (SVG geometry for diamond/hexagon/cylonder, the selected-vs-rest border color pairing). Per "Keeping Docs In Sync," whatever Dev actually implements should be recorded here, similar to spec 12 adding the "Floating Shape Panel" subsection.

### Acceptance criteria

1. Every one of the 6 shapes (`rectangle`, `diamond`, `circle`, `pill`, `cylinder`, `hexagon`) renders visually distinctly on the canvas via `CanvasNode`, driven by `data.shape` — not identically, as spec 12 left them.
2. `rectangle`, `pill`, and `circle` are implemented with CSS styling only (border-radius/box, no SVG).
3. `diamond`, `hexagon`, and `cylinder` are implemented as inline SVG, and visibly resize when the node's width/height changes (i.e., not a fixed-pixel SVG that clips or floats inside a differently-sized node box).
4. Node borders are visibly subtle at rest and visibly brighter when the node is selected, for every shape (CSS-styled shapes via `border-color`, SVG shapes via `stroke`).
5. Starting a drag from the shape panel shows a ghost preview matching the dragged shape's type and default size (the same `SHAPE_DEFAULT_SIZES` entry that drop will use).
6. The preview stays attached to the cursor for the duration of the drag.
7. The preview is gone once the drag ends, whether by a successful drop or a cancelled drag (e.g. Escape, or releasing outside a valid drop target).
8. Drop-to-create-node behavior (shape/size/color/ID/position, sync to other room participants) is byte-for-byte unchanged from spec 12 — this spec only changes what a node/preview looks like, not how a node is created.
9. The shape panel's own layout (the pill toolbar, its 6 buttons, positioning) is unchanged.
10. No resize handles or label-editing UI are added.
11. `npm run build` and `npx tsc --noEmit` pass without type errors; `npx eslint .` passes with no new errors (mechanical gate consistent with specs 06–12, beyond the spec text's own narrower "Check When Done" list).

### Dependencies

- Spec 11 (Base Canvas) — **complete**. Provides `types/canvas.ts`'s `NodeShape`, `CanvasNodeData`, `CANVAS_NODE_TYPE`.
- Spec 12 (Shape Panel) — **complete**. Provides the placeholder `CanvasNode` this spec replaces, `ShapePanel`'s existing `dragstart` handler (extended, not rebuilt), and `lib/canvas-shapes.ts`'s `SHAPE_DEFAULT_SIZES`/`CANVAS_SHAPES` (reused as-is for preview sizing).
- `ui-context.md`'s Canvas > Node Shapes section — states the 6 shapes and that complex shapes (diamond/hexagon/cylinder) render as inline SVG rather than CSS borders; this spec is the first to actually build that.
- `ui-context.md`'s Canvas > Node Color Palette — `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR` (already defined in `types/canvas.ts` since spec 12) are the only colors this spec needs; the full 8-color palette is not a dependency since no per-node color selection exists yet.

### Open questions

1. **Native `setDragImage` vs. a custom cursor-following floating element.** The spec asks to "keep the preview attached to the cursor while dragging." `event.dataTransfer.setDragImage(element, x, y)` is the standard HTML5 drag-and-drop API for exactly this: the browser renders and repositions the ghost image automatically for the whole drag, with no JS-driven `mousemove`/`drag`-event position tracking required, and automatically removes it when the drag ends (drop or cancel) — which also directly satisfies "hide the preview after the shape is dropped or the drag is cancelled" for free. A custom floating `position: fixed` div updated on the native `drag` event would duplicate behavior the browser already provides, add continuous re-render/position-sync work, and is exactly the kind of scope growth the spec's "keep this limited to drag preview behavior only" line warns against. **Recommendation: use `setDragImage`.** Flagging as a recommendation, not a unilateral decision, since the spec text itself doesn't name either mechanism.

2. **`setDragImage` needs a real, already-rendered DOM element at the moment `dragstart` fires — this is a genuine implementation gotcha to flag, not just a preference.** `setDragImage` takes a synchronous snapshot of whatever element reference it's given; a shape/size set via React state inside the same `dragstart` handler would not yet be committed to the DOM (React state updates are async) by the time `setDragImage` runs in that same synchronous event handler, so the browser would snapshot stale or default content. **Recommendation:** keep one already-correctly-shaped, visually hidden preview element per shape (e.g. `position: fixed; top: -9999px` or similar off-screen technique, not `display:none`, which some browsers won't snapshot) rendered persistently alongside each shape button — sized per `SHAPE_DEFAULT_SIZES` and using the same shape geometry as `CanvasNode` — so `dragstart` only needs to pass the existing correct element straight into `setDragImage`, no state update in between.

3. **Sharing shape geometry between the real node renderer and the drag preview.** The spec's "use the same shape type and default size that will be used on drop" reads most naturally as "the preview should look like the shape it represents," which only stays true over time if the CSS classes / SVG paths aren't defined twice in two files that can drift apart. **Recommendation:** factor shape geometry into one shared piece (`components/editor/shape-visual.tsx` or equivalent), consumed by both `canvas-node.tsx` and the new preview elements in `shape-panel.tsx`. Left to Dev's discretion on exact shape/API; not a hard requirement of the spec text, but the reasonable reading of "the same shape type."

4. **Exact SVG geometry for diamond, hexagon, and cylinder is not specified anywhere in the spec, `ui-context.md`, or `project-overview.md`.** Only the shape names and their semantic role are given (Canvas > Node Shapes: diamond = decision/gateway, hexagon = external system/boundary, cylinder = database/storage). **Recommendation**, all on a `viewBox="0 0 100 100"` with `preserveAspectRatio="none"` so each stretches to the node's actual box:
   - diamond: a simple 4-point polygon (`50,0 100,50 50,100 0,50`) — the conventional flowchart decision-diamond shape.
   - hexagon: a flat-topped 6-point polygon (`25,0 75,0 100,50 75,100 25,100 0,50`) — the conventional "external system/boundary" architecture-diagram hexagon.
   - cylinder: the standard database-icon idiom — a top ellipse, two vertical side lines, and a bottom half-ellipse arc, giving the familiar "drum" silhouette used for storage/database nodes in most diagramming tools.
   These are a recommendation only, not a pinned visual spec (no Figma/design reference exists for this project) — Dev may adjust proportions; QA should verify against whatever concrete geometry Dev actually ships (each shape renders as *a* recognizable, correctly-classified SVG shape, not these exact coordinates) rather than assuming this literal path data.

5. **Selected-state border color is not specified.** The spec says only "brighter when selected," not which token. `ui-context.md`'s Border Radius/Color tables have `--border-default` (`#2a2a30`) and `--border-subtle` (`#3a3a42`, despite the name, is the *lighter* of the two) for structural borders, plus `--accent-primary` (`#00c8d4`, cyan) reserved for "vivid accent colors for interactive elements." **Recommendation:** rest state uses the existing `border-surface-border` token (already used by the spec-12 placeholder, mapping to `--border-default`); selected state switches to the brand accent (`--accent-primary`) for a clearly legible, unambiguous "this node is selected" signal, consistent with how the rest of the theme reserves the cyan accent for interactive/active states rather than reusing the merely-slightly-lighter `--border-subtle`. SVG shapes should use the same two colors via `stroke`, set inline (SVG `stroke` doesn't take a Tailwind class directly) rather than a separate hardcoded hex, so both rendering paths stay in sync with the same theme tokens. Flagged as a recommendation; `ui-context.md` should record whatever Dev actually ships, per "Keeping Docs In Sync."

6. **No open question on drop/creation behavior itself** — the spec's own Scope Limits are explicit and unambiguous here ("don't change how dropped nodes are created," "keep drag/drop changes limited to the ghost preview only"), so nothing in `lib/canvas-shapes.ts`'s `createDroppedNode`/ID generation/payload serialization is in scope for this spec, and none of it needs revisiting.

### Out-of-scope callouts

- **Resize handles or any node-resizing UI** — explicitly excluded by the spec's own Scope Limits ("don't add resize or label editing yet"). SVG shapes scaling with node size means "the SVG fills whatever box the node currently has," not "the user can drag a handle to resize the node."
- **Label editing** — explicitly excluded by the spec's Scope Limits; nodes keep the permanently-empty label / "Untitled" placeholder behavior from spec 12.
- **Changing how dropped nodes are created** (shape/size/color/ID generation, drop-position math, Liveblocks sync mechanism) — explicitly excluded by the spec's Scope Limits; all of `lib/canvas-shapes.ts` and `canvas.tsx`'s `handleDrop` stay untouched.
- **Rebuilding the shape panel's layout** — explicitly excluded by the spec's Scope Limits; the panel's 6-button pill toolbar, positioning, and icons are unchanged — only the `dragstart` handler gains the `setDragImage` call.
- **The full 8-color `NODE_COLORS` palette or any color-picker UI** — not requested; this spec's shapes still use only the existing `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR` pair.
- **Connection handles, edge rendering/creation, `CanvasEdgeData`/`CANVAS_EDGE_TYPE`** — not mentioned anywhere in this spec's text; untouched.
- **Billing, enterprise permission tiers, versioned spec history, production object storage migration, mobile apps** — `project-overview.md`'s Out of Scope wall; nothing in this spec's text comes near any of these.

## Handoff

Brief ready for Senior Developer at `context/spec-status/13-node-shape.md`.

## Dev Notes

### Files added

- `components/editor/shape-visual.tsx` — new shared shape-geometry component, `ShapeVisual({ shape, color, selected, className, children })`. `rectangle`/`pill`/`circle` render as a CSS `<div>` (`rounded-xl` / `rounded-full`); `diamond`/`hexagon`/`cylinder` render as an inline `<svg viewBox="0 0 100 100" preserveAspectRatio="none">` (diamond/hexagon as `<polygon>`, cylinder as a filled body `<path>` plus a top `<ellipse>` drawn over it to hide the seam). Border/stroke: `border-surface-border`/`var(--border-default)` at rest, `border-brand`/`var(--accent-primary)` when `selected`. Consumed by both `canvas-node.tsx` and `shape-panel.tsx`'s drag-preview elements — single source of truth, per Open Questions #3.
- `components/editor/shape-visual.test.tsx` — new unit tests: all 6 shapes render without throwing and fill their container; CSS shapes render no `<svg>` and carry the fill color; SVG shapes render a correctly-scaling `<svg>` carrying the fill color; children render for both rendering paths; rest-vs-selected border/stroke tokens switch correctly for both a CSS and an SVG shape.

### Files modified

- `components/editor/canvas-node.tsx` — replaced the placeholder bordered-rectangle-for-everything rendering with `<ShapeVisual shape={data.shape} color={data.color} selected={selected}>`; label/"Untitled" placeholder content passed through as `children`, unchanged from spec 12. Now reads `selected` off `NodeProps` (previously unused/undestructured).
- `components/editor/canvas-node.test.tsx` — kept the 3 existing spec-12 tests (rectangle-shaped by default, so their assertions about the label's `parentElement` still hold structurally) and added: CSS-shape-vs-SVG-shape rendering per shape (`it.each`), viewBox/`preserveAspectRatio`/`width`/`height` attributes on the 3 SVG shapes, rest-vs-selected border-class switching (CSS shape) and stroke-attribute switching (SVG shape), and radius-class-per-shape (`rounded-xl` for rectangle, `rounded-full` for pill/circle).
- `components/editor/shape-panel.tsx` — added the ghost drag preview. `ShapePanel` now owns a `previewRefs` ref (one `HTMLDivElement` per shape, populated by a new `ShapeDragPreviews` sub-component that renders 6 always-mounted, off-screen preview elements — sized per `SHAPE_DEFAULT_SIZES`, using `ShapeVisual` with `DEFAULT_NODE_COLOR`, positioned via `position: fixed` + a `translate(-9999px, -9999px)` transform, not `display: none`). `ShapeButton`'s existing `handleDragStart` gained one addition: after setting the existing `dataTransfer` payload, it calls `event.dataTransfer.setDragImage(previewElement, size.width / 2, size.height / 2)` so the ghost is centered on the cursor. No other change to the panel's layout, buttons, or existing payload logic.
- `components/editor/shape-panel.test.tsx` — updated the existing dragstart test's mock `dataTransfer` to include `setDragImage: vi.fn()` (previously undefined, which would have thrown once the real code started calling it). Added two new tests: `setDragImage` is called with a real, correctly-sized `HTMLElement` and offsets equal to half that shape's default width/height; the off-screen preview container renders exactly one element per shape and is marked `aria-hidden`.
- `context/ui-context.md` — documented the shape-rendering rules (CSS vs. SVG per shape, geometry, border/stroke token pairing) under Canvas > Node Shapes, and the `setDragImage`-based drag-preview mechanism under Canvas > Floating Shape Panel, per "Keeping Docs In Sync."

### Files deliberately left untouched (per Scope Limits)

- `lib/canvas-shapes.ts`, `types/canvas.ts` — no changes; both already exported everything this spec needed (`SHAPE_DEFAULT_SIZES`, `NodeShape`, `DEFAULT_NODE_COLOR`).
- `components/editor/canvas.tsx` — `handleDrop`, node creation, and Liveblocks sync wiring untouched.

### Skills consulted

- No skill in `.claude/skills/` matched this spec's scope (shape rendering + native HTML5 drag image) — none of the Clerk/Prisma/Liveblocks skills apply to CSS/SVG node rendering or `dataTransfer.setDragImage`. Proceeded without one, per the "check first, not a requirement" instruction.

### Key decisions (resolving the brief's Open Questions)

1. Used `event.dataTransfer.setDragImage` (native API), not a custom `mousemove`-tracked floating element — per Open Questions #1's recommendation. The browser positions/removes the ghost automatically for the whole drag (drop or cancel), satisfying acceptance criteria 6 and 7 with no extra cleanup code.
2. Kept one always-mounted, off-screen preview `<div>` per shape rather than building one on-demand inside `dragstart` — per Open Questions #2's gotcha about `setDragImage` needing an already-rendered DOM node synchronously. Positioned via `transform: translate(-9999px, -9999px)`, not `display: none`.
3. Factored shape geometry into `components/editor/shape-visual.tsx`, consumed by both `canvas-node.tsx` and `shape-panel.tsx` — per Open Questions #3.
4. Used the recommended SVG coordinates for diamond/hexagon/cylinder from Open Questions #4, adjusted slightly inward (`2`/`98` instead of `0`/`100`) so the 3px stroke doesn't get clipped by the SVG's own edge at `viewBox="0 0 100 100"`. Cylinder implemented as a filled body path (verticals + bottom arc, closed by the implicit straight top chord) with a top `<ellipse>` drawn over it to hide that seam — a standard technique for the database-drum idiom.
5. Selected-state border/stroke: `border-surface-border`/`var(--border-default)` at rest, `border-brand`/`var(--accent-primary)` when selected — per Open Questions #5's recommendation exactly. `border-brand` resolves via Tailwind v4's automatic `--color-brand` token utility (same mechanism already exercised by `text-brand`/`bg-accent-dim` elsewhere in the codebase). SVG shapes use the same two tokens as literal CSS custom property references (`var(--border-default)`/`var(--accent-primary)`) in an inline `stroke`, not a hardcoded hex.

### Test coverage added

- `components/editor/shape-visual.test.tsx` (new, 6 tests).
- `components/editor/canvas-node.test.tsx` (3 existing tests kept, 5 new: CSS-vs-SVG rendering per shape via `it.each`, SVG scaling attributes, selected-state border/stroke switching for one CSS and one SVG shape, radius-per-shape).
- `components/editor/shape-panel.test.tsx` (2 existing tests kept — one updated to add the `setDragImage` mock — 2 new: `setDragImage` called with a correctly-sized element and centered offsets for every shape; the off-screen preview container renders exactly 6 `aria-hidden` elements).

### Commands run (all pass)

- `npx tsc --noEmit` — pass, no errors.
- `npx eslint .` — pass, 0 errors (1 pre-existing warning in an unrelated `.agents/skills/` template file, not touched by this spec).
- `npx vitest run` — 180/180 across 25 files (one transient timeout in the unrelated, untouched `editor-home-empty-state.test.tsx` on a single run, confirmed a flake — reran clean at 180/180).
- `npx next build` — pass, no type errors, all routes compile.

### Known limitations / deferrals

- No live browser drag-and-drop verification performed in this pipeline (same limitation noted on specs 11/12) — recommended as a human smoke test: drag each of the 6 shapes from the panel and confirm the ghost preview matches the dropped node's shape/size, and confirm the preview disappears on both a successful drop and a cancelled drag (Escape).
- Cylinder/diamond/hexagon SVG coordinates are a styling judgment call (per Open Questions #4), not a pinned design reference — QA should verify shapes are recognizable and distinct, not match these exact coordinates.
