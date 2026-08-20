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

## QA Report

**Overall verdict: PASS**

### Mechanical gate

- `npx tsc --noEmit` — pass, no output/errors.
- `npx eslint .` — pass, 0 errors; 1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/...` (unrelated `@next/next/no-head-element`), matches Dev Notes claim, no new warnings introduced by this spec's files.
- `npx vitest run` — pass, 211/211 tests across 27 files, matches Dev Notes claim exactly.
- `npx next build` — pass, Turbopack build + TypeScript check succeeded, all routes generated.

### Acceptance criteria

1. `NODE_COLORS` matches `ui-context.md`'s 8-pair table exactly (hex values + order) — PASS. Verified by reading both `types/canvas.ts` and `context/ui-context.md`'s table side by side; default pair reuses `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR` rather than duplicating hex literals. Covered by `types/canvas.test.ts`.
2. Toolbar renders above a node only when `selected` — PASS. `canvas-node.tsx:129` — `{selected ? <NodeColorToolbar .../> : null}`. Covered by `canvas-node.test.tsx`'s "color toolbar" describe block (renders 8 when selected, none when not).
3. Toolbar positioned above the node without overlapping — PASS. `absolute bottom-full left-1/2 -translate-x-1/2 mb-2` anchors the toolbar's bottom edge to the node's top edge with a visible gap.
4. Exactly one swatch per color pair (8 total) — PASS. `NODE_COLORS.map(...)` in `node-color-toolbar.tsx`; tested directly.
5. Active swatch (matching `data.color`) visually marked — PASS. `border-brand` + `aria-pressed` on the matching swatch; tested.
6. Hover shows a subtle, tight (non-blurry) glow derived from the swatch's paired text color — PASS. `--swatch-glow` CSS custom property (set to `pair.textColor`) + `hover:shadow-[0_0_0_2px_var(--swatch-glow)]` — zero blur radius, fixed 2px spread. Verified the value is per-swatch, not a single static token.
7. Click updates `data.color`/`data.textColor` together through the real `useUpdateCanvasNode()`/`onNodesChange` sync path, not local-only — PASS. Traced the full chain: `NodeColorToolbar` → `CanvasNode.handleColorSelect` → `useUpdateCanvasNode()` → `CanvasFlow.updateNodeData` (`canvas.tsx:164-173`) → `onNodesChange([{ type: "replace", ... }])`, the same Liveblocks-backed `onNodesChange` passed to `<ReactFlow>`. Not a local React Flow store mutation.
8. Color change reflected immediately in both fill and label text, no server/API call — PASS. `ShapeVisual` receives `color`/`textColor` straight from `data`; no `fetch`/`app/api` call anywhere in the new code.
9. Toolbar interactions don't start drag/pan — PASS. `nodrag nopan` present on the toolbar container; tested.
10. No free-form color input anywhere — PASS. No `input[type=color]`, no hex field; explicitly tested (`queryAllByRole("textbox")` count 0, `input[type="color"]` null) in both `node-color-toolbar.test.tsx` and indirectly via component composition.
11. Drag/drop and node-creation/selection logic unchanged — PASS. Independently reproduced `git diff spec/14-node-editing spec/15-nodes-color-toolbar -- components/editor/canvas.tsx` and `-- components/editor/shape-panel.tsx`: both empty. `selected` remains React Flow's own prop; no new selection mechanism introduced.
12. `npm run build`/`tsc --noEmit`/`eslint` pass — PASS, see Mechanical gate above.

All 12 acceptance criteria pass.

### Architecture invariants

- No long-running AI work introduced; this is pure client-side component state synced via existing Liveblocks path — consistent with invariant 1.
- No metadata/blob storage touched — consistent with invariant 2.
- No new mutation boundary requiring auth/ownership checks — this stays inside the existing Liveblocks room's collaborative state, same trust boundary as spec 14's label edits — consistent with invariant 3.
- `node-color-toolbar.tsx` and `canvas-node.tsx` are `"use client"` — correctly requires browser interactivity (click handlers, hover) — consistent with invariant 4.
- No template/schema changes — consistent with invariant 5. (Note: `CanvasNodeData.textColor` is now a required field; no starter templates exist yet in the codebase, so this doesn't currently create a load-time gap — see minor note below, not blocking.)

### Standards compliance

- No `any` anywhere in the diff.
- No raw Tailwind color classes (`zinc-`/`slate-`/`gray-`) or hardcoded hex values inside `className` strings in the changed component files — grepped `node-color-toolbar.tsx`, `canvas-node.tsx`, `shape-visual.tsx`; only match was the token class `border-surface-border` (a legitimate token name containing "border-s...", not a raw color). The only hex literals live in `types/canvas.ts`'s `NODE_COLORS` data table, which is exactly where the spec says palette data belongs.
- `components/ui/*` untouched — confirmed, no `components/ui` files in the diff stat.
- `components/editor/canvas.tsx` and `components/editor/shape-panel.tsx` confirmed untouched via `git diff` (not just trusting Dev Notes) — matches this spec's Scope Limits and Dev's claim.
- Test files follow the `*.test.tsx` convention, colocated with source, `jsdom` docblock present on component tests, per `code-standards.md`.

### Error handling

- `useUpdateCanvasNode()` returning `null` outside the provider is handled the same way as spec 14 (optional chaining `updateNodeData?.(...)`) — `handleColorSelect` in `canvas-node.tsx` uses the same `?.` pattern already established for label edits, so a toolbar click in an unprovisioned context silently no-ops rather than throwing. Consistent with existing precedent; no new failure mode introduced by this spec that isn't already handled the same way as the rest of `CanvasNode`.
- No new external/untrusted input is introduced by this spec (swatch clicks only ever pass a `NodeColorPair` object pulled directly from the fixed `NODE_COLORS` array — never user-typed or externally-sourced), so `code-standards.md`'s "validate unknown external input at system boundaries" doesn't add new obligations here.

### Housekeeping

- `context/progress-tracker.md` updated accurately — "In Progress" section for spec 15 lists the real files touched, matches the actual diff; "Current Phase"/"Current Goal"/"Next Up" correctly reflect handoff to QA.
- `context/ui-context.md` updated with the real `NODE_COLORS` constant reference and a new "Node Color Toolbar" convention section — verified against the actual diff, content matches implementation (positioning value, active/hover styling, dispatch mechanism).

### Issues found

None. No bugs and no spec gaps identified. Minor, non-blocking observation (not logged as an issue): `CanvasNodeData.textColor` is now a required field, and no starter-template canvas snapshots exist yet in the codebase to check for missing `textColor` values — this is correctly out of this spec's scope (Starter System Designs is a later spec per `architecture-context.md`) and not something Dev or Analyst need to act on now.

QA passed — ready for Product Owner review.

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Success-criteria fit

`project-overview.md` doesn't name node coloring as a discrete success criterion, but this spec continues the same trajectory as specs 13 and 14: it makes the shared canvas (Success Criterion 2, "multiple users can collaborate in the same canvas simultaneously") a genuinely usable diagramming surface rather than a bare shape-drop target. Spec 13 gave shapes their correct geometry; spec 14 added resize and label editing; this spec adds the last commonly-needed at-rest visual attribute (color-coding by role/status) through the same collaborative-sync path spec 14 established — no new mechanism, no new trust boundary. It also indirectly de-risks Success Criteria 4/5 (AI-generated architecture, spec generation): a canvas where nodes can be visually distinguished by color is a more useful substrate for both AI-authored diagrams and for a human-readable Markdown spec derived from the graph later. This is a real, if incremental, product improvement — not a cosmetic-only add that merely satisfies the brief's letter.

### Scope check (independently verified, not just trusting Dev/QA claims)

Ran `git diff spec/14-node-editing spec/15-nodes-color-toolbar` directly:

- **Diff stat** touches exactly: `types/canvas.ts`, `lib/canvas-shapes.ts` (additive only), `components/editor/shape-visual.tsx`, `components/editor/canvas-node.tsx`, `components/editor/node-color-toolbar.tsx` (new), `context/ui-context.md`, `context/progress-tracker.md`, `context/spec-status/15-nodes-color-toolbar.md`, and matching test files. `components/editor/canvas.tsx` and `components/editor/shape-panel.tsx` are **absent** from the diff stat — confirms drag/drop, node-creation, and selection logic are genuinely untouched, matching acceptance criterion 11 and this spec's own Scope Limits.
- Read the full diffs of `types/canvas.ts`, `lib/canvas-shapes.ts`, `shape-visual.tsx`, `canvas-node.tsx`, and `node-color-toolbar.tsx` directly (not summaries). Confirmed: `NODE_COLORS` is genuinely new palette data (not a duplicate of an existing theme token — matches the Analyst brief's own grep-verified premise), `createDroppedNode`'s change is additive only, `ShapeVisual`'s `textColor` prop is optional with a safe default (so the shape-panel's label-less preview elements needed no change — verified `shape-panel.tsx` is byte-for-byte absent from the diff), and the toolbar component has no hex-input, no `<input type="color">`, and carries `nodrag nopan` — confirmed directly in the component source, not just the test file.
- `shape-visual.tsx` being touched here is correctly *not* scope creep — the Analyst brief flagged this explicitly (Open Question #1) as required by this spec's own literal text ("the text automatically updates to its paired text color"), distinct from specs 13/14 which correctly left it alone for their narrower scope. This spec's edit is the minimal one (an optional prop replacing a hardcoded value) and doesn't touch shape geometry, selection styling, or anything else in that file.
- No touches to `prisma/schema.prisma`, `app/api/*`, billing, permission tiers, or any other item on `project-overview.md`'s Out of Scope wall. No server call introduced (`data.textColor`/`data.color` flow entirely through the existing Liveblocks-synced `onNodesChange` path, same as spec 14's label edits) — matches acceptance criterion 8 and the brief's "no server calls" instruction.

### progress-tracker.md accuracy

The "In Progress" entry for spec 15 accurately lists the real files touched and matches the diff I independently reviewed above — no aspirational or partial claims. It correctly reflects what QA verified (all 12 acceptance criteria, all four mechanical gates, byte-level scope confirmation), not merely what Dev attempted. It will be moved to "Completed" as part of this review, per this spec's pipeline instructions, once the PR is opened below.

### Rough edges considered and judged non-blocking

- `CanvasNodeData.textColor` is now a required field with no starter-template canvas snapshots yet in the codebase to check against. QA logged this as a non-blocking observation; I agree — Starter System Designs is an explicitly later, separate feature area per `architecture-context.md`, and there's nothing today that could construct a `CanvasNodeData` missing `textColor` (both `createDroppedNode` and the type itself enforce it). This won't block that later spec's Analyst pass from accounting for it.
- No live browser verification was possible in this pipeline (consistent with every canvas spec so far). Dev's recommended human smoke test (select a node, confirm the 8-swatch toolbar, click a non-default swatch, confirm live sync across two tabs, confirm hover glow is tight/non-blurry) is a reasonable pre-merge check for the human, not a blocker for this recommendation — same treatment given to specs 11-14.

### Conclusion

No changes requested. This spec is a clean, correctly-scoped, single-round pass — genuinely advances the canvas toward Success Criterion 2 without drifting into any Out of Scope territory, and the delivered functionality matches both the brief's letter and its underlying product intent (color-coding as a real diagramming affordance, not just a decorative toggle).
