# Spec 14 — Node Editing

## Analyst Brief

### Scope statement

This spec adds two interaction affordances to existing canvas nodes — drag-to-resize (with a minimum size floor) and double-click-to-edit inline labels — both wired through the same `onNodesChange` flow that already syncs node state to the shared Liveblocks room. It does not touch shape rendering, node creation, the shape panel, or drag-and-drop — those stay exactly as spec 13 left them.

### Concrete deliverables

- `components/editor/canvas-node.tsx` (modified) — the primary surface for this spec:
  - Add `@xyflow/react`'s built-in `<NodeResizer nodeId={id} isVisible={selected} minWidth={…} minHeight={…} />` (confirmed present in the installed `@xyflow/react@^12.11.3`). Rendered alongside — not inside — `<ShapeVisual>`, so `ShapeVisual` itself stays untouched (satisfies the Scope Limit "don't change shape rendering").
  - Add double-click handling on the label/center area to enter an editing state (local `useState`), rendering a `<textarea>` in place of the label `<span>`/placeholder — passed through `ShapeVisual`'s existing `children` slot, so centering/placeholder positioning is inherited for free rather than reimplemented.
  - Close editing on blur or `Escape`; commit the typed value as the new label on each keystroke or on close (see Open Questions #2 for which).
  - Apply React Flow's `nodrag`/`nopan` convention (already used internally by `NodeResizer`'s own controls, confirmed by reading `@xyflow/react`'s source) to the textarea/edit wrapper so text selection and typing don't trigger node drag or canvas pan.
- A new mechanism for `CanvasNode` to dispatch label updates back through `onNodesChange` — see Open Questions #1, this is the one piece of real design work in this spec, not just a styling addition. Likely lands as either:
  - A small React context provided by `CanvasFlow` (in `components/editor/canvas.tsx`) exposing an update-node-data callback, consumed by `CanvasNode`; or
  - A new hook in the top-level `hooks/` folder (per `architecture-context.md`'s Hooks Convention) wrapping that context access, e.g. `hooks/use-update-canvas-node.ts`.
  Left to Dev's discretion, but whichever shape it takes, `components/editor/canvas.tsx` is a likely-modified file for this spec (to thread the callback down), which is in scope — the spec's own Scope Limits restrict *drop/creation* behavior in `canvas.tsx`, not all editing of `canvas.tsx`.
- `lib/canvas-shapes.ts` (possibly modified) — if a minimum-size floor is expressed per-shape (see Open Questions #3), a `SHAPE_MIN_SIZES` table alongside the existing `SHAPE_DEFAULT_SIZES` is the natural, consistent place for it.
- `context/ui-context.md` (likely modified) — this spec makes concrete, previously-undocumented decisions (resize-handle styling, textarea-overlay editing convention) that should be recorded under Canvas, per "Keeping Docs In Sync," the same way specs 12/13 documented the shape-panel and shape-rendering conventions they introduced.
- Test files alongside changed components (`components/editor/canvas-node.test.tsx`, already exists from specs 12/13 — expected to gain resize/edit-state coverage), per `code-standards.md`'s Testing section.

### Acceptance criteria

1. A selected node shows resize handles; an unselected node does not.
2. Dragging a resize handle updates the node's `width`/`height` through the existing `onNodesChange` flow (i.e. the same mechanism `useLiveblocksFlow` already syncs to the Liveblocks room — confirmed at the library level: `NodeResizer`'s internal `triggerNodeChanges` reads and calls the `onNodesChange` prop passed to `<ReactFlow>`, which is `useLiveblocksFlow`'s `onNodesChange`).
3. A node cannot be resized below a defined minimum width/height (exact values are an open question — see Open Questions #3).
4. Resize handles are visually subtle and use existing dark-canvas tokens (no raw hex/`zinc-*` classes), consistent with `code-standards.md`'s Styling rules.
5. Double-clicking a node's center/label area opens inline editing.
6. While editing, a `<textarea>` is shown directly over the label, in the same centered position the label/placeholder occupies at rest — no layout shift when entering or leaving edit mode.
7. When the label is empty, placeholder text ("Untitled," per the existing spec-12/13 convention) shows in the same centered position, both at rest and while editing.
8. Typing in the textarea updates the node's label, propagated through the existing collaborative sync flow (same `onNodesChange`-based path, not a local-only state update — see Open Questions #1's sync-correctness gotcha).
9. Editing closes on blur or on `Escape`.
10. Clicking, dragging to select text, or typing inside the textarea does not start a node drag or a canvas pan (verify via React Flow's `nodrag`/`nopan` class convention).
11. Shape rendering (`ShapeVisual`, `canvas-node.tsx`'s shape branch), the shape panel, its drag preview, and dropped-node creation (`lib/canvas-shapes.ts`'s `createDroppedNode`/ID generation/payload parsing) are unchanged from spec 13 — verify via `git diff`, not just Dev's claim (established precedent from specs 12→13 QA).
12. `npm run build` and `npx tsc --noEmit` pass without type errors; `npx eslint .` passes with no new errors (mechanical gate consistent with specs 06–13, beyond the spec text's own narrower "Check When Done" list).

### Dependencies

- Spec 11 (Base Canvas) — **complete**. Provides `useLiveblocksFlow`'s `onNodesChange`/`nodes` sync wiring this spec's resize and label updates must both go through.
- Spec 12 (Shape Panel) — **complete**. Provides `CanvasNode`, `createDroppedNode` (which already sets `width`/`height` as top-level `Node` fields — the exact fields `NodeResizer` mutates), and the existing empty-label/"Untitled" placeholder convention this spec must preserve during editing.
- Spec 13 (Node Shape) — **complete, direct predecessor**. Provides `ShapeVisual` (the shared shape-geometry component `CanvasNode` renders through — this spec adds editing/resize *around* it, not inside it) and the selected-state border/token conventions (`border-surface-border`/`border-brand`) this spec's resize-handle styling should stay visually consistent with.
- `@xyflow/react@^12.11.3`'s built-in `NodeResizer`/`NodeResizeControl` components — confirmed present in the installed package version; this spec does not need to hand-build resize-handle drag logic from scratch.
- Liveblocks React Flow's `onNodesChange` type is React Flow's own `OnNodesChange<N>` (confirmed via `@liveblocks/react-flow`'s `.d.ts`) — supports `"replace"` (full-node update, for label) and `"dimensions"` (for resize, already what `NodeResizer` emits internally) change types, both flowing through the one already-wired sync path. No new Liveblocks-specific API is needed.

### Open questions

1. **How does `CanvasNode` — a leaf component with no access to `onNodesChange` — dispatch a label update back through it?** `NodeProps` doesn't include update callbacks, and `onNodesChange` currently lives only in `CanvasFlow` (`components/editor/canvas.tsx`). Two tempting shortcuts are both traps worth flagging explicitly:
   - Embedding a callback function directly in `data` (e.g. `data.onLabelChange`) would break Liveblocks Storage sync — `useLiveblocksFlow`'s node `data` is expected to stay JSON-serializable (per its `ToLson`/sync-config typing), and functions aren't serializable.
   - Calling `useReactFlow().setNodes()`/`updateNodeData()` directly from inside `CanvasNode` mutates React Flow's *internal* store, but `<ReactFlow nodes={nodes}>` here is controlled from `useLiveblocksFlow`'s `nodes` — a local-only store mutation risks silently not reaching Liveblocks Storage (so it wouldn't sync to other participants or survive a refresh), which is exactly the failure mode acceptance criterion 8 and the spec's own "through the existing sync flow" line are guarding against.
   **Recommendation:** thread a small update callback down via React context provided by `CanvasFlow`, dispatching a `"replace"` `NodeChange` through the real `onNodesChange` — genuinely going through the same synced path `NodeResizer`'s internal dimension changes already use. Exact shape (context vs. a `hooks/` hook wrapping it) left to Dev's discretion.

2. **Commit-on-every-keystroke vs. commit-on-close.** The spec says "update the label as users type," which reads as live/per-keystroke updates (matching the "collaborative" framing — other participants should see the label change live, not just after the fact). **Recommendation:** dispatch the `"replace"` change on every `onChange`, not just on blur/Escape — consistent with the literal spec text. Flagging as a recommendation since the spec doesn't explicitly address collaborative-typing behavior (e.g. whether concurrent editors overwriting each other's keystrokes is a concern) — no debounce/throttle is specified anywhere, and inventing one would be scope growth beyond this spec's text.

3. **Minimum resize size is not specified anywhere** — not in this spec's text, `ui-context.md`, or `project-overview.md`. `lib/canvas-shapes.ts`'s `SHAPE_DEFAULT_SIZES` gives each shape's *default* size but no floor. **Recommendation:** a modest per-shape or flat minimum (e.g. 40×40, well below every shape's current default) that prevents a node from collapsing to an unusable sliver or empty box, without being large enough to feel arbitrary or block legitimate shrinking. Flagging as a recommendation, not a decision — Dev should pick a concrete, documented number and record it in `ui-context.md` per "Keeping Docs In Sync," since nothing pins this today.

4. **Resize-handle visual styling is not specified.** `ui-context.md`'s existing "Connection Handles" convention (small white circles, hidden until hover) describes a *different* React Flow primitive (`<Handle>`, for edge connections) that isn't even implemented on `CanvasNode` yet (confirmed — no `<Handle>` elements exist in the current file; edges are out of scope, see below) — it isn't automatically the right visual for resize handles. **Recommendation:** style `NodeResizer`'s handles/lines using the same subtle-at-rest/brand-accent-when-active token pairing spec 13 established for node borders (`--border-default`/`--accent-primary`), so resize handles read as part of the same "selected node" visual language rather than introducing a third, unrelated visual convention. Flagging as a recommendation since the spec only says "subtle and consistent," not a specific token.

5. **No open question on sync mechanism for resize itself** — confirmed at the library level (see Dependencies) that `NodeResizer`'s dimension changes already flow through the same `onNodesChange` prop `useLiveblocksFlow` wires up, with zero additional plumbing needed. This is a lower-risk part of the spec than label editing.

### Out-of-scope callouts

- **Shape rendering changes** — explicitly excluded by this spec's own Scope Limits ("don't change shape rendering from the previous unit"). `ShapeVisual` (spec 13) is expected to stay untouched; resize/edit UI is added around it via `CanvasNode`, not inside it.
- **Shape panel or drag preview changes** — explicitly excluded by this spec's Scope Limits ("don't change the shape panel or drag preview"). `shape-panel.tsx` is not expected to be touched.
- **How dropped nodes are created** — explicitly excluded by this spec's Scope Limits ("don't change how dropped nodes are created"). `createDroppedNode`, ID generation, and drop-position math in `lib/canvas-shapes.ts` stay untouched (a possible `SHAPE_MIN_SIZES` addition alongside `SHAPE_DEFAULT_SIZES` is additive, not a change to creation logic).
- **Connection handles / edge creation** — `ui-context.md`'s "Connection Handles" section describes a convention for a `<Handle>` element that doesn't exist in `CanvasNode` yet; nothing in this spec's text mentions edges, connections, or handles for connecting nodes. Not in scope here — presumably a later spec's job.
- **Color picker / `NODE_COLORS` palette** — not mentioned in this spec's text; nodes keep using `DEFAULT_NODE_COLOR`/`DEFAULT_NODE_TEXT_COLOR` as before.
- **Multi-select resize, keyboard-driven resize, or resize aspect-ratio locking** — not mentioned in the spec text; `NodeResizer`'s default (single-node, free-aspect-ratio) behavior is sufficient.
- **Rich text formatting in labels** — the spec says "textarea," implying plain text; no markdown/formatting is implied or requested.
- **Billing, enterprise permission tiers, versioned spec history, production object storage migration, mobile apps** — `project-overview.md`'s Out of Scope wall; nothing in this spec's text comes near any of these.

## Handoff

Brief ready for Senior Developer at `context/spec-status/14-node-editing.md`.

## Dev Notes

### Files added/changed

- `components/editor/canvas-node.tsx` (modified) — added `<NodeResizer nodeId={id} isVisible={selected} minWidth={NODE_MIN_SIZE.width} minHeight={NODE_MIN_SIZE.height}>` as a sibling of `ShapeVisual` (rendered *after* it in JSX/DOM order — its controls are `position: absolute` in `@xyflow/react`'s own `style.css`, and for the SVG-shape branch `ShapeVisual`'s own root is `position: relative`, i.e. also a positioned element, so later-DOM-order is what guarantees the resize handles paint above the shape rather than under it; for the CSS-shape branch, `ShapeVisual`'s root is `position: static`, so the absolutely-positioned resize controls always win regardless of order — reordering was purely to keep the paint order correct in both branches, not a functional requirement). Handles styled `border-brand`/`bg-base` (small circles), the connecting line `border-surface-border`, both with `!important` (`handleClassName`/`lineClassName`) since `@xyflow/react/dist/style.css`'s own selectors could otherwise win the cascade depending on Next's CSS chunk ordering. Added double-click-to-edit: local `useState` `isEditing`, a `<textarea>` rendered in the same `children` slot the label `<span>`/placeholder already occupies (so `ShapeVisual`'s centering is inherited, not reimplemented), wrapped in a `nodrag nopan` `<div>` so clicking/selecting/typing doesn't start a node drag or canvas pan. `onChange` dispatches the new label on every keystroke via `useUpdateCanvasNode()`; closes on blur or `Escape`.
- `hooks/use-update-canvas-node.ts` (new) — `CanvasNodeUpdateContext` (a React context typed `UpdateCanvasNodeData = (nodeId: string, data: Partial<CanvasNodeData>) => void`) and the `useUpdateCanvasNode()` consumer hook, per Open Questions #1's recommendation. This is the "one piece of real design work" the brief called out — see Key Decisions below.
- `components/editor/canvas.tsx` (modified) — `CanvasFlow` builds `updateNodeData` (`useCallback`, deps `[nodes, onNodesChange]`): looks up the node by ID in the current `nodes` array, merges the partial `data` patch, dispatches `onNodesChange([{ id, type: "replace", item: updatedNode }])` — a real `NodeReplaceChange`, confirmed against `@xyflow/system`'s `changes.d.ts` and `@liveblocks/react-flow`'s `flow.js` (`applyNodeChanges`'s `"replace"` branch calls `existing.reconcile(change.item, config)` on the room's Liveblocks `LiveMap` entry — genuinely synced, not a local-only mutation). Wraps `<ReactFlow>` in `<CanvasNodeUpdateContext.Provider value={updateNodeData}>`. No changes to `onDragOver`/`onDrop`/node-creation.
- `lib/canvas-shapes.ts` (modified, additive only) — `NODE_MIN_SIZE = { width: 40, height: 40 }` per Open Questions #3's recommendation (flat minimum, not per-shape — nothing in the spec text or `ui-context.md` calls for per-shape floors, and a flat number is simpler and still comfortably below every `SHAPE_DEFAULT_SIZES` entry, including pill's 60px height, the smallest). `createDroppedNode`/`generateNodeId`/drop-position math untouched — confirmed via `git diff`.
- `context/ui-context.md` (modified) — added "Node Resize" and "Node Label Editing" subsections under Canvas, documenting the handle/line token styling, `NODE_MIN_SIZE`, the textarea-overlay convention, and the live-per-keystroke sync mechanism.
- `components/editor/canvas-node.test.tsx` (modified) — all renders now go through a `renderNode`/`rerenderNode` helper that wraps in `<ReactFlowProvider>` (required once `<NodeResizer isVisible={true}>` actually renders — its `NodeResizeControl` children call `useStoreApi()`, which throws outside a React Flow store context; this wasn't needed pre-spec-14 since `CanvasNode` had no React Flow store dependency) and `<CanvasNodeUpdateContext.Provider>` (default `null`, overridable per test so label-dispatch tests can pass a `vi.fn()` spy). One pre-existing test ("applies the node's fill color…") had to change from asserting on `screen.getByText("X").parentElement` to `container.firstElementChild`, since that element is now the new `nodrag nopan` wrapper div (no color styling) rather than `ShapeVisual`'s own bordered/colored root — a direct, expected consequence of adding the editable wrapper, not a behavior regression. New coverage: resize handles present only when selected, min-size sanity check, double-click opens editing with the current label/placeholder in the textarea, per-keystroke dispatch through the context (including a "no context provided" non-throwing case), close-on-blur, close-on-Escape, and `nodrag`/`nopan` classes on the editable wrapper.
- `hooks/use-update-canvas-node.test.tsx` (new) — confirms the hook returns `null` outside the provider and returns/forwards calls to the provided function inside it.
- `lib/canvas-shapes.test.ts` (modified) — added a bounds check that `NODE_MIN_SIZE` is positive and strictly below every shape's default size.

### Skills used

- `liveblocks-best-practices` (via the Skill tool) — checked the `multiplayer-react-flow` reference for any documented pattern for dispatching per-node data updates from a leaf custom node component. It only documents the base `useLiveblocksFlow` setup (already in place from spec 11/12); no additional pattern beyond what the brief's own source-reading already established, so the brief's recommended context-based approach was used as-is.

### Key decisions

1. **Open Questions #1 (update mechanism): React context, not a `hooks/`-only wrapper.** Implemented as `CanvasNodeUpdateContext` provided by `CanvasFlow`, consumed via `hooks/use-update-canvas-node.ts`'s `useUpdateCanvasNode()`. Went with context (not a hook that itself calls `useReactFlow()`) because the brief's own gotcha #2 is specifically about `useReactFlow()`-based mutation being unsafe here — the update has to be built from `CanvasFlow`'s real `nodes`/`onNodesChange`, not recomputed independently by each leaf consumer.
2. **Open Questions #2 (commit cadence): per-keystroke, as recommended.** `onChange` dispatches immediately on every keystroke, no debounce/throttle — matches the spec's literal "update the label as users type" and avoids inventing scope (a debounce mechanism) the spec doesn't ask for. Confirmed via reading `@liveblocks/react-flow`'s `useLiveblocksFlow` source that `onNodesChange` is a Liveblocks `useMutation`, which applies changes to the room's Storage synchronously/optimistically on the local client before the network round-trip — so per-keystroke dispatch doesn't introduce input lag from waiting on a server round-trip.
3. **Open Questions #3 (minimum size): flat 40×40, not per-shape.** Recorded in `ui-context.md` and `lib/canvas-shapes.ts`'s doc comment.
4. **Open Questions #4 (resize-handle styling): brand-accent handles, subtle line.** Handles (`border-brand`/`bg-base`) use the same brand token the node's own border already switches to when selected (they only ever render alongside that state); the connecting line stays `border-surface-border` so the whole selected-node affordance doesn't read as two competing brand-colored outlines.
5. **Textarea sizing: HTML `rows`/`cols` attributes, not percentage CSS width.** `ShapeVisual`'s SVG-shape branch wraps `children` in a shrink-to-fit flex item (`<div className="relative z-10 px-3 text-center text-sm">`, no explicit width) — giving the textarea `w-full`/`h-full` there would resolve against an as-yet-undetermined percentage base and risk collapsing to zero. Using the textarea's native intrinsic sizing (`rows={1}`, default `cols`) avoids that entirely and keeps the wrapper structurally identical (single child, no forced dimensions) between the rest and editing states, satisfying acceptance criterion 6's "no layout shift." Not explicitly specified by the brief; flagged here as a Dev-level styling call, same footing as spec 13's SVG coordinate choices.
6. **DOM order: `ShapeVisual` before `NodeResizer`** (opposite of the brief's example JSX order) — purely to keep resize-handle paint order correct given `ShapeVisual`'s two branches have different `position` values; no functional/behavioral difference either way, just a defensive ordering choice. See the file-level comment in `canvas-node.tsx` for the CSS reasoning.

### Test coverage added

- `components/editor/canvas-node.test.tsx`: resize handles shown only when selected; `NODE_MIN_SIZE` sanity; double-click opens editing (populated and empty-label/placeholder cases); per-keystroke dispatch through context (`vi.fn()` spy) and a no-context-provided non-throwing case; close-on-blur; close-on-Escape; `nodrag`/`nopan` classes present on the editable wrapper. All pre-existing spec-12/13 tests retained and passing (one updated to account for the new wrapper div, per Key Decisions).
- `hooks/use-update-canvas-node.test.tsx`: `null` outside the provider, forwards calls correctly inside it.
- `lib/canvas-shapes.test.ts`: `NODE_MIN_SIZE` positive and below every shape's default.

Commands run, all passing:
- `npx tsc --noEmit` — pass, no errors.
- `npx eslint .` — pass, 0 errors (1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/…`, unrelated to this spec, not touched).
- `npx vitest run` — 193/193 passing across 26 files (up from 180/25 at the end of spec 13).
- `npx next build` — pass, compiles and generates the route manifest with no errors.

### Known limitations / deferrals

- No live browser/manual verification of drag-resize or double-click-edit interactions — consistent with this pipeline's prior specs (11–13), which have all flagged the same "no interactive browser session available" limitation and recommended a human smoke test before considering the spec fully done. Recommended smoke test: select a node, drag each of the 8 resize handles and confirm it won't shrink below ~40×40 and that a second browser tab sees the resize live; double-click a node's label, type, confirm the second tab sees the label update live as you type, then confirm blur/Escape both close editing without losing the typed text.
- Textarea is single-line-sized (`rows={1}`, no auto-grow); a very long label will horizontally scroll within the textarea rather than wrapping. Not specified by the brief ("textarea" only, no multi-line/growth requirement) — flagged as a reasonable MVP choice, not a gap against any acceptance criterion.
- `updateNodeData`'s `useCallback` identity changes whenever `nodes` changes (i.e. on most canvas interactions, including other users' concurrent edits) since it closes over the live `nodes` array to look up the target node. This is a minor referential-stability cost, not a correctness issue — flagged in case a future spec cares about it for a `React.memo`-wrapped `CanvasNode`.

## QA Report

**Overall verdict: FAIL**

### Mechanical gate

All commands independently reproduced on branch spec/14-node-editing (commit bfb4e56):

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS - no errors |
| `npx eslint .` | PASS - 0 errors, 1 pre-existing unrelated warning in `.agents/skills/clerk-tanstack-patterns/...` |
| `npx vitest run` | PASS - 193/193 tests, 26 files |
| `npx next build` | PASS - compiles, route manifest generated with no errors |

Matches the Dev Notes claims exactly.

### Acceptance criteria

1. Selected node shows resize handles, unselected does not - PASS. NodeResizer isVisible={selected}; test coverage confirms .react-flow__resize-control present only when selected.
2. Dragging a resize handle updates width/height through onNodesChange - PASS (code-review/library-level verification only, no live browser session available - consistent with this pipeline prior specs documented limitation). nodeId={id} correctly wired, no custom resize logic that could diverge from NodeResizer own onNodesChange-based dispatch.
3. Cannot resize below a defined minimum - PASS. NODE_MIN_SIZE = width 40 height 40 in lib/canvas-shapes.ts, passed as minWidth/minHeight, well below every SHAPE_DEFAULT_SIZES entry; bounds-checked in lib/canvas-shapes.test.ts.
4. Resize handles subtle, token-based (no raw hex/zinc classes) - PASS. handleClassName/lineClassName use border-brand, bg-base, border-surface-border, all confirmed CSS-custom-property-backed tokens in app/globals.css (--accent-primary, --bg-base, --border-default), not raw Tailwind palette classes.
5. Double-click node center/label area opens inline editing - PASS, with a UX caveat. The onDoubleClick handler lives on the nodrag nopan wrapper div, which shrink-wraps to the label span/placeholder own content box rather than filling the node full center area. Double-clicking directly on the label/placeholder text opens editing (verified in tests and by code review); double-clicking elsewhere inside the node visual bounds but outside that shrink-wrapped text does nothing. This is a defensible reading of the spec center/label area wording, so not failing the criterion outright, but flagging as a minor hit-target gap - see Issues below.
6. Textarea shown directly over label in the same centered position, no layout shift - FAIL. See Issue 1 below.
7. Placeholder text in same centered position at rest and while editing - PASS. At rest a span shows Untitled; while editing the textarea placeholder is Untitled, both inside the same children slot ShapeVisual centers. Test-covered.
8. Typing updates label through the existing sync flow, not local-only - PASS. canvas.tsx updateNodeData looks up the node in useLiveblocksFlow real nodes, merges the patch, and dispatches a genuine onNodesChange replace change - confirmed by code review this is the same prop passed to ReactFlow onNodesChange, not a useReactFlow-store-only mutation or a non-serializable callback embedded in data.
9. Editing closes on blur or Escape - PASS. Test-covered for both.
10. Text interactions do not trigger node drag/canvas pan - PASS. nodrag nopan classes present on the wrapper at all times (rest and editing); test-covered.
11. Shape rendering, shape panel, drag preview, dropped-node creation unchanged from spec 13 - PASS, independently verified via git diff on shape-visual.tsx and shape-panel.tsx (empty diff, byte-for-byte untouched) and git diff on lib/canvas-shapes.ts (purely additive NODE_MIN_SIZE constant; createDroppedNode/generateNodeId/drop-position math untouched).
12. npm run build / npx tsc --noEmit / npx eslint . pass - PASS, see Mechanical gate above.

### Architecture invariants

No violations found. No long-running AI work introduced, no metadata/blob storage boundary touched, no auth/ownership mutation surface added (canvas-only client-side interaction), CanvasNode/CanvasFlow remain appropriately client components (already were).

### Standards compliance

- No raw Tailwind color classes (zinc-, slate-) or hex values introduced in the diff (grep came back empty on the changed files).
- No any usage introduced.
- components/ui/* untouched (not part of this diff).
- ShapeVisual (components/editor/shape-visual.tsx) genuinely untouched, per Scope Limits.

### Issues

1. [Bug -> Dev] components/editor/canvas-node.tsx, the editing textarea branch around line 78-87 - the editing textarea has no explicit width constraint (no w-full, max-w-full, or cols prop; only rows=1). Per the HTML living standard, a textarea with no cols attribute defaults to a suggested width of 20 characters, which for a text-sm node label renders at roughly 150 to 180px depending on font metrics, independent of the node actual box size. ShapeVisual containers (both the CSS-shape branch flex/px-3 div and the SVG-shape branch relative/px-3 div) have no overflow-hidden, so this textarea will very likely render wider than, and visually spill out of, the node shape boundary for every node at or near its size floor or common default: the flat NODE_MIN_SIZE (40x40), the default circle (80x80), cylinder (100x120), and hexagon (140x100) are all narrower than the textarea default intrinsic width, even before subtracting the px-3 padding. This directly undermines acceptance criterion 6, no layout shift / same centered position intent - instead of occupying the label footprint, the textarea will overhang the node during editing. Dev Notes Key Decision 5 addressed the under-sizing risk (percentage width against an undetermined base) but not the over-sizing risk from the browser cols=20 default. Recommend constraining the textarea rendered width to the node available box, e.g. adding max-w-full combined with box-sizing border-box, or setting a cols value tied to font metrics, and confirming with a manual/browser check (Dev Notes own Known Limitations section already flags no browser session was available for this spec, so this specific case was not caught).
2. [Bug -> Dev, minor/non-blocking] components/editor/canvas-node.tsx, the nodrag nopan wrapper div with onDoubleClick around line 76 - the onDoubleClick handler is bound to the nodrag nopan wrapper div, whose box shrink-wraps to the label/placeholder text own content size rather than the node full center area. For nodes with a short label (or the Untitled placeholder) inside a larger shape, double-clicking near-but-not-exactly-on the text does not open editing, even though it is within what a user would perceive as the node center/label area. Consider widening the double-click hit target (e.g. h-full w-full on the wrapper, matching ShapeVisual own centered flex box) so the whole label region, not just the tightly-wrapped text glyphs, is double-clickable. Not failing acceptance criterion 5 outright since double-clicking the visible text does work and is test-covered, but worth a follow-up fix alongside Issue 1 since both touch the same wrapper.

### Housekeeping

context/progress-tracker.md and context/ui-context.md were both updated appropriately: progress tracker reflects Senior Developer pass done, QA next, with an accurate summary of files touched, and ui-context.md gained Node Resize and Node Label Editing subsections under Canvas documenting the handle/line tokens, NODE_MIN_SIZE, and the textarea-overlay/live-sync convention, consistent with Keeping Docs In Sync.

QA failed - see issues above. Routing to Dev (both issues are implementation/styling fixes on components/editor/canvas-node.tsx, not ambiguity in the brief - the brief textarea directly over the label, no layout shift language is clear enough that this is a Dev-level CSS-containment fix, not a spec gap).

## Dev Notes — QA bugfix round

### Files changed

- `components/editor/canvas-node.tsx` (modified) — fixed both QA-reported bugs, no other files touched (confirmed via `git diff`/`git status`; scope stayed within the Scope Limits, no change to `shape-visual.tsx`, the shape panel, or node creation/drop logic).

### Fixes

1. **Issue 1 (blocking) — textarea overflowing the node's shape boundary.** The editing `<textarea>` now carries `box-border w-full min-w-0 max-w-full` alongside its existing classes, and the `nodrag nopan` wrapper `<div>` around both the textarea and the label/placeholder now carries `flex h-full w-full min-w-0 items-center justify-center` (previously it had no layout classes at all, so it shrink-wrapped to content). The `min-w-0` on both the wrapper and the textarea is the load-bearing part of this fix, not just `w-full`/`max-w-full`: a bare `width: 100%` on a descendant of an auto-sized flex item (the SVG-shape branch's intermediate `px-3` div in `ShapeVisual`, which this spec cannot touch) is treated as `auto` during that ancestor's own intrinsic (max-/min-content) size computation per the CSS sizing algorithm, so without overriding the textarea's default automatic minimum width (which is what produces the ~150–180px unshrinkable floor QA measured), the ancestor's flex-shrink would still be capped at that floor and the overflow would persist. Setting `min-width: 0` on the textarea (and defensively on the wrapper, since the wrapper itself is the direct flex item in the CSS-shape branch) removes that floor, letting the whole chain shrink down to whatever width the node's real box actually provides in both `ShapeVisual` branches (CSS-shape: rectangle/pill/circle: the wrapper is the flex item directly; SVG-shape: diamond/hexagon/cylinder: the wrapper is nested inside `ShapeVisual`'s own `px-3` flex item) — verified by reasoning through both branches' flex layout, not a live browser session (still unavailable in this pipeline, per the original Dev Notes' Known Limitations — flagging that this reasoning-based verification, like the rest of this spec's resize/edit behavior, should still get a human smoke test before being considered fully proven).
2. **Issue 2 (minor) — double-click hit target too small.** The same wrapper `<div>` change above (`flex h-full w-full items-center justify-center`) also fixes this: the wrapper now fills the space `ShapeVisual` gives it instead of shrink-wrapping to the label/placeholder text's own content box, so `onDoubleClick` (still bound to that same wrapper) fires across that filled area rather than only the tight text glyphs. In the CSS-shape branch (rectangle/pill/circle) this reaches the node's full interior (minus `ShapeVisual`'s own `px-3` padding/border). In the SVG-shape branch (diamond/hexagon/cylinder) the improvement is bounded by `ShapeVisual`'s own intermediate `px-3` div, which — per the same flex reasoning as Issue 1 — now sizes itself to the available node width rather than shrink-wrapping to the textarea's old oversized intrinsic width, but its height still isn't force-stretched to the node's full height (that div's parent uses `align-items: center`, not `stretch`, and `ShapeVisual` is out of scope to change). This is a partial, in-scope improvement consistent with QA's own suggested fix and framing of this issue as minor/non-blocking, not a full-shape hit target in every branch.
3. **No changes to the double-click handler itself, editing state logic, sync/dispatch mechanism, resize handling, or `NODE_MIN_SIZE`** — both bugs were containable to wrapper/textarea CSS, consistent with QA's own read that this was a Dev-level CSS-containment fix, not a spec or mechanism gap.

### Verification

Commands run, all passing:
- `npx tsc --noEmit` — pass, no errors.
- `npx eslint .` — pass, 0 errors (same 1 pre-existing unrelated warning in `.agents/skills/clerk-tanstack-patterns/…`, untouched by this change).
- `npx vitest run` — 193/193 passing across 26 files (unchanged count — existing `nodrag`/`nopan` class assertions use `toContain`, so they still pass against the wrapper's now-longer class list; no new tests added for this bugfix round since the existing double-click/editing/nodrag-nopan coverage already exercises the changed element, and the bug itself was a CSS-containment issue not expressible in JSDOM's layout-less test environment).
- `npx next build` — pass, compiles and generates the route manifest with no errors.

### Known limitations / deferrals (carried forward)

- Still no live browser/manual verification available in this pipeline. The Issue 1 fix is reasoned through CSS flex-layout mechanics (documented above) rather than confirmed by rendering; recommended smoke test (in addition to the original spec's resize/edit smoke test): shrink a node down to `NODE_MIN_SIZE` (40×40) and to each SVG-shape's default (hexagon 140×100, cylinder 100×120), double-click to edit, and visually confirm the textarea stays within the shape's boundary rather than spilling out.
- The SVG-shape branch's double-click hit target still doesn't cover the node's full vertical extent (see Issue 2 fix notes above) — a `ShapeVisual`-level change would be needed to fully close that gap, which is out of this spec's scope.
