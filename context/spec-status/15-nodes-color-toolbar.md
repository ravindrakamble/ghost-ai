# Spec 15 — Nodes Color Toolbar

## Analyst Brief

### Scope statement

This spec adds a floating color-swatch toolbar that appears above a selected canvas node, letting the user pick from 8 predefined background/text color pairs; selecting a swatch updates the node's fill and paired text color live, through the same collaborative sync mechanism spec 14 established. It does not add a free-form color picker, does not change drag/drop or node-creation behavior, and does not change node selection logic.

### Concrete deliverables

- `types/canvas.ts` (modified):
  - Add `NODE_COLORS` — the 8 background/text color pairs documented in `ui-context.md`'s Node Color Palette table, as a real exported constant (the table currently exists only as documentation; no matching hex values exist anywhere in code — confirmed via grep against `app/globals.css`, so per the spec's own instruction ("keep the palette in the canvas types/constants, such as `types/canvas.ts`") these are net-new values to define here, not a reuse of existing theme tokens). The default pair (`#1F1F1F`/`#EDEDED`) should match the existing `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR` constants, not duplicate them with different values.
  - Extend `CanvasNodeData` with a `textColor: string` field — it currently only has `color` (fill). See Open Questions #1 for why this is required, not optional.
- `lib/canvas-shapes.ts` (modified, additive only) — `createDroppedNode` sets `textColor: DEFAULT_NODE_TEXT_COLOR` alongside the existing `color: DEFAULT_NODE_COLOR` default, so newly dropped nodes have a real `textColor` value from creation rather than `undefined`.
- `components/editor/shape-visual.tsx` (modified) — the currently-hardcoded `style={{ color: DEFAULT_NODE_TEXT_COLOR }}` becomes a `textColor` prop sourced from `data.textColor`. This file was explicitly left untouched across specs 13 and 14 (correct for those specs' narrower scope), but this spec's own text ("the text automatically updates to its paired text color") cannot be satisfied without this change — see Dependencies and Open Questions #1 so this isn't mistaken for scope creep.
- `components/editor/canvas-node.tsx` (modified) — passes `data.textColor` through to `ShapeVisual`; renders the new toolbar only when `selected`, positioned above the node without overlapping it (following the same `selected`-gated, absolutely-positioned-sibling pattern spec 14 used for `NodeResizer`).
- New component, e.g. `components/editor/node-color-toolbar.tsx` — the floating toolbar: one swatch button per `NODE_COLORS` pair, a clear active-state indicator for the swatch matching the node's current `data.color`, a subtle/tight hover glow derived from that swatch's paired text color, and `nodrag nopan` classes so clicking/hovering doesn't start a node drag or canvas pan. On click, dispatches both `color` and `textColor` together via the existing `useUpdateCanvasNode()` mechanism from spec 14 (`hooks/use-update-canvas-node.ts`) — this spec reuses that mechanism as-is; no new context or hook is needed.
- `context/ui-context.md` (modified) — document the real `NODE_COLORS` constant (it's currently only a doc table) and the new toolbar convention (positioning, swatch/active/hover styling) under Canvas, per "Keeping Docs In Sync."
- Test files: `types/canvas.test.ts` (NODE_COLORS shape/count/default-pair match), `lib/canvas-shapes.test.ts` (default `textColor` on `createDroppedNode`), `components/editor/canvas-node.test.tsx` (toolbar rendered only when selected), and a new `components/editor/node-color-toolbar.test.tsx` (swatch click dispatches both color fields through the context, active swatch reflects current `data.color`, `nodrag`/`nopan` present), per `code-standards.md`'s Testing section.

### Acceptance criteria

1. `NODE_COLORS` contains exactly the 8 background/text pairs documented in `ui-context.md`'s Node Color Palette table (same hex values and order; default pair first, matching `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR`).
2. A color toolbar renders above a node only when that node is `selected`; an unselected node shows no toolbar.
3. The toolbar is positioned above the node without visually overlapping the node's own shape.
4. The toolbar shows exactly one swatch per color pair (8 total).
5. The swatch matching the node's current `data.color` is visually marked as active/selected.
6. Hovering a swatch shows a subtle, tight (non-blurry) glow derived from that swatch's paired text color.
7. Clicking a swatch updates the node's `data.color` and `data.textColor` together, through the same synced `onNodesChange`/`useUpdateCanvasNode` path spec 14 established — not a local-only mutation (verify via code/`git diff`, consistent with how spec 14's criteria were checked).
8. The color change is reflected in the node's rendering immediately (both fill and label text color change), with no server/API call involved.
9. Interacting with the toolbar (clicking, hovering) does not start a node drag or a canvas pan (`nodrag`/`nopan` classes present and effective).
10. No free-form color input (hex field, native `<input type="color">`, custom swatch entry, etc.) exists anywhere — only the 8 predefined swatches.
11. Drag/drop node creation and node selection logic are unchanged from spec 14 — verify via `git diff` that `canvas.tsx`'s drop handler/node-creation path is untouched, and that React Flow's own `selected` prop remains the only selection-state source (no new selection mechanism introduced).
12. `npm run build` and `npx tsc --noEmit` pass without type errors; `npx eslint .` passes with no new errors.

### Dependencies

- Spec 11 (Base Canvas) — **complete**. Provides the `useLiveblocksFlow` sync foundation this spec's color updates flow through.
- Spec 12 (Shape Panel) — **complete**. Provides `CanvasNode`, `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR`, and `createDroppedNode`.
- Spec 13 (Node Shape) — **complete**. Provides `ShapeVisual`, which this spec must modify (see Concrete deliverables) to accept a `textColor` prop instead of hardcoding `DEFAULT_NODE_TEXT_COLOR`.
- Spec 14 (Node Editing) — **complete, direct dependency**. Provides `useUpdateCanvasNode()`/`CanvasNodeUpdateContext` (`hooks/use-update-canvas-node.ts`) and `CanvasFlow`'s `updateNodeData`, the exact mechanism this spec's swatch-click handler should reuse to dispatch `{ color, textColor }` through the real `onNodesChange`. Also establishes the `selected`-gated-visibility and `nodrag`/`nopan` conventions (`NodeResizer`) this toolbar should follow.
- `ui-context.md`'s Node Color Palette section — already documents the 8 pairs as a table; confirmed (via grep against `app/globals.css`) that none of these hex values exist as theme tokens today, so per the spec's own instruction this is new data to add to `types/canvas.ts`, not a reuse of existing CSS custom properties.

All listed dependencies are complete per `progress-tracker.md`.

### Open questions

1. **`CanvasNodeData` has no `textColor` field today, and `ShapeVisual` currently hardcodes `DEFAULT_NODE_TEXT_COLOR` rather than accepting a color prop.** Read directly: `shape-visual.tsx` sets `style={{ color: DEFAULT_NODE_TEXT_COLOR }}` on both its CSS-shape and SVG-shape branches — every node today renders label text in the same fixed color regardless of its fill. The spec's step 4 ("the text automatically updates to its paired text color") cannot be satisfied without making text color real per-node synced state. **Recommendation:** add `textColor: string` to `CanvasNodeData`, default it in `createDroppedNode`, and thread it through `ShapeVisual` as a new prop — the minimal change satisfying the spec's literal requirement. Flagging explicitly since `shape-visual.tsx` was kept untouched by specs 13 and 14 (correctly, for their narrower scope) — that precedent doesn't extend to this spec, whose own text requires the change.
2. **Does the label textarea (edit mode, from spec 14) also need to reflect `data.textColor`, or only the at-rest label?** The spec's step 4 doesn't distinguish edit vs. rest state. Today the edit-mode `<textarea>` uses a fixed `text-copy-primary` token class, independent of node data. **Recommendation:** apply `data.textColor` consistently in both states (e.g. an inline `style` color on the textarea, matching how the rest-state label already inherits color from `ShapeVisual`'s container) so the label doesn't visibly flash to a different color when entering edit mode. Flagging as a recommendation, not a literal requirement — the spec text is silent on edit-mode specifically.
3. **Exact toolbar positioning offset/mechanism isn't specified** beyond "keep it slightly above the node without overlapping it." No pixel value or specific CSS approach is pinned anywhere in the spec, `ui-context.md`, or `project-overview.md`. **Recommendation:** follow the same pattern spec 14 used for `NodeResizer` — an absolutely-positioned sibling within `CanvasNode`'s render, offset upward by a small fixed Tailwind spacing value — left as a concrete Dev-level styling choice, on the same footing as spec 13's SVG coordinates and spec 14's `NODE_MIN_SIZE` number.
4. **Field/constant naming for the new palette and `CanvasNodeData` field.** `ui-context.md`'s table headers are "Node fill"/"Text color"; existing constants are `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR`. **Recommendation:** keep naming consistent with what already exists (`color`/`textColor` on `CanvasNodeData` and on each `NODE_COLORS` entry) rather than inventing new terminology. Left to Dev's discretion — not product-significant.
5. **"Active swatches should feel clearly selected" has no pinned visual treatment** (ring, checkmark, border color, etc.). **Recommendation:** reuse the existing `border-brand` selected-token convention already used for node borders and resize handles, for visual consistency — exact treatment is a Dev styling call, not a product decision.

### Out-of-scope callouts

- **Full/custom color picker** — explicitly excluded by the spec's own Scope Limits ("don't add a full color picker," "keep this focused on predefined color themes only"). No hex input, no native `<input type="color">`, no user-defined swatches.
- **Changing drag/drop behavior or node creation** — explicitly excluded ("don't change drag/drop behavior"). `lib/canvas-shapes.ts`'s `createDroppedNode` gets only the additive `textColor` default; ID generation, drop-position math, and the drag payload stay untouched.
- **Rebuilding node selection logic** — explicitly excluded ("don't rebuild node selection logic"). The toolbar consumes React Flow's existing `selected` prop (already wired since spec 13); no new selection-state mechanism is introduced.
- **Persisting color choices via a server call** — the spec explicitly says "no server calls" and "keep this inside the existing collaborative canvas state." This stays a Liveblocks-Storage-synced `data` update via the existing `onNodesChange` path, consistent with spec 14's precedent — no new `app/api` route.
- **Connection handles / edge coloring** — not mentioned anywhere in this spec's text; `ui-context.md`'s separate "Connection Handles" section remains a later spec's job, as spec 14 also noted.
- **Multi-select / bulk color changes** — the spec's language ("selected nodes," "a node") matches how `NodeResizer`/label-editing already operate on one node at a time; not asked for here.
- **Billing, enterprise permission tiers, versioned spec history, production object storage migration, mobile apps** — `project-overview.md`'s Out of Scope wall; nothing in this spec's text comes near any of these.

## Handoff

Brief ready for Senior Developer at `context/spec-status/15-nodes-color-toolbar.md`.

## Dev Notes

### Files added/changed

- `types/canvas.ts` (modified) — added `NodeColorPair` interface and `NODE_COLORS` (8 fill/text pairs, order matching `ui-context.md`'s table; first entry reuses `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR` rather than re-declaring their hex values, so the default pairing can't drift). Extended `CanvasNodeData` with a required `textColor: string` field, per Open Question #1's recommendation.
- `lib/canvas-shapes.ts` (modified, additive only) — `createDroppedNode` now also sets `data.textColor: DEFAULT_NODE_TEXT_COLOR`. No changes to ID generation, drop-position math, or the drag payload.
- `components/editor/shape-visual.tsx` (modified) — added a `textColor?: string` prop (defaulting to `DEFAULT_NODE_TEXT_COLOR`) that replaces the previously hardcoded `style={{ color: DEFAULT_NODE_TEXT_COLOR }}` on both the CSS-shape (`<div>`) and SVG-shape (`<svg>` wrapper `<div>`) branches.
- `components/editor/node-color-toolbar.tsx` (new) — `NodeColorToolbar` component: 8 swatch buttons, active-swatch styling, hover glow, `nodrag`/`nopan`, dispatches `onSelect(pair)`.
- `components/editor/canvas-node.tsx` (modified) — threads `data.textColor` into `ShapeVisual` and the edit-mode `<textarea>`; renders `NodeColorToolbar` only when `selected`, wired to `useUpdateCanvasNode()`.
- `context/ui-context.md` (modified) — documented `NODE_COLORS` as a real code constant and a new "Node Color Toolbar" convention section.
- Tests (new/modified): `types/canvas.test.ts`, `lib/canvas-shapes.test.ts`, `components/editor/shape-visual.test.tsx`, `components/editor/canvas-node.test.tsx`, `components/editor/node-color-toolbar.test.tsx` (new).
- `context/progress-tracker.md` (modified) — moved spec 15 to "In Progress" with the real file list above; "Current Phase"/"Current Goal"/"Next Up" updated to reflect handoff to QA.

No skill from `.claude/skills/` applied here — this spec is pure React/Tailwind component work with no Clerk, Prisma, or Liveblocks-specific API surface (the sync mechanism it reuses was already established by spec 14; nothing here touches Presence, Storage schema, or room setup in a way the `liveblocks-best-practices` skill would materially change).

### Key decisions

- **`ShapeVisual`'s `textColor` prop is optional, not required.** The brief's Open Question #1 recommended adding it "as a new prop" without pinning optional vs. required. Making it optional (default `DEFAULT_NODE_TEXT_COLOR`) let `shape-panel.tsx`'s off-screen drag-preview elements — which render no label/children at all — go untouched, keeping this spec's diff scoped to exactly the files the brief's Concrete Deliverables list. Confirmed via `git diff spec/14-node-editing spec/15-nodes-color-toolbar -- components/editor/shape-panel.tsx` (empty).
- **Edit-mode `<textarea>` now uses `data.textColor` too** (Open Question #2's recommendation, followed as-is) — dropped the previously fixed `text-copy-primary` class in favor of an inline `style={{ color: data.textColor }}`, matching how the rest-state label already inherits its color from `ShapeVisual`'s own container. This avoids the label visibly changing color when entering/exiting edit mode.
- **Toolbar positioning**: `absolute bottom-full left-1/2 -translate-x-1/2 mb-2`, the same absolutely-positioned-sibling pattern spec 14 used for `NodeResizer`, per Open Question #3's recommendation. `mb-2` gives a visible non-overlapping gap (acceptance criterion 3).
- **Active-swatch styling**: reused `border-brand` (the same token already used for selected node borders and resize handles), per Open Question #5's recommendation, plus `aria-pressed` for accessibility.
- **Hover glow mechanism**: since acceptance criterion 6 requires a glow color *derived from each swatch's own paired text color* (not one static token), a single Tailwind utility class can't express it. Used a per-swatch CSS custom property (`--swatch-glow`, assigned only ever a `NODE_COLORS` value via inline `style`) combined with Tailwind's `hover:shadow-[0_0_0_2px_var(--swatch-glow)]` arbitrary-value utility — zero blur radius, fixed 2px spread, keeping it a tight ring rather than a blurred glow. This mirrors the existing "runtime data drives an inline color" pattern `ShapeVisual` already uses for `data.color`/`data.textColor`, so it isn't a `code-standards.md` violation (no raw Tailwind color class, no hardcoded hex in a className — the only hex values involved are the already-documented `NODE_COLORS` data).
- **Field/constant naming**: kept `color`/`textColor` on both `CanvasNodeData` and `NodeColorPair`, consistent with the existing `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR` naming, per Open Question #4's recommendation.
- **Click handler stays scoped to `CanvasNode`**: `NodeColorToolbar` itself is a pure presentational component (`activeColor`/`onSelect` props only) with no direct dependency on `useUpdateCanvasNode()`, so it can be unit-tested in isolation without standing up the context provider — `CanvasNode` is the only place that calls `useUpdateCanvasNode()` and passes the resulting dispatcher down as `onSelect`.

### Test coverage added

- `types/canvas.test.ts` — `NODE_COLORS` has exactly 8 entries, matches the documented table verbatim (values + order), first entry equals `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR`, all 8 fill colors distinct.
- `lib/canvas-shapes.test.ts` — `createDroppedNode`'s `data` now includes `textColor: DEFAULT_NODE_TEXT_COLOR` alongside `color`.
- `components/editor/shape-visual.test.tsx` — `textColor` prop defaults to `DEFAULT_NODE_TEXT_COLOR` when omitted, and is applied correctly on both the CSS-shape and SVG-shape branches when given.
- `components/editor/canvas-node.test.tsx` — toolbar renders exactly 8 swatches when `selected`, renders nothing when not; swatch click dispatches `{ color, textColor }` together through the update-node-data context; `data.textColor` is applied to both the rest-state shape container and the edit-mode textarea.
- `components/editor/node-color-toolbar.test.tsx` (new) — swatch count (8), active-swatch marking (`aria-pressed` + `border-brand`) matches `activeColor`, `onSelect` called with the full pair object on click, each swatch's fill applied via inline `background-color`, `nodrag`/`nopan` present on the container, no free-form color input anywhere (`role="textbox"` count 0, no `input[type="color"]`), `--swatch-glow` custom property set to the pair's `textColor`.
- Commands run: `npx tsc --noEmit` (pass, no errors), `npx eslint .` (pass — 1 pre-existing warning in `.agents/skills/...`, unrelated to this spec, no new errors), `npx vitest run` (pass — 211/211 across 27 files, up from 193/26), `npx next build` (pass — Turbopack build + type-check succeeded, all routes generated).

### Known limitations / deferrals

- No live browser verification was possible in this pipeline (consistent with prior canvas specs) — recommend a human smoke test: select a node, confirm the 8-swatch toolbar appears above it without overlapping, click a non-default swatch and confirm both fill and label text color update immediately (and stay visible live in a second browser tab), confirm the hover glow is a tight ring (not blurry) and colored per-swatch, and confirm clicking elsewhere/deselecting hides the toolbar.
- `git diff spec/14-node-editing spec/15-nodes-color-toolbar` confirms `components/editor/canvas.tsx` and `components/editor/shape-panel.tsx` are untouched — no drag/drop, node-creation, or selection-logic changes, per this spec's Scope Limits.

Implementation ready for QA at `context/spec-status/15-nodes-color-toolbar.md`.
