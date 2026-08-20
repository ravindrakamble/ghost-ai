# Spec 18 — Starter Template

## Analyst Brief

### Scope statement

This spec adds a fixed, code-defined library of at least three starter canvas templates (microservices, CI/CD pipeline, event-driven system), a dialog that shows them as cards with a lightweight non-React-Flow diagram preview and an Import button, and a navbar entry point to open that dialog. Selecting a template clears the current canvas's nodes and edges and replaces them with the template's nodes/edges through the same `onNodesChange`/`onEdgesChange` change-dispatch path every prior canvas spec already uses, then fits the view. It does not add template saving, custom/user-authored templates, server-side template persistence, or any change to how nodes/edges are actually rendered on the real canvas.

### Concrete deliverables

**New: `components/editor/starter-templates.ts`**

- Exports a `CanvasTemplate` interface: `{ id: string; name: string; description: string; nodes: CanvasNode[]; edges: CanvasEdge[] }`, reusing `types/canvas.ts`'s existing `CanvasNode`/`CanvasEdge` aliases (`Node<CanvasNodeData, CanvasNodeType>` / `Edge<CanvasEdgeData, CanvasEdgeType>`) rather than inventing a separate template-only node/edge shape. This is what makes "add the selected template nodes and edges" a literal, type-safe `onNodesChange([{ type: "add", item }, ...])` call later — a template node *is* a `CanvasNode`, not a lookalike that needs converting.
- Exports `CANVAS_TEMPLATES: readonly CanvasTemplate[]` with at least 3 entries — the spec's own suggested set (microservices, CI/CD pipeline, event-driven system) is a reasonable literal reading, not an invented addition.
- Every template node's `color`/`textColor` pair must be one of the 8 entries in `NODE_COLORS` (`types/canvas.ts`, spec 15) and every node's `shape` one of the 6 `NodeShape` values (`types/canvas.ts`) — "use the shared canvas types and existing node color palette" from the spec's own text, literally.
- Node/edge IDs are static, human-readable strings authored directly in the file (e.g. `"microservices-api-gateway"`), not `lib/canvas-shapes.ts#generateNodeId()` — that function's timestamp+counter recipe exists for *dynamically dropped* nodes and produces a different ID on every call, which is wrong for a hardcoded literal that needs a stable, predictable ID at authoring time. IDs only need to be unique *within* a single template (see Open Questions #3 on why cross-template collisions aren't a concern given the clear-first mechanism).
- Small helper functions (e.g. a `templateNode(id, shape, label, position, colorPair?)` builder) are explicitly invited by the spec's own text ("Add small helper functions if needed to keep the template data readable") — recommended so a template's node array reads as a list of positions/labels/shapes rather than repeated boilerplate object literals.
- Node `position`/`width`/`height` values are authored directly per template (there's no drag/drop step to derive them from) — reasonable default sizes should follow `lib/canvas-shapes.ts`'s `SHAPE_DEFAULT_SIZES` per shape for visual consistency with hand-placed nodes, though exact per-node layout coordinates are inherently a Dev-level content-authoring choice (see Open Questions #4).

**New: `components/editor/starter-template-preview.tsx`** (recommended split from the modal file — not literally named by the spec, but `code-standards.md`'s "keep modules small and single-purpose" argues for separating the preview-drawing logic from the dialog/grid/import-button logic; Dev may fold it into `starter-templates-modal.tsx` instead if preferred, this is not a hard requirement)

The lightweight, non-React-Flow diagram preview for a single template card. **Recommendation: SVG, not `<canvas>`.** Reasoning to document in `ui-context.md` once implemented:

- `<canvas>`'s 2D context isn't available under jsdom without an additional native dependency — this project's test environment (`vitest.config.mts`, `code-standards.md`'s Testing section) is jsdom for component tests, and every other canvas-adjacent component in this codebase (`ShapeVisual`, `CanvasNode`, `CanvasEdge`) is tested via RTL queries against real DOM nodes. An SVG preview keeps that same testable-via-RTL property (`container.querySelectorAll("polygon")`, etc.); a `<canvas>` preview would need pixel-level snapshot testing or a mocked 2D context, a heavier and less precise testing approach than every prior canvas spec in this pipeline has used.
- SVG's own `viewBox` + `preserveAspectRatio` mechanism already does "fit an arbitrary-sized diagram into a fixed-size box" natively, with no manual scale-factor arithmetic — the exact same technique `ShapeVisual` (spec 13) already relies on for scaling individual shapes into a node's box. Reusing that established idiom at the whole-diagram level (rather than a `<canvas>` component that would need to hand-roll its own scale/translate math) is the smaller, more consistent addition.

Concrete mechanism:

- **Bounds**: compute `minX = min(node.position.x)`, `maxX = max(node.position.x + node.width)`, and the equivalent for Y, across the template's nodes. Add a small fixed padding (e.g. 20 flow units) on all four sides so a node sitting exactly on the boundary isn't clipped by its own stroke width — the padding amount is a Dev-level styling choice, not pinned by any context doc.
- **Viewport**: the `<svg>` itself gets a fixed pixel `width`/`height` (the card's preview slot) and `viewBox={\`${minX - padding} ${minY - padding} ${boundsWidth + 2*padding} ${boundsHeight + 2*padding}\`}`, with the *default* `preserveAspectRatio` (`xMidYMid meet`, not `ShapeVisual`'s `"none"`) — the diagram's real proportions should be preserved and centered, not stretched to fill the box, unlike a single node's own shape filling its own box.
- **Nodes**: for `rectangle`/`pill`/`circle`, draw an SVG `<rect>` (with `rx` for rounding) or `<circle>` at the node's real flow-space `position`/`width`/`height`, filled with `node.data.color`, stroked with the same `var(--border-default)` token `ShapeVisual` uses at rest (no hover/selection state exists in a static preview). For `diamond`/`hexagon`/`cylinder`, wrap the same normalized 0–100 polygon/path point strings `ShapeVisual` already uses (`"50,2 98,50 50,98 2,50"` for diamond, etc.) in a per-node `<g transform="translate(node.position.x, node.position.y) scale(node.width/100, node.height/100)">` so each node's complex shape renders at its own real footprint within the shared viewBox — this intentionally mirrors `shape-visual.tsx`'s existing geometry constants (documented here as a deliberate visual-consistency choice) rather than importing/reusing `ShapeVisual` itself, since `ShapeVisual` is a `<div>`-rooted component not designed to nest inside an SVG `<g>`, and touching it would risk crossing this spec's "don't change node or edge rendering" Scope Limit.
- **Edges**: for each template edge, draw a plain `<line>` from the source node's center (`position.x + width/2`, `position.y + height/2`) to the target node's center, stroked with the same `var(--border-default)` token — "simple lines between node centers," literally, no routing, no arrowheads, no labels (the spec's own text: "draw edges as simple lines").
- No React Flow instance, no `ReactFlowProvider`, no `@xyflow/react` imports anywhere in this file — "no React Flow instance needed," literally.

**New: `components/editor/starter-templates-modal.tsx`**

- A dialog built on the existing `components/ui/dialog.tsx` primitives (`Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`), the same convention `share-dialog.tsx` already establishes — not a new modal mechanism.
- Props: `open: boolean`, `onOpenChange: (open: boolean) => void`, `onImport: (template: CanvasTemplate) => void` — presentational, same shape as `ShareDialogProps`'s `open`/`onOpenChange` pair.
- Renders `CANVAS_TEMPLATES` as a scrollable grid of cards (`overflow-y-auto` within a `max-h-*` region, similar to `ShareDialog`'s collaborator `<ul>`; grid column count is a Dev-level layout choice — see Open Questions #5). Each card shows the template's `name`, `description`, the `StarterTemplatePreview`, and an "Import" button.
- Clicking a card's Import button calls `onImport(template)` and then closes the dialog (`onOpenChange(false)`) — "call `onImport` with the selected template, then close," literally.
- The dialog's own width will likely need to be wider than `ShareDialog`'s `max-w-md` to fit a multi-column card grid — a Dev-level styling choice (e.g. `max-w-2xl`/`max-w-3xl`), not pinned by `ui-context.md`.

**Modified: `components/editor/workspace-navbar.tsx`**

- Add a new button (e.g. a `LayoutTemplate` lucide icon, per the Icons convention — stroke-based, no filled variant; exact icon/label not named by the spec, a Dev-level choice on the same footing as spec 17's Open Questions #1) that calls a new `onOpenTemplates: () => void` prop, mirroring the existing `onOpenShare` prop already on this component. "Add a navbar button to open the starter templates modal," literally.

**Modified: `components/editor/workspace-shell.tsx` and `components/editor/canvas.tsx`** — the cross-tree wiring problem this spec has to solve

The tricky part of this spec: the navbar button (and the modal it opens) sit in `WorkspaceShell`'s tree, but the actual mechanism the Import action needs — `nodes`, `edges`, `onNodesChange`, `onEdgesChange`, and `fitView` — only exists deep inside `CanvasFlow` (`components/editor/canvas.tsx`), nested under `LiveblocksProvider`/`RoomProvider`/`ClientSideSuspense`/`ReactFlowProvider`. `WorkspaceShell` currently mocks `Canvas` entirely as an opaque `<div data-room-id>` in its own tests (`workspace-shell.test.tsx`), confirming it has no reach into the canvas's internal Liveblocks/React-Flow state today.

**Recommended approach** (see Open Questions #1 for the alternative considered and rejected): thread the modal's open/close boolean *down* through props, the same direction `roomId` already flows, and the same "pass the real mechanism down as props, no new context" posture spec 17 already established for `CanvasControlBar`/`useKeyboardShortcuts` (Open Questions #4 there):

- `WorkspaceShell` owns `isTemplatesModalOpen` local state (mirroring its existing `isShareOpen`/`isAiSidebarOpen` state), passes `isTemplatesModalOpen`/`setIsTemplatesModalOpen` down as new `Canvas` props (alongside the existing `roomId`), and wires the new navbar button's `onOpenTemplates` to `() => setIsTemplatesModalOpen(true)`.
- `Canvas` forwards those same two props straight through to `CanvasFlow`.
- `CanvasFlow` — which already destructures `nodes`, `edges`, `onNodesChange`, `onEdgesChange`, and `fitView` — renders `<StarterTemplatesModal open={isTemplatesModalOpen} onOpenChange={setIsTemplatesModalOpen} onImport={handleImportTemplate} />` as a sibling of `<ReactFlow>`/`ShapePanel`/`CanvasControlBar`, and owns `handleImportTemplate`.

**The exact clear-then-add mechanism**, inside `CanvasFlow`:

```ts
const handleImportTemplate = useCallback(
  (template: CanvasTemplate) => {
    const nodeChanges: NodeChange<CanvasNodeAlias>[] = [
      ...nodes.map((node) => ({ id: node.id, type: "remove" as const })),
      ...template.nodes.map((node) => ({ item: node, type: "add" as const })),
    ]
    const edgeChanges: EdgeChange<CanvasEdgeAlias>[] = [
      ...edges.map((edge) => ({ id: edge.id, type: "remove" as const })),
      ...template.edges.map((edge) => ({ item: edge, type: "add" as const })),
    ]
    onNodesChange(nodeChanges)
    onEdgesChange(edgeChanges)
    // fitView timing — see Open Questions #2, this is the part that needs
    // real verification, not just a plausible-looking call placed here.
  },
  [nodes, edges, onNodesChange, onEdgesChange],
)
```

This is genuinely the same `onNodesChange`/`onEdgesChange` prop `useLiveblocksFlow` already wires to `<ReactFlow>` and to Liveblocks Storage — confirmed via `@xyflow/system`'s `NodeChange`/`EdgeChange` union types, which include a `{ id, type: "remove" }` variant alongside the `{ item, type: "add" }` variant this codebase already uses for shape-panel drops (spec 12) — not a new API, not a separate local-only path. Removes and adds are batched into one array per call (not two separate `onNodesChange` calls) so collaborators don't see a transient empty-canvas frame between the clear and the repopulate.

- `context/ui-context.md` (modified) — new "Starter Templates" convention section under Canvas (modal styling, preview mechanism/SVG rationale, navbar entry point), following the same documentation pattern as the Canvas Control Bar / Floating Shape Panel sections.
- Test files, per `code-standards.md`'s Testing section: `components/editor/starter-templates.test.ts` (template count ≥ 3, every node's color/textColor pair is a real `NODE_COLORS` entry, every node's shape is a real `NodeShape`, IDs unique within each template), `components/editor/starter-template-preview.test.tsx` (bounds computed from node positions rather than hardcoded, one shape element per node, one line per edge, no `@xyflow/react` import), `components/editor/starter-templates-modal.test.tsx` (renders one card per `CANVAS_TEMPLATES` entry, Import click calls `onImport` with the right template and then `onOpenChange(false)`), `components/editor/canvas.test.tsx` extended (clear-then-add dispatch shape, `fitView` called after import), `components/editor/workspace-navbar.test.tsx` (new, or folded into `workspace-shell.test.tsx` — the templates button exists and calls `onOpenTemplates`).

### Acceptance criteria

Directly from the spec's own "Check When Done" list, expanded with the underlying "Implementation" detail:

1. `components/editor/starter-templates.ts` exports a `CanvasTemplate` type and a `CANVAS_TEMPLATES` array with at least 3 templates, each with `id`/`name`/`description`/`nodes`/`edges`.
2. Every template node's `shape` is a real `NodeShape` and its `color`/`textColor` pair is a real `NODE_COLORS` entry (both from `types/canvas.ts`) — no invented colors or shapes.
3. `components/editor/starter-templates-modal.tsx` opens as a dialog and shows the templates as cards in a scrollable grid, each with the template's name, description, a diagram preview, and an Import button.
4. Each card's preview fits a fixed-size viewport, computes its bounds from that template's own node positions (not a hardcoded per-template value), draws edges as straight lines between node centers, draws nodes using their real shape/color data, and instantiates no React Flow instance.
5. Clicking a card's Import button calls `onImport` with that template and then closes the modal.
6. A navbar button (in `workspace-navbar.tsx`) opens the starter templates modal.
7. Selecting a template clears all existing canvas nodes and edges, then adds the template's own nodes and edges, both through the existing `onNodesChange`/`onEdgesChange` change-dispatch mechanism — not a separate local-only or React-Flow-only mutation path.
8. After import, only the template's node/edge IDs remain on the canvas — none of the previously-existing nodes/edges survive alongside them (the "replaces instead of being added on top" requirement).
9. `fitView` is called after the template import, and frames the newly-imported diagram's actual bounds rather than the canvas's previous (now-stale) bounds — see Open Questions #2 on the timing risk this criterion depends on.
10. No changes to `canvas-node.tsx`, `canvas-edge.tsx`, `shape-visual.tsx`, or `node-color-toolbar.tsx` — the real canvas rendering path is untouched; the preview is a separate, lightweight, non-React-Flow rendering path.
11. `npm run build` passes (the spec's own explicit check), applying the project's standard full gate: `npx tsc --noEmit`, `npx eslint .`, and `npx vitest run` all pass too.

### Dependencies

- Spec 11 (Base Canvas) — **complete**. Provides `CanvasFlow`'s `useLiveblocksFlow` (`nodes`, `edges`, `onNodesChange`, `onEdgesChange`) this spec's clear-then-add sequence dispatches through, and `types/canvas.ts`'s `CanvasNodeData`/`CanvasEdgeData`/`CANVAS_NODE_TYPE`/`CANVAS_EDGE_TYPE` that every template node/edge must conform to.
- Spec 12 (Shape Panel) — **complete**. Established the `onNodesChange([{ type: "add", item }])` pattern this spec's template-add step reuses, and `lib/canvas-shapes.ts`'s `SHAPE_DEFAULT_SIZES`/`NodeShape` union that template node sizing should stay visually consistent with.
- Spec 13 (Node Shape) — **complete**. `shape-visual.tsx`'s per-shape SVG geometry (diamond/hexagon/cylinder polygon/path point strings) is the visual reference the lightweight preview's own node-drawing mirrors, without importing or modifying that file.
- Spec 15 (Nodes Color Toolbar) — **complete**. Provides `NODE_COLORS`, the palette every template node's color/textColor pair must be drawn from.
- Spec 16 (Edge Behavior) — **complete**. Confirms `CanvasEdgeData`'s shape (`{ label?: string }`) template edges' `data` should conform to; template edges don't need to set `label` (spec's own text: "simple lines," no mention of labeled template edges).
- Spec 17 (Canvas Ergonomics) — **complete**. Provides the real `fitView` method (already destructured from `useReactFlow()` in `CanvasFlow`) this spec calls after import, and the "read the real mechanism where it lives, pass down as props, no new context" convention this spec's navbar-to-canvas wiring follows.

All listed dependencies are complete per `progress-tracker.md`.

### Open questions

1. **How should the modal's open state and the actual import mechanism cross from `WorkspaceShell`'s tree into `CanvasFlow`'s tree?** Two options considered:
   - **(Recommended)** Thread a boolean open-state + setter down through new `Canvas`/`CanvasFlow` props (the same direction `roomId` already flows), with `CanvasFlow` itself rendering `<StarterTemplatesModal>` and owning `handleImportTemplate`, since that's where `nodes`/`edges`/`onNodesChange`/`onEdgesChange`/`fitView` actually live. This also matches the existing test-boundary convention: `workspace-shell.test.tsx` already mocks `Canvas` as an opaque stub and only asserts prop pass-through, while canvas-internal behavior is covered in `canvas.test.tsx` — the same split this spec's tests would naturally follow.
   - Keep `<StarterTemplatesModal>` rendered in `WorkspaceShell` (matching `ShareDialog`'s placement) and instead expose an imperative "import" method from `Canvas`/`CanvasFlow` via `useImperativeHandle`/`forwardRef`. More machinery for the same result, and no other component in this codebase uses a ref-based escape hatch like this — the props-down approach is the smaller, more consistent addition. This brief recommends **against** this option but flags it since the spec text doesn't dictate component placement.
2. **`fitView` timing risk.** Calling `fitView()` synchronously in the same handler that just dispatched `onNodesChange`/`onEdgesChange` may run before React Flow's internal store has actually re-synced from the new `nodes`/`edges` prop values (state updates and Liveblocks' local echo aren't guaranteed to be reflected in the store `fitView` reads from within the same synchronous tick). This is a genuine correctness risk for acceptance criterion 9, not just a style nicety. Recommend Dev verify this directly (read `@liveblocks/react-flow`'s and `@xyflow/react`'s relevant source, the same "read the real source, don't assume" approach QA used in specs 12/17) and, if needed, defer the `fitView()` call — e.g. via a `useEffect` that fires once the newly-imported nodes are actually present in the `nodes` array, or a `requestAnimationFrame`/microtask deferral — rather than calling it inline and hoping it's already synchronous.
3. **Static template node/edge ID collisions across imports.** Since import always clears every existing node/edge first, re-importing the same template (or a different template that happens to reuse an ID) never collides with what's already on the canvas at the moment of import. The one acknowledged, unaddressed edge case: two collaborators importing different templates at nearly the same moment (a genuine multiplayer race, not something this spec's text asks to solve) — flagged as a known limitation, consistent with how prior canvas specs have flagged unresolved multiplayer edge cases rather than solving them speculatively, not a blocker for this spec.
4. **Exact template content (node positions/labels/count per template, edge connections) isn't pinned by the spec beyond "at least three templates, such as microservices, CI/CD pipeline, and event-driven system."** This is inherently authored content, not a derivable requirement — recommend Dev pick a small, readable node count per template (e.g. 4–7 nodes) with shapes chosen meaningfully (e.g. `cylinder` for a database, `hexagon` for an external system, per `ui-context.md`'s own per-shape "character" column), not an arbitrary rectangle-only diagram. A Dev-level content choice, same footing as spec 12's shape-button icon choices.
5. **Modal width, grid column count, and card sizing aren't pinned by `ui-context.md`.** Recommend a Dev-level choice consistent with existing dark-theme tokens and the `rounded-2xl`/card border-radius convention — no new visual language needed.
6. **No confirmation step before the destructive clear.** The spec's own Implementation text describes an immediate action ("when a template is selected, clear all existing nodes and edges first... add the selected template nodes and edges after") with no "are you sure?" step, unlike e.g. the existing Delete Project dialog's destructive-confirmation pattern. Recommend **no confirmation dialog** — the existing Liveblocks-backed undo (spec 17) already gives users a way to recover from an accidental import, and adding a new confirmation modal isn't asked for anywhere in this spec's text or `ui-context.md`'s Modals conventions. Flagged explicitly since a full-canvas wipe with zero confirmation is a meaningfully different UX posture than this codebase's other destructive actions — a human reviewer may want to weigh in before Product Owner sign-off.
7. **`architecture-context.md`'s "Import can occur on canvas creation or from within the editor at any time"** is permissive wording, not a requirement that this spec build both entry points. This spec's own Implementation/Check-When-Done text only asks for a navbar button (the "from within the editor, any time" path). Recommend treating an on-canvas-creation auto-import prompt as explicitly out of scope for this spec (see Out-of-scope callouts) rather than inferring it from the architecture doc's broader, forward-looking description.

### Out-of-scope callouts

- **Template saving** — explicit Scope Limit ("don't add template saving yet"). No "save current canvas as a template" action anywhere.
- **Custom user templates** — explicit Scope Limit ("don't add custom user templates"). `CANVAS_TEMPLATES` is a fixed, code-defined list; no per-user or per-project template CRUD, no template picker beyond the 3+ built-in entries.
- **Server persistence** — explicit Scope Limit ("don't add server persistence"). No new `app/api` route, no Prisma model, no Vercel Blob artifact for templates — `architecture-context.md`'s "Prebuilt templates are static canvas snapshots stored in the codebase... resolved by template ID at import time" is satisfied entirely by the plain `.ts` array this spec adds; nothing here touches the `canvas/{projectId}.json` blob path that stores actual *project* canvas snapshots (a separate, unbuilt persistence spec).
- **Node/edge rendering changes** — explicit Scope Limit ("don't change node or edge rendering behavior"). `canvas-node.tsx`, `canvas-edge.tsx`, `shape-visual.tsx`, `node-color-toolbar.tsx` all stay untouched; the card preview is a deliberately separate, lightweight rendering path specifically so the real renderers don't need touching.
- **An on-canvas-creation auto-import entry point** — `architecture-context.md`'s Starter System Designs section permissively allows import "on canvas creation or from within the editor at any time," but this spec's own Implementation text asks only for the navbar-button path. No empty-canvas onboarding prompt is part of this spec (see Open Questions #7).
- **AI-generated architecture, spec generation** — later, separate specs (`project-overview.md`'s Core User Flow steps 5–9); nothing in this spec's text produces or consumes AI-generated content.
- **Billing, enterprise permission tiers, versioned spec history, production object storage migration, mobile apps** — the remainder of `project-overview.md`'s Out of Scope wall; nothing in this spec's text comes near any of these.

## Handoff

Brief ready for Senior Developer at `context/spec-status/18-starter-template.md`.

## Dev Notes

### Files added

- `components/editor/starter-templates.ts` — `CanvasTemplate` type, `templateNode()`/`templateEdge()` helpers, and `CANVAS_TEMPLATES` (3 templates: `microservices`, `cicd-pipeline`, `event-driven-system`, 6–7 nodes each). Every node's shape comes from `lib/canvas-shapes.ts#CANVAS_SHAPES`/sized via `SHAPE_DEFAULT_SIZES`; every color/textColor pair is a real `NODE_COLORS` entry (destructured by name — `DEFAULT`/`BLUE`/`PURPLE`/`ORANGE`/`GREEN`/`TEAL` — for readable per-node assignment). All node/edge IDs are static, human-readable, authored strings (e.g. `microservices-api-gateway`), unique within each template.
- `components/editor/starter-template-preview.tsx` — `StarterTemplatePreview`, the SVG-based per-template diagram preview. Exports `getTemplateBounds` for bounds-from-node-positions testability. No `@xyflow/react` import, no `ShapeVisual` import (diamond/hexagon/cylinder geometry is copied inline, not imported, per the brief's own reasoning about `ShapeVisual` being `<div>`-rooted).
- `components/editor/starter-templates-modal.tsx` — `StarterTemplatesModal`, a `Dialog`/`DialogContent` (from `components/ui/dialog.tsx`) showing `CANVAS_TEMPLATES` as a `max-w-3xl` scrollable card grid; each card's Import button calls `onImport(template)` then `onOpenChange(false)`.
- `components/editor/starter-templates.test.ts`, `components/editor/starter-template-preview.test.tsx`, `components/editor/starter-templates-modal.test.tsx`, `components/editor/workspace-navbar.test.tsx` — new test files per the brief's test list.

### Files modified

- `components/editor/workspace-navbar.tsx` — added a `LayoutTemplate`-icon "Templates" button and `onOpenTemplates: () => void` prop, mirroring `onOpenShare`.
- `components/editor/workspace-shell.tsx` — added `isTemplatesModalOpen` local state (mirrors `isShareOpen`), wired the navbar's `onOpenTemplates`, passes `isTemplatesModalOpen`/`setIsTemplatesModalOpen` down to `<Canvas>` as new props.
- `components/editor/canvas.tsx` — `CanvasProps`/`CanvasFlow` gain `isTemplatesModalOpen`/`setIsTemplatesModalOpen`, forwarded straight through (`Canvas` → `CanvasFlow`, no new context, mirroring how `roomId` already flows). `CanvasFlow` renders `<StarterTemplatesModal>` as a sibling of `<ReactFlow>`/`ShapePanel`/`CanvasControlBar` and owns `handleImportTemplate` (see "Deviation from the brief's code sketch" below).
- `components/editor/canvas.test.tsx` — added a `renderCanvas()` helper (all 12 pre-existing `render(<Canvas roomId="project-123" />)` calls now go through it, supplying `isTemplatesModalOpen: false` + a spy setter by default so none of those tests needed individual updates) plus a new `onDeleteMock` in the hoisted mock surface and a new `describe("starter templates import (spec 18)")` block (5 tests: modal hidden when closed, modal + card count when open, the clear-then-add dispatch shape including the `onDelete` call, `fitView` called after import, `setIsTemplatesModalOpen(false)` called after import).
- `components/editor/workspace-shell.test.tsx` — extended the `Canvas` mock to also capture/report `isTemplatesModalOpen`; new test confirms the Templates navbar button flips that prop from `false` to `true`.
- `context/ui-context.md` — new "Starter Templates" section under Canvas (modal styling, preview mechanism/SVG rationale, navbar entry point, import mechanism — including the `onDelete`/no-op-`"remove"` finding below).

### Deviation from the brief's exact code sketch — verified via source, not assumed

The brief's "exact clear-then-add mechanism" code sketch (Concrete deliverables) dispatches `{ id, type: "remove" }` `NodeChange`/`EdgeChange` entries through `onNodesChange`/`onEdgesChange` to clear the canvas, batched together with the `"add"` entries for the template's own nodes/edges, in one call each.

Reading the actual installed `@liveblocks/react-flow` source (`node_modules/@liveblocks/react-flow/dist/lib/flow.js`) before implementing this showed that mechanism does not work:

```js
function applyNodeChanges(changes, nodes, history, getNodeSyncConfig) {
  for (const change of changes) {
    switch (change.type) {
      case "add":
      case "replace": { /* ... writes into the Liveblocks nodes LiveMap ... */ }
      case "position": { /* ... */ }
      case "dimensions": { /* ... */ }
      case "select": { /* ... */ }
      case "remove":
        break;                 // <-- genuinely a no-op
    }
  }
}
```

`applyEdgeChanges` has the identical no-op `case "remove": break`. Dispatching `{ type: "remove" }` through `onNodesChange`/`onEdgesChange` in this library version silently does nothing — every pre-existing node/edge would stay in Storage while the template's nodes/edges get added on top, failing acceptance criterion 8 ("only the template's node/edge IDs remain — none of the previously-existing nodes/edges survive alongside them").

The actual working removal channel is the separate `onDelete` mutation `useLiveblocksFlow` also returns (previously unused anywhere in this codebase — confirmed via grep that no prior spec wired up node/edge deletion at all, e.g. no `deleteKeyCode`/`onNodesDelete` on `<ReactFlow>`):

```js
const onDelete = useMutation(
  ({ storage }, params) => {
    const flow = storage.get(frozenOptions.storageKey);
    if (!flow) return;
    const nodesMap = flow.get("nodes");
    const edgesMap = flow.get("edges");
    for (const edge of params.edges) edgesMap.delete(edge.id);
    for (const node of params.nodes) nodesMap.delete(node.id);
  },
  [frozenOptions.storageKey],
);
```

`OnDelete<N, E>`'s real signature (`@xyflow/react`'s `general.d.ts`) is `(params: { nodes: N[]; edges: E[] }) => void` — it takes full node/edge objects, not IDs, and both collections in one call. `handleImportTemplate` (`components/editor/canvas.tsx`) therefore calls `onDelete({ nodes, edges })` once (the real current arrays from `useLiveblocksFlow`), then `onNodesChange`/`onEdgesChange` once each with only `{ type: "add", item }` entries for the template's own nodes/edges — 3 total Liveblocks mutations instead of the brief's intended 2, but the only version that's actually correct. `onDelete` is still part of the same `useLiveblocksFlow` API returned alongside `onNodesChange`/`onEdgesChange` (a real Storage-backed mutation, not a local-only or React-Flow-only path), so this still satisfies acceptance criterion 7's substance ("through the existing... change-dispatch mechanism") even though it isn't literally the two calls the brief's sketch describes. Documented in both `canvas.tsx`'s docblock and `ui-context.md`'s new Starter Templates section so QA/PO don't read this as an unexplained scope deviation.

One accepted, disclosed tradeoff from this: since `onDelete`/`onNodesChange`/`onEdgesChange` are 3 separate `room.batch()`-wrapped mutations (confirmed via `@liveblocks/react`'s `useMutation` source — every call to a `useMutation`-returned function wraps its own `room.batch()`, and no `useBatch()`/combinable-batch hook is exposed by the installed `@liveblocks/react` version to merge multiple `useMutation` calls into one), there are 3 separate Storage commits/broadcasts instead of 2, meaning collaborators could in principle see the canvas cleared for a moment before the template's nodes/edges land, rather than one atomic swap. This is a real, disclosed limitation of the "one call per collection" framing in the brief's Open Questions #3 (already flagged there as an acknowledged multiplayer edge case, not something this spec's text asks to solve), not something this implementation could avoid without hand-rolling a Storage mutation outside `useLiveblocksFlow`'s own API (which would cross into the "local-only" territory acceptance criterion 7 forbids).

### `fitView` timing — verified via source (brief's Open Question 2)

Verified, rather than assumed, that calling `fitView()` synchronously in the same handler that just dispatched `onDelete`/`onNodesChange`/`onEdgesChange` is safe and does not need a manual `requestAnimationFrame`/`useEffect`/microtask deferral, by reading `@xyflow/react`'s real source (`node_modules/@xyflow/react/dist/esm/index.js`):

- `useReactFlow()`'s `fitView` (line ~1208) does not compute bounds itself. It only does `store.setState({ fitViewQueued: true, fitViewOptions: options, fitViewResolver })` and returns a promise — the actual fit is deferred.
- The store's `setNodes` method (line ~3396, called whenever the `<ReactFlow nodes={...}>` prop changes) checks `if (fitViewQueued && nodesInitialized) resolveFitView()` — i.e. the queued fit only actually runs once a subsequent `setNodes` call reports the new nodes as `nodesInitialized`.
- `nodesInitialized` (from `@xyflow/system`'s `adoptUserNodes`, `dist/esm/index.js` line ~1624) requires every node's `measured.width`/`measured.height` to be set — which is `undefined` for brand-new nodes on their very first `setNodes` pass, so `fitViewQueued` correctly stays `true` (not reset) across as many `setNodes` calls as it takes until the newly-rendered nodes are actually measured by React Flow's own DOM measurement pass.
- `StoreUpdater` (line ~271) is a `useEffect` that calls `setNodes(props.nodes)` whenever the `nodes` prop reference changes — i.e. it re-runs, and re-checks `fitViewQueued`, on every render where `nodes` changed, not just once.

Net effect: `fitView()`'s own queuing mechanism is self-correcting regardless of exactly when in `handleImportTemplate` it's called relative to `onNodesChange`/`onEdgesChange`/`onDelete` — it will keep deferring until the newly-imported template's nodes are genuinely measured and reflected in the store, then fit to their real bounds, not the stale previous ones. This resolves the brief's Open Question 2 with evidence rather than a defensive rAF/effect wrapper (which would have been a needless workaround given what the library already does internally). `fitView({ duration: 200 })` is called synchronously at the end of `handleImportTemplate`, matching the brief's sketch location and `CanvasControlBar`'s existing `handleFitView` convention (spec 17).

### Key decisions

- Modal width `max-w-3xl`, card grid `grid-cols-1 sm:grid-cols-2`, card styling `rounded-2xl`/`border-surface-border`/`bg-elevated` (Open Questions #5 — Dev-level, no prior pinned convention beyond the border-radius scale).
- No confirmation dialog before the clear (Open Questions #6, per the brief's own recommendation) — Liveblocks undo (spec 17) is the recovery path.
- 3 templates, 6–7 nodes each, shapes chosen for their documented "character" (`hexagon` for API gateway/event bus as an external boundary, `cylinder` for databases/artifact registries/analytics stores, `diamond` for the CI/CD quality gate, `circle` for client/push trigger events, `pill` for services/processes) — Open Questions #4.
- Preview size fixed at 280×160px per card, 20-unit padding around the computed node bounds — Dev-level styling choices, not pinned by any context doc.
- `StarterTemplatePreview` has no `"use client"` directive (pure presentational, no hooks/browser APIs) — consistent with `shape-visual.tsx`'s existing precedent of leaving purely-presentational shape-geometry components server-component-eligible even though they're only ever rendered inside a client tree.

### Test coverage added

- `components/editor/starter-templates.test.ts` — ≥3 templates, unique ids/names/descriptions, includes the 3 named templates, every node/edge count > 0, every shape a real `CANVAS_SHAPES` member, every color/textColor pair a real `NODE_COLORS` entry, every node/edge typed `canvasNode`/`canvasEdge`, unique static (non-`generateNodeId()`-shaped) IDs within each template, every edge's `source`/`target` resolves to a real node ID in the same template, every node has a positive `width`/`height`.
- `components/editor/starter-template-preview.test.tsx` — no React-Flow DOM, one shape element per node, one `<line>` per edge, edge line endpoints match computed node centers, viewBox bounds change with node positions (not hardcoded), viewBox padding extends before the node origin, diamond/hexagon/cylinder nodes render inside a transformed `<g>` with the expected polygon points.
- `components/editor/starter-templates-modal.test.tsx` — renders nothing when closed, one card per `CANVAS_TEMPLATES` entry (name/description/Import button), one preview (`role="img"`) per card, Import calls `onImport` with the right template then `onOpenChange(false)`, and calls them in that order.
- `components/editor/canvas.test.tsx` (extended) — modal hidden/shown by `isTemplatesModalOpen`, the clear-then-add dispatch shape (`onDelete({ nodes, edges })` with the exact pre-import arrays, one `onNodesChange` call with only `"add"` changes matching the template's nodes, one `onEdgesChange` call with only `"add"` changes matching the template's edges), `fitView` called after import, `setIsTemplatesModalOpen(false)` called after import.
- `components/editor/workspace-navbar.test.tsx` (new) — Templates button renders alongside Share/AI-toggle, clicking it calls `onOpenTemplates`.
- `components/editor/workspace-shell.test.tsx` (extended) — `isTemplatesModalOpen` flows to `Canvas` and flips `true` when the Templates navbar button is clicked.

### Gate results

- `npx tsc --noEmit` — pass, no errors.
- `npx eslint .` — pass, 0 errors (1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/...`, unrelated to this spec).
- `npx vitest run` — 279/279 passing across 35 files when run with `--no-file-parallelism` (185s). A same-suite run with default file parallelism showed 7 unrelated file timeouts (`access-denied.test.tsx`, `canvas-control-bar.test.tsx`, `canvas-node.test.tsx`, `editor-home-empty-state.test.tsx`, `node-color-toolbar.test.tsx`, `project-sidebar.test.tsx`, `shape-panel.test.tsx`) — none of these are files this spec touches, and the specific set of files that timed out changed between repeated runs, consistent with this machine's jsdom-environment-setup cost (~13s/file average) under parallel load rather than a real regression. One genuine test bug found and fixed during this pass: `starter-templates-modal.test.tsx`'s "renders a preview for every template card" test initially queried `container.querySelectorAll("svg")` (0 matches — `DialogContent` renders through a portal to `document.body`, outside RTL's `container`) and then, after switching to `document.querySelectorAll("svg")`, over-counted by 1 (the dialog's own close-button `XIcon` is also an `<svg>`) — fixed by querying `screen.getAllByRole("img")` instead, since each `StarterTemplatePreview` carries `role="img"`.
- `npx next build` — pass (Turbopack, all routes compiled, no new dynamic/static classification issues).

### Untouched-files confirmation

`git diff HEAD -- components/editor/canvas-node.tsx components/editor/canvas-edge.tsx components/editor/shape-visual.tsx components/editor/node-color-toolbar.tsx` (against this branch's actual parent, `fix/shape-panel-pointer-drag`'s tip, commit `7500eed` — not `main`, which is further behind) is empty — all four files are byte-for-byte untouched, satisfying acceptance criterion 10. `lib/canvas-shapes.ts` and `types/canvas.ts` were read but not modified (only their existing exports — `SHAPE_DEFAULT_SIZES`, `CANVAS_SHAPES`, `NODE_COLORS`, `CANVAS_NODE_TYPE`, `CANVAS_EDGE_TYPE`, `CanvasNode`, `CanvasEdge`, `NodeColorPair`, `NodeShape` — are imported into the new template file).

### Known limitations / deliberate deferrals

- The 3-separate-mutation removal/add sequence (see "Deviation from the brief's exact code sketch" above) means a collaborator watching the canvas live during another user's import could, in principle, see a brief empty-canvas frame between the `onDelete` commit and the `onNodesChange`/`onEdgesChange` "add" commits, rather than one perfectly atomic swap. Flagged as a known, disclosed limitation of this library version rather than silently accepted — not fixable without a hand-rolled Storage mutation outside the `useLiveblocksFlow` API, which acceptance criterion 7 rules out. No live two-tab verification was possible in this pipeline (consistent with every prior canvas spec); recommend a human smoke test importing a template while a second tab is open on the same room.
- Per the brief's Open Questions #3 (already accepted there as out of scope for this spec): two collaborators importing different templates at nearly the same moment is a genuine multiplayer race not addressed here.
- No on-canvas-creation auto-import entry point (Open Questions #7 / Out-of-scope callouts) — only the navbar-button path was built, per the brief's own scope.
