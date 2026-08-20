# Spec 17 — Canvas Ergonomics

## Analyst Brief

### Scope statement

This spec adds a floating pill-shaped control bar (zoom out / fit view / zoom in, a divider, then undo / redo) to the bottom-left of the canvas, wires those buttons to the real React Flow instance (zoom/fit) and Liveblocks history (undo/redo, with buttons disabled and dimmed when nothing is available to undo/redo), adds a `useKeyboardShortcuts` hook that mirrors the same five actions on `window` keydown while ignoring editable fields, and removes the `<MiniMap>`. It does not touch the shape panel, node/edge rendering, or any other canvas control.

### Concrete deliverables

- New file, e.g. `components/editor/canvas-control-bar.tsx` — the pill-shaped control bar: `zoom out` / `fit view` / `zoom in` buttons in one group, a thin divider, then `undo` / `redo` buttons in a second group. Same floating-overlay visual language as `ShapePanel` (`rounded-full`, `bg-elevated`/`border-surface-border`), positioned bottom-left, above `ShapePanel` (which sits bottom-center) — see Open Questions #3 on divider styling and Concrete deliverable below on exact positioning math. Undo/redo buttons use the shadcn `Button` component's native `disabled` prop (its `buttonVariants` already ships `disabled:opacity-50`, satisfying "keep disabled buttons visually dimmed" for free — no custom dimming CSS needed).
- New file, `hooks/use-keyboard-shortcuts.ts` — per the spec's own literal instruction ("Create a `useKeyboardShortcuts` hook in `hooks/`"). Accepts the React Flow instance (or just the specific methods it needs — `zoomIn`/`zoomOut`) and `undo`/`redo` handlers as arguments; attaches a `keydown` listener on `window` in a `useEffect`; ignores the event if `document.activeElement` (or the event target) is an `<input>`, `<textarea>`, or has `isContentEditable`/a `contenteditable` attribute — the same class of elements spec 14/16's inline node-label `<textarea>` and edge-label `<input>` already introduce, so this guard is what keeps `Cmd/Ctrl+Z` from hijacking in-progress label edits.
- `components/editor/canvas.tsx` (modified) — inside `CanvasFlow` (already the component holding `useReactFlow()`, and already nested inside `RoomProvider`/`ClientSideSuspense`, which `useUndo`/`useRedo`/`useCanUndo`/`useCanRedo` require): import and call `useUndo`, `useRedo`, `useCanUndo`, `useCanRedo` from `@liveblocks/react/suspense` (same import path already used there for `LiveblocksProvider`/`RoomProvider`/`useErrorListener` — confirmed via `node_modules/@liveblocks/react/dist/suspense.d.ts`, which re-exports the full `@liveblocks/react` surface including these four history hooks); pass the resulting handlers/booleans into the new `CanvasControlBar` and into `useKeyboardShortcuts`; remove the `<MiniMap />` element (its import from `@xyflow/react` should be dropped too if nothing else in the file uses it).
- `context/ui-context.md` (modified) — add a "Canvas Control Bar" convention section (positioning, grouping/divider, disabled-state styling) under Canvas, following the same documentation pattern established for the Floating Shape Panel section. That existing Floating Shape Panel section's own sentence — "does not overlap the default bottom-right `MiniMap`" — becomes stale once `MiniMap` is removed and needs updating too, per "Keeping Docs In Sync."
- Test files, per `code-standards.md`'s Testing section: `components/editor/canvas-control-bar.test.tsx` (button presence/grouping/divider, zoom clicks call the passed-in instance methods with a duration option, undo/redo click dispatch, disabled state driven by `canUndo`/`canRedo` props); `hooks/use-keyboard-shortcuts.test.ts` (each of the 5 shortcuts fires the right handler, shortcuts are ignored when the active/target element is an input/textarea/contentEditable, listener is added to and removed from `window`); `components/editor/canvas.test.tsx` extended (`MiniMap` no longer rendered, control bar rendered, the four Liveblocks history hooks wired through — needs the existing `@liveblocks/react/suspense` mock in that test file extended with `useUndo`/`useRedo`/`useCanUndo`/`useCanRedo` stubs, the same kind of mock-surface extension spec 16 needed for `Position`/`MarkerType`).

### Acceptance criteria

Directly from the spec's own "Check When Done" list, expanded with the underlying "Implementation" detail so Dev/QA can verify concretely:

1. A pill-shaped control bar renders at the bottom-left of the canvas, positioned above the shape panel (not overlapping it).
2. The control bar contains two groups separated by a thin divider: zoom controls (zoom out, fit view, zoom in) and history controls (undo, redo).
3. Zoom in, zoom out, and fit view buttons each call the real React Flow instance's corresponding method (`zoomIn`/`zoomOut`/`fitView`), each with a short animation (a `duration` option passed to the call — `@xyflow/react`'s own mechanism for an animated viewport transition, not a hand-rolled CSS transition).
4. Undo and redo buttons call Liveblocks' `useUndo()`/`useRedo()` handlers (from `@liveblocks/react`), not a local-only or React-Flow-only history mechanism.
5. The undo button is disabled when `useCanUndo()` is `false`; the redo button is disabled when `useCanRedo()` is `false`.
6. Disabled undo/redo buttons are visually dimmed (opacity reduced, matching the shadcn `Button` component's existing `disabled:opacity-50` behavior).
7. `hooks/use-keyboard-shortcuts.ts` exports a hook that accepts the React Flow instance (or its zoom methods) plus undo/redo handlers, and attaches its keyboard listener to `window`.
8. The five shortcuts are wired and produce the correct action: `+`/`=` → zoom in, `-` → zoom out, `Cmd/Ctrl+Z` → undo, `Cmd/Ctrl+Shift+Z` → redo, `Cmd/Ctrl+Y` → redo.
9. Shortcut handling is skipped when the event originates from (or focus is inside) an input, textarea, or other editable field — so it does not interfere with node label editing (spec 14) or edge label editing (spec 16), both of which use real `<input>`/`<textarea>` elements.
10. The `<MiniMap>` is removed — no minimap renders anywhere on the canvas.
11. No changes to the shape panel, node rendering, edge rendering, or the existing Liveblocks/React Flow collaborative sync setup (`useLiveblocksFlow`, `onNodesChange`/`onEdgesChange`/`onConnect`, the node/edge data-update contexts from specs 14/16) beyond what's needed to read the four new history hooks and remove `MiniMap`.
12. `npm run build` passes (the spec's own explicit check) — applying the project's standard full gate consistent with every prior spec's acceptance criteria: `npx tsc --noEmit`, `npx eslint .`, and `npx vitest run` all pass too.

### Dependencies

- Spec 11 (Base Canvas) — **complete**. Provides `canvas.tsx`'s current structure: `RoomProvider` → `ClientSideSuspense` → `ReactFlowProvider` → `CanvasFlow`, and the existing `<MiniMap>` this spec removes.
- Spec 12 (Shape Panel) — **complete**. Provides `ShapePanel`, the bottom-center pill toolbar the new control bar must sit above without overlapping (the spec's own "It should sit above the shape panel").
- Liveblocks history hooks (`useUndo`, `useRedo`, `useCanUndo`, `useCanRedo`) — already available in the installed `@liveblocks/react` v3.24 dependency (confirmed by reading `node_modules/@liveblocks/react/dist/room-DUr5FIYB.d.ts` and the top-level `index.d.ts` directly, not assumed) — no new package install required. Must be called from a component nested inside `RoomProvider`, which `CanvasFlow` already is.
- `@xyflow/react`'s `useReactFlow()` instance — already installed and already called in `CanvasFlow` (for `screenToFlowPosition`, since spec 12). `zoomIn`/`zoomOut`/`fitView` all accept an optional `{ duration }` for an animated transition (confirmed via `node_modules/@xyflow/react/dist/esm/types/general.d.ts`) — no new library API surface needed beyond what's already installed.
- `architecture-context.md`'s Hooks Convention (new hooks go in top-level `hooks/`) — matches the spec's own literal file path instruction.
- shadcn `Button` component (`components/ui/button.tsx`) — already ships `disabled:pointer-events-none disabled:opacity-50` in its base variant classes, satisfying "keep disabled buttons visually dimmed" without new custom styling.

All listed dependencies are complete per `progress-tracker.md`.

### Open questions

1. **Exact icons for the five buttons aren't named by the spec.** Recommend lucide-react equivalents consistent with the Icons convention (stroke-based, no filled variants): `ZoomIn`, `ZoomOut`, a fit-view icon (e.g. `Maximize` or `Scan`), `Undo2`, `Redo2`. This is a Dev-level choice, the same footing as spec 12's shape-button icon choices.
2. **"Use a short animation so the movement feels smooth" doesn't pin an exact duration.** Neither `ui-context.md` nor `project-overview.md` names one. Recommend a small fixed value (e.g. somewhere in the 150–300ms range) passed as `{ duration }` to `zoomIn`/`zoomOut`/`fitView`, documented in `ui-context.md` once chosen — same precedent as spec 16's Open Questions #3 (exact stroke widths left as a documented Dev-level styling choice).
3. **Divider styling (color, thickness) between the two button groups isn't specified.** Recommend the existing `border-surface-border` token (a single 1px vertical rule), consistent with the "no raw hex/Tailwind color classes" styling rule — not a new visual element needing its own token.
4. **Where should the four Liveblocks history hooks and the React Flow instance be read from, and how should they reach both the control bar and the keyboard-shortcuts hook?** Recommend calling all of them directly in `CanvasFlow` (which already reads `useReactFlow()` and sits inside `RoomProvider`) and passing the resulting values down as props to `CanvasControlBar` and as arguments into `useKeyboardShortcuts` — not introducing a new React context. Unlike specs 14/16's node/edge data-update contexts (needed because a *leaf* `nodeTypes`/`edgeTypes` renderer has no other path back to `CanvasFlow`), both the control bar and the keyboard-shortcuts hook are siblings `CanvasFlow` itself instantiates, so plain props/arguments are sufficient and simpler.
5. **Should recognized shortcut keydowns call `event.preventDefault()`** to stop the browser's own native behavior (e.g. `Cmd/Ctrl` plus `+`/`-` triggering browser zoom, or `Cmd/Ctrl+Y` triggering a browser history action in some browsers)? Not addressed by the spec text. Recommend yes, for any keydown the hook recognizes and acts on — standard practice for an app-level keyboard-shortcut handler, avoids visibly fighting the browser's own default action. A minor implementation detail, not a product decision.
6. **The spec's "ignore shortcuts while typing in inputs, textareas, or editable text fields" rule is the intended (and sufficient) mitigation for shortcut/native-undo collisions inside spec 14/16's inline editing fields** — flagged explicitly only to confirm this is understood as by-design, not a gap this brief is leaving open.

### Out-of-scope callouts

- **Changing the shape panel** — explicit Scope Limit ("don't change the shape panel"). `components/editor/shape-panel.tsx` stays untouched.
- **Changing node or edge rendering** — explicit Scope Limit ("don't change node or edge rendering"). No touches to `canvas-node.tsx`, `canvas-edge.tsx`, `shape-visual.tsx`, `node-color-toolbar.tsx`, or the node/edge data-update hooks from specs 14/16.
- **Adding extra canvas controls** — explicit Scope Limit ("don't add extra canvas controls"). No React Flow `<Controls>` panel, no buttons beyond the five named (zoom out, fit view, zoom in, undo, redo) — e.g. no lock/pan-mode toggle, no grid-snap toggle, no reset-zoom-to-100% button.
- **Changing the existing collaborative state setup** — explicit Scope Limit ("don't change the existing collaborative state setup"). No changes to `useLiveblocksFlow`, `LiveblocksProvider`/`RoomProvider` configuration, presence, or the drag/drop node-creation path.
- **Persisting zoom/viewport state or undo/redo history across sessions or reloads** — not mentioned anywhere in this spec's text. Liveblocks' room history is already scoped and managed entirely by the library itself; nothing new needs to be built or stored for it.
- **Confusing Liveblocks room-state undo/redo with `project-overview.md`'s "Versioned spec history and review workflows" Out of Scope item** — these are unrelated: this spec's undo/redo is transient, room-local canvas-edit history (nodes/edges), not a persisted, browsable history of generated Markdown specs. Worth calling out explicitly since the words are superficially similar; nothing here touches spec persistence or spec versioning.
- **Billing, enterprise permission tiers, production object storage migration, mobile apps** — the remainder of `project-overview.md`'s Out of Scope wall; nothing in this spec's text comes near any of these.

## Handoff

Brief ready for Senior Developer at `context/spec-status/17-canvas-ergonomics.md`.

## Dev Notes

### Files added/changed

- `hooks/use-keyboard-shortcuts.ts` (new) — `useKeyboardShortcuts({ zoomIn, zoomOut, undo, redo })`: attaches one `keydown` listener to `window` in a `useEffect`. `+`/`=` → `zoomIn`, `-` → `zoomOut`, `Cmd/Ctrl+Z` → `undo`, `Cmd/Ctrl+Shift+Z` and `Cmd/Ctrl+Y` → `redo`. Ignores the event if either `event.target` or `document.activeElement` is an `<input>`/`<textarea>`/`isContentEditable`/`contenteditable` element. Calls `event.preventDefault()` on every recognized shortcut.
- `components/editor/canvas-control-bar.tsx` (new) — `CanvasControlBar`: pill-shaped, bottom-left, two button groups (zoom out/fit view/zoom in, then undo/redo) separated by a `bg-surface-border` divider. All five actions and the two `canUndo`/`canRedo` booleans arrive as props (no internal state, no context) — undo/redo buttons use the shadcn `Button`'s native `disabled` prop.
- `components/editor/canvas.tsx` (modified) — `CanvasFlow` now also destructures `zoomIn`/`zoomOut`/`fitView` from the existing `useReactFlow()` call, calls Liveblocks' `useUndo`/`useRedo`/`useCanUndo`/`useCanRedo` (imported from `@liveblocks/react/suspense`, same import path already used there), wraps the three zoom methods in `useCallback`s that pass `{ duration: 200 }`, calls `useKeyboardShortcuts` with those same handlers plus `undo`/`redo`, and renders `<CanvasControlBar>` as a sibling of `<ReactFlow>` (not inside it) so its `absolute` positioning resolves against `Canvas`'s own outer `relative` wrapper — the same positioning context `ShapePanel` uses, since every intermediate provider (`RoomProvider`, `ClientSideSuspense`, `ReactFlowProvider`) renders no DOM of its own (confirmed by reading `@xyflow/react`'s `ReactFlowProvider` source). `<MiniMap />` and its import are removed; nothing else in the file touches drag/drop, node/edge creation, or the existing sync setup.
- `context/ui-context.md` (modified) — new "Canvas Control Bar" section (positioning math, grouping/divider, zoom-duration value, keyboard-shortcut summary, props-not-context wiring); updated the stale "does not overlap the default bottom-right `MiniMap`" sentence in the Floating Shape Panel section, since `MiniMap` no longer exists.
- `components/editor/canvas-control-bar.test.tsx` (new) — button presence/grouping/divider (exactly one `.bg-surface-border` element), zoom button clicks call the passed-in `onZoomOut`/`onFitView`/`onZoomIn` props, undo/redo button clicks call `onUndo`/`onRedo`, `disabled` state driven by `canUndo`/`canRedo` props (and disabled buttons genuinely don't fire their click handler).
- `hooks/use-keyboard-shortcuts.test.ts` (new) — listener added to/removed from `window`; each of the 5 shortcuts fires the right handler (including both `Ctrl` and `Meta` variants, and both `Cmd/Ctrl+Shift+Z` and `Cmd/Ctrl+Y` for redo); a bare `z` with no modifier does nothing; every recognized shortcut calls `preventDefault`; shortcuts are ignored when the event target is an `<input>`/`<textarea>`, and separately when `document.activeElement` is `contenteditable` even if the event's own target differs; a shortcut still fires from a plain non-editable target with no editable `activeElement`.
- `components/editor/canvas.test.tsx` (extended) — `@liveblocks/react/suspense` mock gained `useUndo`/`useRedo`/`useCanUndo`/`useCanRedo` stubs (same kind of mock-surface extension spec 16 needed for `Position`/`MarkerType`); `useReactFlow`'s mock return gained `zoomIn`/`zoomOut`/`fitView`; the `MiniMap` mock export and its one assertion were removed and replaced with an explicit "no MiniMap renders" test; the shape-panel button-count assertion was updated from 6 to 11 (6 shape buttons + 5 new control-bar buttons); new tests cover the control bar's wiring to the real zoom/undo/redo handlers (including the `canUndo`/`canRedo`-driven disabled state) and confirm the real `useKeyboardShortcuts` hook (not mocked — it's exercised for real here) fires the same handlers via `fireEvent.keyDown(window, ...)`.

### Skills used

- `liveblocks-best-practices` — read the `multiplayer-react-flow` reference to confirm there's no React-Flow-specific undo/redo wrapper beyond the plain `useUndo`/`useRedo`/`useCanUndo`/`useCanRedo` hooks already named in the brief; no change of approach resulted; the brief's own recommendation (call them directly in `CanvasFlow`, pass down as props) was followed as written.

### Key decisions

- **Zoom animation duration**: 200ms (Open Questions #2's recommended 150–300ms range), a single module-level constant (`ZOOM_TRANSITION_DURATION_MS` in `canvas.tsx`) shared by all three zoom methods so a future change only touches one place.
- **Divider styling**: a 1px `bg-surface-border` fill (`mx-1 h-5 w-px`), per Open Questions #3's recommendation — no new token.
- **Control bar positioning**: `absolute bottom-24 left-6`, a higher `bottom` offset than `ShapePanel`'s `bottom-6` so the two floating toolbars stay vertically separated regardless of viewport width — not relying solely on the left/bottom-center horizontal split to avoid overlap, since the brief's acceptance criteria explicitly call for the control bar to sit "above" the shape panel, not just beside it.
- **Wiring mechanism**: props/arguments, not a new context, per Open Questions #4's own recommendation — `CanvasControlBar` and `useKeyboardShortcuts` are both siblings `CanvasFlow` itself instantiates, so this was the brief's own steer, not an independent judgment call.
- **`event.preventDefault()` on every recognized shortcut**: per Open Questions #5's recommendation, so the app's zoom/undo/redo wins over the browser's native handling of the same key combinations.
- **Icons**: `ZoomOut`, `Maximize`, `ZoomIn`, `Undo2`, `Redo2` from `lucide-react`, per Open Questions #1's recommendation (stroke-based, consistent with the existing Icons convention).

### Test coverage added

- `hooks/use-keyboard-shortcuts.test.ts` — 11 tests (listener lifecycle, all 5 shortcuts including both modifier keys, no-modifier no-op, `preventDefault`, three separate editable-target-guard scenarios).
- `components/editor/canvas-control-bar.test.tsx` — 6 tests (grouping/divider, zoom clicks, undo/redo clicks, disabled-state-driven-by-props ×2, disabled buttons don't fire clicks).
- `components/editor/canvas.test.tsx` — extended with 3 new tests (no `MiniMap`, control-bar wiring to real zoom/undo/redo handlers and `canUndo`/`canRedo`, real `useKeyboardShortcuts` hook firing through to the same handlers) plus updates to 2 existing tests (button count, mock surface).
- Full suite: 257/257 passing across 31 files (up from 236/29 at the end of spec 16).

Commands run, all passing:
- `npx tsc --noEmit` — pass, no errors.
- `npx eslint .` — pass, 0 errors (1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/...`, unrelated to this spec).
- `npx vitest run` — pass, 257/257 across 31 files.
- `npx next build` — pass, compiles and generates all routes successfully.

### Known limitations / deferrals

- No live browser/multiplayer verification (consistent with every prior canvas spec in this pipeline) — recommend a human smoke test: zoom in/out/fit-view buttons and their keyboard equivalents animate smoothly; undo/redo buttons and shortcuts correctly reflect Liveblocks room history across two tabs; typing in a node label or edge label textarea/input does not trigger any of the five shortcuts; no minimap renders anywhere.
- Diff confirmed scope-clean: only `hooks/use-keyboard-shortcuts.{ts,test.ts}`, `components/editor/canvas-control-bar.{tsx,test.tsx}`, `components/editor/canvas.{tsx,test.tsx}`, and `context/ui-context.md` changed — `shape-panel.tsx`, `canvas-node.tsx`, `canvas-edge.tsx`, `shape-visual.tsx`, `node-color-toolbar.tsx`, and `types/canvas.ts` are untouched.
## QA Report

**Overall verdict: PASS**

### Mechanical gate

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass — no errors |
| `npx eslint .` | Pass — 0 errors (1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/...`, unrelated to this spec) |
| `npx next build` | Pass — compiles, all routes generated |
| `npx vitest run` | Pass — 257/257 tests across 31 files |

### Acceptance criteria checklist

1. Pill-shaped control bar renders bottom-left, above the shape panel, not overlapping — **Pass**. `CanvasControlBar` uses `absolute bottom-24 left-6`; `ShapePanel` uses `absolute bottom-6 left-1/2 -translate-x-1/2`. With both toolbars at `size-9` icon buttons + `p-1.5` padding (~48px tall), shape panel occupies ~24–72px from viewport bottom, control bar occupies ~96–144px — a clear 24px gap, no overlap under any viewport width.
2. Two groups separated by a thin divider (zoom out/fit view/zoom in, then undo/redo) — **Pass**. Verified in `canvas-control-bar.tsx` and its test (`.bg-surface-border` divider, exactly one, `aria-hidden`).
3. Zoom in/out/fit view call the real React Flow instance's methods with a `duration` option — **Pass**. `handleZoomIn`/`handleZoomOut`/`handleFitView` in `canvas.tsx` call `zoomIn`/`zoomOut`/`fitView` from `useReactFlow()` with `{ duration: ZOOM_TRANSITION_DURATION_MS }` (200ms). Confirmed via `canvas.test.tsx`'s real-wiring test.
4. Undo/redo call Liveblocks' `useUndo()`/`useRedo()` — **Pass**. Imported from `@liveblocks/react/suspense` in `CanvasFlow`, passed straight through to `CanvasControlBar` and `useKeyboardShortcuts`.
5. Undo/redo disabled per `useCanUndo()`/`useCanRedo()` — **Pass**. `canUndo`/`canRedo` read in `CanvasFlow`, passed as props, drive the shadcn `Button`'s `disabled` prop.
6. Disabled buttons visually dimmed — **Pass**. Relies on `buttonVariants`' existing `disabled:opacity-50`; no custom CSS added, `components/ui/button.tsx` untouched.
7. `hooks/use-keyboard-shortcuts.ts` exports a hook taking zoom methods + undo/redo, listens on `window` — **Pass**.
8. Five shortcuts wired correctly (`+`/`=` zoom in, `-` zoom out, `Cmd/Ctrl+Z` undo, `Cmd/Ctrl+Shift+Z` and `Cmd/Ctrl+Y` redo) — **Pass**. Verified by direct reading and by 11 passing unit tests covering both `Ctrl` and `Meta` variants.
9. Shortcuts skipped when focus/target is an editable field — **Pass**. `isEditableElement` checks both `event.target` and `document.activeElement` for `INPUT`/`TEXTAREA`/`contenteditable`/`isContentEditable`; three distinct test scenarios cover this including the "activeElement editable but target differs" case.
10. `<MiniMap>` removed, no minimap renders — **Pass**. Import and element both absent from `canvas.tsx`; confirmed via diff and by grep of the file.
11. No changes to shape panel, node/edge rendering, or existing collaborative sync setup beyond reading the new hooks and removing `MiniMap` — **Pass**. `git diff spec/16-edge-behavior..spec/17-canvas-ergonomics --name-only` shows only `canvas-control-bar.{tsx,test.tsx}`, `use-keyboard-shortcuts.{ts,test.ts}`, `canvas.{tsx,test.tsx}`, `ui-context.md`, `progress-tracker.md`, and the spec-status file itself changed. `shape-panel.tsx`, `canvas-node.tsx`, `canvas-edge.tsx`, `shape-visual.tsx`, `node-color-toolbar.tsx`, and `types/canvas.ts` are untouched.
12. `npm run build` and the full gate (`tsc`, `eslint`, `vitest`) pass — **Pass**, see Mechanical gate above.

### Architecture invariants

No violations found. This is a client-side canvas UI change only — no new request handlers, no metadata/blob storage touched, no auth/mutation boundaries added. `"use client"` directives are present on both new files, consistent with the Hooks Convention and Client Components rule. New hook placed correctly at top-level `hooks/`.

### Standards compliance

- No `any` in changed files.
- No raw Tailwind color classes (`zinc-`, `slate-`, `gray-`) or hex literals in changed files — grep confirms clean; divider and control bar use `border-surface-border`/`bg-surface-border`/`bg-elevated` tokens consistent with `ShapePanel`.
- `components/ui/*` untouched — confirmed via diff.
- Border radius scale respected (`rounded-full` for the pill, matching `ShapePanel`'s existing convention).

### Error handling

Not much applicable surface for this spec (pure UI ergonomics, no new API routes or data mutations). The one meaningful "failure mode" — nothing to undo/redo — is handled via `canUndo`/`canRedo`-driven `disabled` state, verified both in `canvas-control-bar.test.tsx` (disabled buttons don't fire their click handlers) and in `canvas.test.tsx`'s real-wiring test.

### Housekeeping

`context/progress-tracker.md` updated accurately: Phase 17 marked "Dev pass complete, awaiting QA," "In Progress" section lists the actual files/changes made, matching the real diff.

### Issues found

None. Implementation matches the brief on every acceptance criterion, mechanical gate is fully green, scope is clean, docs (`ui-context.md`, `progress-tracker.md`) were kept in sync, and test coverage is thorough (11 shortcut tests, 6 control-bar tests, 3 new + 2 updated canvas tests).

## Handoff

QA passed — ready for Product Owner review.

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Product fit against `project-overview.md`

This spec is a pure ergonomics/usability improvement layered on top of the collaborative canvas delivered by specs 11–16. It does not itself close a new Success Criterion, but it materially de-risks and strengthens **Success Criterion 2** ("multiple users can collaborate in the same canvas simultaneously") and the Core User Flow's "collaborators edit and refine the design" step: prior to this spec, the canvas had no way to zoom/fit the view except trackpad gestures, no visible undo/redo affordance despite Liveblocks history already being available, and a default `MiniMap` that `ui-context.md`'s own design language never called for. A multi-node/edge canvas (now populated by specs 12–16) is hard to navigate and easy to accidentally mis-edit without zoom controls and a visible, working undo. This is exactly the kind of incremental, non-flashy ergonomics work `ai-workflow-rules.md`'s incremental philosophy expects between larger feature specs — it doesn't move any single Success Criterion from 0 to 1, but it makes the collaborative surface genuinely usable rather than a demo.

### Scope check

Independently re-ran `git diff spec/16-edge-behavior..spec/17-canvas-ergonomics --stat` (this branch's actual parent, not `main`, per the task's own note) rather than trusting Dev/QA's claim. Confirmed only the expected files changed: `hooks/use-keyboard-shortcuts.{ts,test.ts}` (new), `components/editor/canvas-control-bar.{tsx,test.tsx}` (new), `components/editor/canvas.{tsx,test.tsx}` (modified), `context/ui-context.md` (modified), plus `context/progress-tracker.md` and this spec-status file. `shape-panel.tsx`, `canvas-node.tsx`, `canvas-edge.tsx`, `shape-visual.tsx`, `node-color-toolbar.tsx`, and `types/canvas.ts` are byte-for-byte untouched — satisfies all four of this spec's own Scope Limits (no shape-panel change, no node/edge rendering change, no extra controls beyond the five named, no change to the collaborative sync setup beyond reading the four new Liveblocks history hooks).

Read `canvas.tsx` and `canvas-control-bar.tsx` directly (not just Dev Notes/QA's description): `useUndo`/`useRedo`/`useCanUndo`/`useCanRedo` are genuinely Liveblocks room-history hooks (`@liveblocks/react/suspense`), not a local-only mechanism; `zoomIn`/`zoomOut`/`fitView` are genuinely the real `useReactFlow()` instance's methods called with `{ duration: 200 }`; `<MiniMap>` and its import are genuinely gone; the control bar and shortcut hook are wired via plain props/arguments, not a new context, consistent with the brief's own Open Questions #4 recommendation and this codebase's established pattern (contexts reserved for leaf renderers with no other path back to `CanvasFlow`, per specs 14/16).

No touches to any `project-overview.md` Out of Scope item (billing, enterprise permission tiers, versioned spec history, production object storage, mobile apps) — this spec doesn't come near any of them.

### `progress-tracker.md` accuracy

The "In Progress" entry for spec 17 (lines 205–213 prior to this review) accurately matches what QA actually verified: the same five files/hooks, the same 257/257 test count, the same scope-clean diff claim — this is not aspirational or partial, it matches the delivered and QA-passed code. I will move this entry to "Completed" (with the QA/PO trail summary and PR link) and advance "Current Phase"/"Next Up" to spec 18 as the final step of this review, per instructions.

### Rough edges — acceptable at this stage

- No live browser/multiplayer verification (consistent with every prior canvas spec 11–16) — Dev/QA both flag this and recommend the same human smoke test (zoom/fit-view/undo/redo buttons and their keyboard equivalents, two-tab Liveblocks history sync, typing in a node/edge label doesn't trigger shortcuts, no minimap anywhere). Not a blocker for this recommendation, consistent with how every prior canvas spec in this pipeline has been judged.
- Fixed 200ms zoom-transition duration and `bottom-24`/`left-6` positioning constants are reasonable, documented Dev-level choices within the brief's own recommended ranges (Open Questions #2/#3) — not product decisions requiring escalation.
- `hooks/use-keyboard-shortcuts.ts` (kebab-case) vs. the raw spec text's literal `hooks/useKeyboardShortcuts` — a reasonable, documented judgment call consistent with this codebase's established file-naming convention (kebab-case throughout `hooks/`), not a deviation from product intent.

None of these would block spec 18 or later specs from building on this one correctly — the control bar and shortcut hook are additive, self-contained, and don't change any interface (`useLiveblocksFlow`, `onNodesChange`/`onEdgesChange`/`onConnect`, the node/edge data-update contexts) that a later spec would depend on.

### Conclusion

All 12 acceptance criteria hold up under independent re-verification. Scope is clean against both this spec's own Scope Limits and `project-overview.md`'s Out of Scope wall. `progress-tracker.md`'s in-progress record is honest and will be promoted to Completed as part of this sign-off.

## Handoff

Product Owner PASS — proceeding to PR creation and `progress-tracker.md` update.
