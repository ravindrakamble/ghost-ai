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

## QA Report

**Overall verdict: PASS**

### Mechanical gate

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass -- no errors |
| `npx eslint .` | Pass -- 0 errors, 1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/.../__root.tsx` (unrelated to this spec, not touched) |
| `npx vitest run` | Pass, with a caveat -- 178-180/180 across 23-25 files depending on run; this environment is consistently slow (observed setup/import phases of 90-190s across three separate `vitest run` invocations), which twice tripped the default 5000ms per-test timeout on `shape-panel.test.tsx`'s first test and, separately, on the pre-existing/unrelated `editor-home-empty-state.test.tsx`. Re-ran `shape-panel.test.tsx` in isolation with `--testTimeout=30000`: all 4 tests passed cleanly in ~9s of actual test time. This is an environment-slowness flake, not a logic defect -- same category as the transient timeout Dev Notes already documented for `editor-home-empty-state.test.tsx`. No code changes needed. |
| `npx next build` | Pass -- Turbopack build succeeds, all routes compile |

Figures independently reproduced (multiple runs, including a full run and targeted per-file runs); they match the Dev Notes claims once the environment-timeout flake is accounted for.

### Acceptance criteria checklist

1. All 6 shapes render visually distinctly via `data.shape` -- Pass. `ShapeVisual` branches into a CSS-div path (rectangle/pill/circle) and an SVG path (diamond/hexagon/cylinder, each a distinct polygon/path+ellipse), consumed by `CanvasNode` as `<ShapeVisual shape={data.shape} ...>`. `canvas-node.test.tsx`'s `it.each` tests confirm CSS-vs-SVG rendering per shape and per-shape radius class.
2. `rectangle`/`pill`/`circle` CSS-only, no SVG -- Pass. `container.querySelector("svg")` asserted null for all three in both `shape-visual.test.tsx` and `canvas-node.test.tsx`.
3. `diamond`/`hexagon`/`cylinder` inline SVG, resize with node width/height -- Pass. `<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">` scales to whatever box its parent (React Flow's node wrapper, sized from the Node's top-level width/height fields `createDroppedNode` already sets) provides -- no fixed pixel dimensions anywhere in `shape-visual.tsx`. Confirmed by reading the component directly (no width={100}/height={100} literals) and by `canvas-node.test.tsx`'s attribute assertions.
4. Border subtle at rest, brighter when selected, for every shape -- Pass, and genuinely wired to `NodeProps.selected` (not hardcoded). `canvas-node.tsx` destructures `{ data, selected }` from `NodeProps<CanvasNodeType>` and passes it straight through. `canvas-node.test.tsx` re-renders the same component with selected: false then selected: true via `makeProps(..., true/false)` and asserts the className/stroke actually switches (toContain / not.toContain on both states) -- a real assertion that would fail if selected were hardcoded or unwired. Verified for both a CSS shape (rectangle, `border-surface-border` vs `border-brand`) and an SVG shape (diamond, `stroke="var(--border-default)"` vs `stroke="var(--accent-primary)"`). Token mapping confirmed real in `app/globals.css`: `--color-brand: var(--accent-primary)` (`#00c8d4`, cyan) vs `--border-default` (`#2a2a30`) -- a visibly distinct color pair, not a subtle shade difference.
5. Drag preview matches dragged shape's type and default size -- Pass. `ShapeDragPreviews` renders one `ShapeVisual` per shape sized via `SHAPE_DEFAULT_SIZES[shape]` -- the exact same table `serializeShapeDragPayload`/`createDroppedNode` use to size the real dropped node (confirmed by reading `lib/canvas-shapes.ts`, untouched). `shape-panel.test.tsx` asserts `setDragImage` receives an element whose inline style.width/style.height equal `SHAPE_DEFAULT_SIZES[shape]` for every one of the 6 shapes.
6. Preview stays attached to the cursor for the duration of the drag -- Pass, via the standard mechanism. `event.dataTransfer.setDragImage(previewElement, size.width / 2, size.height / 2)` is called synchronously inside `handleDragStart`, pointing at an already-rendered, always-mounted off-screen div (populated via a ref callback at mount time, not created or updated inside the dragstart handler) -- correctly avoids the async-React-state gotcha the brief flagged in Open Questions #2. The browser natively repositions the drag image with the cursor for the rest of the drag; no custom mousemove/drag tracking was added (confirmed absent by reading the file), consistent with the scope-limiting "keep this limited to drag preview behavior only."
7. Preview is gone after a successful drop or a cancelled drag -- Pass by construction (native setDragImage ghost is browser-managed and removed automatically at drag end in both cases), consistent with the mechanism chosen for #6. Cannot be independently exercised in jsdom/vitest (no real OS-level drag-and-drop); this is a known, reasonable limitation already flagged by Dev Notes and consistent with specs 11/12's precedent -- recommended as a human smoke test, not a blocking gap.
8. Drop-to-create-node behavior byte-for-byte unchanged -- Pass. `git diff` against the parent commit for `lib/canvas-shapes.ts`, `types/canvas.ts`, and `components/editor/canvas.tsx` is completely empty (zero lines changed) -- independently confirmed, not just trusted from Dev Notes' "left untouched" claim.
9. Shape panel's own layout unchanged -- Pass. Confirmed via the actual diff: the outer positioning wrapper and the inner pill container classes are untouched; the only changes are the new previewRefs plumbing, the setDragImage call inside the existing handleDragStart, and the new (separately rendered, aria-hidden, off-screen) ShapeDragPreviews sibling.
10. No resize/label-editing UI added -- Pass. Confirmed by reading `canvas-node.tsx`/`shape-visual.tsx` in full -- no resize handles, no editable input/textarea, label rendering is the same read-only span/placeholder from spec 12.
11. `npm run build`/`npx tsc --noEmit`/`npx eslint .` pass -- Pass, independently reproduced (see Mechanical gate above).

All 11 acceptance criteria pass.

### Architecture invariants (context/architecture-context.md)

- Invariant 1 (no long-running AI work in request handlers): N/A -- no request handlers touched.
- Invariant 2 (metadata vs. blob storage separation): N/A -- no persistence code touched; pure rendering/UI spec.
- Invariant 3 (auth/ownership enforced at every mutation boundary): N/A -- no new mutation boundary added; node creation itself is unchanged (confirmed empty diff on `canvas.tsx`).
- Invariant 4 (client components only where needed): `shape-visual.tsx` and `canvas-node.tsx` correctly have no `"use client"` directive (no hooks/interactivity of their own -- both are RSC-eligible leaf components, bundled transitively via `canvas.tsx`'s existing client tree); `shape-panel.tsx` retains its pre-existing `"use client"` (drag handlers, useRef). No unnecessary client boundaries introduced.
- Invariant 5 (canvas schema consistency): `ShapeVisual`/`CanvasNode` read only the existing `CanvasNodeData` fields (shape, color, label) -- no new or divergent data shape introduced.

No invariant violations found.

### Standards compliance (context/code-standards.md)

- No `any` usage anywhere in the new/changed files -- confirmed via targeted grep across `shape-visual.tsx`, `canvas-node.tsx`, `shape-panel.tsx`, and all three `.test.tsx` files, plus a clean `tsc --noEmit`.
- No raw Tailwind color classes (zinc-/slate-) or hardcoded hex values in any changed file -- confirmed via grep; the only match at all was the unrelated `bottom-6` positioning class (false positive from the grep pattern, not a color). All colors route through tokens (`border-surface-border`/`border-brand` classes, `var(--border-default)`/`var(--accent-primary)` for SVG stroke, `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR` for fill/text -- both pre-existing constants from spec 12, untouched).
- `components/ui/*` untouched -- confirmed via `git diff --stat` against the parent commit, empty output.
- Tokens used are real, not invented: `--color-brand: var(--accent-primary)` and `--color-surface-border: var(--border-default)` both confirmed present in `app/globals.css`'s `@theme inline` block, so `border-brand`/`border-surface-border` are genuine generated Tailwind utilities, not typos that would silently no-op.
- Test files correctly co-located and named, `@vitest-environment jsdom` docblocks present on all three.

### Error handling

This spec's scope is almost entirely rendering, so the failure-mode surface is narrow: an unrecognized `data.shape` value (not one of the 6 NodeShape literals) would fall through `ShapeVisual`'s SVG branch without matching any of the three shape === "..." conditions, rendering an empty (but non-crashing) SVG. This is an acceptable non-issue in practice -- `data.shape` is a closed TypeScript union enforced at compile time, and the only place untrusted shape strings ever enter the system (`parseShapeDragPayload`, in the untouched `lib/canvas-shapes.ts`) already validates shape membership before a node is ever created, so this path is unreachable via the app's own UI. `ShapeButton`'s handleDragStart also defensively no-ops the setDragImage call (`if (previewElement) { ... }`) rather than throwing if a preview ref somehow isn't populated yet, falling back to the browser's default drag ghost. No new API/auth/mutation failure modes apply -- none of those boundaries were touched.

### Housekeeping

`context/progress-tracker.md` accurately reflects what was built: "In Progress" lists the real files touched (`shape-visual.tsx` new, `canvas-node.tsx`/`shape-panel.tsx` modified, `ui-context.md` modified) with descriptions that match the actual code, not just Dev Notes prose; "Current Phase"/"Next Up" correctly point at QA for spec 13. `context/ui-context.md`'s new subsections (shape-rendering rules under Node Shapes, drag-preview mechanism under Floating Shape Panel) were read directly and confirmed to accurately describe what was actually shipped (geometry, token pairing, setDragImage mechanism) -- not aspirational or stale.

### Other verification performed

- Independently confirmed via `git diff --stat <parent-commit> -- lib/canvas-shapes.ts types/canvas.ts components/editor/canvas.tsx` (empty output) that the Scope Limits ("don't rebuild shape panel layout," "don't change how dropped nodes are created," "keep drag/drop changes limited to the ghost preview only") were genuinely honored at the byte level, not just claimed in Dev Notes.
- Read `shape-visual.tsx`, `canvas-node.tsx`, and `shape-panel.tsx` in full (not just the diff) to confirm the SVG scaling mechanism has no fixed-pixel dimensions anywhere, and that `selected` is sourced from React Flow's real NodeProps, not a local/default value.
- Re-ran the full `vitest run` suite three times (once in the full combined suite, once isolated to the three spec-13 test files, once with an extended per-test timeout) to distinguish a genuine logic defect from an environment-slowness flake before concluding the latter -- the isolated, extended-timeout run passed all 4 `shape-panel.test.tsx` tests cleanly.
- No live browser drag-and-drop verification performed (same limitation Dev Notes already flagged, consistent with specs 11/12's precedent) -- recommended as a human smoke test: drag each of the 6 shapes from the panel, confirm the ghost preview visually matches the shape/size of the node that lands on drop, and confirm the preview disappears on both a successful drop and an Escape-cancelled drag.

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Success criteria fit

Judged against `project-overview.md`'s Success Criteria list:

- This spec doesn't add a new capability on its own — it doesn't map cleanly onto a single Success Criterion the way spec 12 (node creation) or spec 09 (collaborator access) did. What it does is remove a real product-quality gap in **Success Criterion 2** ("Multiple users can collaborate in the same canvas simultaneously"): spec 12 made it possible to put a node on the shared canvas, but every node — regardless of the shape a user dragged — rendered as the same generic bordered rectangle. A system-design tool where "diamond" and "cylinder" and "hexagon" are visually indistinguishable from "rectangle" doesn't yet look or behave like the architecture-diagramming canvas the product overview describes (nodes are meant to represent distinct architectural roles — decision/gateway, database/storage, external system/boundary, per `ui-context.md`). This spec is what makes the canvas actually readable as a system diagram rather than a grid of identical boxes, which is a genuine, non-cosmetic step toward the collaborative-canvas experience Criterion 2 depends on, not a decorative afterthought.
- It also directly de-risks **Criterion 4** ("AI can generate an architecture into the shared room from a prompt") and **Criterion 5** ("the graph can be converted into a persisted Markdown spec") — both future specs will generate/consume `data.shape` values that, until now, had no visual meaning on the canvas. Shape-correct rendering means AI-generated nodes will actually look like what they're supposed to represent once specs 20/25 land, rather than needing a second pass to "look right." Not a claim that this spec touches AI generation (it doesn't), just that it removes a rendering gap those later specs would otherwise have inherited.
- No claim is made against Criteria 1, 3, or 6 — correctly; nothing in this spec touches project creation, starter templates, or metadata/artifact storage.

### Scope check against project-overview.md and the spec's own limits

- **`project-overview.md`'s Out of Scope wall** (billing, permission tiers, versioned spec history, production object storage migration, mobile apps) — untouched; nothing in the diff comes anywhere near any of these.
- **This spec's own explicit Scope Limits**, checked directly against the diff (`git diff main..spec/13-node-shape --stat` and the actual file contents, not just Dev Notes' claims):
  - "don't rebuild shape panel layout" — confirmed; `shape-panel.tsx`'s outer wrapper, pill container classes, and 6 buttons are byte-for-byte unchanged. The only additions are the `previewRefs` plumbing, the `setDragImage` call inside the existing `handleDragStart`, and a new sibling `ShapeDragPreviews` component that renders off-screen (`aria-hidden`, `translate(-9999px, -9999px)`) and has zero visual presence in the panel itself.
  - "don't change how dropped nodes are created" — confirmed at the byte level: `git diff main..spec/13-node-shape -- lib/canvas-shapes.ts types/canvas.ts components/editor/canvas.tsx` is empty. `createDroppedNode`, ID generation, drop-position math, and the Liveblocks `onNodesChange` sync path are untouched.
  - "don't add resize or label editing yet" — confirmed; read `shape-visual.tsx` and `canvas-node.tsx` in full, no resize handles, no editable input/textarea. Label rendering is the same read-only span/"Untitled" placeholder carried over unchanged from spec 12.
  - "keep drag/drop changes limited to the ghost preview only" — confirmed; the only drag-related addition is the single `event.dataTransfer.setDragImage(...)` call. No new `mousemove`/`drag` position-tracking listeners were added (grepped/read the file directly) — the native browser API does the cursor-following, which is also the correct technical choice per the brief's own Open Questions #1/#2 reasoning.
- Diff surface matches Dev Notes/QA's claimed file list exactly (9 files: `canvas-node.tsx`+test, `shape-panel.tsx`+test, `shape-visual.tsx` new +test, `context/ui-context.md`, `context/progress-tracker.md`, this status file). No unexplained scope creep.

### Rough edges — acceptable at this stage

- **No live browser drag-and-drop verification performed** — same limitation flagged on specs 11/12, unavoidable in this pipeline (no interactive browser session). QA independently read the full, unminified `shape-visual.tsx`/`canvas-node.tsx`/`shape-panel.tsx` source (not just the diff) to confirm no fixed-pixel SVG dimensions and that `selected` is genuinely sourced from React Flow's real `NodeProps`, which closes most of the code-level risk. Still flagging this explicitly as a human smoke test, consistent with specs 11/12's precedent: drag each of the 6 shapes from the panel and confirm the ghost preview visually matches the shape/size of the node that lands on drop, and confirm the preview disappears cleanly on both a successful drop and an Escape-cancelled drag.
- **Cylinder/diamond/hexagon SVG coordinates are a styling judgment call**, not a pinned design reference (no Figma exists for this project) — reasonable for this stage; nothing in `ui-context.md` or the spec pinned exact geometry, and Dev Notes/QA both correctly treated this as "must be recognizable and distinct," not "must match exact coordinates."
- Neither rough edge blocks a later spec from building correctly on this one: `ShapeVisual` is a stable, single-source-of-truth shape-geometry component consumed identically by both the real node renderer and the drag preview, so spec 14 (Node Editing) has a solid, non-duplicated visual layer to add resize/label-editing UI onto.

### progress-tracker.md accuracy

Read in full before this review. The "In Progress" entry for spec 13 accurately lists the actual files added/changed (`shape-visual.tsx` new, `canvas-node.tsx`/`shape-panel.tsx` modified, `ui-context.md` modified) with descriptions that match the real diff content, not aspirational prose — independently re-confirmed against the diff above. It correctly notes the mechanical check figures (180/180 tests, tsc/eslint/build all passing) matching both Dev Notes' and QA's independently-reproduced numbers, and correctly states no changes were made to `lib/canvas-shapes.ts`, `types/canvas.ts`, or `canvas.tsx`'s drop/node-creation logic. No corrections needed before promotion to "Completed."

### PR creation

- `gh auth status` confirms an authenticated session (`ravindrakamble`, `repo` scope) — no blocker.
- `spec/13-node-shape` is checked out with one commit ahead of `main` (`04f7e7e`), so there is real work to hand off.
- Proceeding to push the branch and open a PR against `main` (not merging).
