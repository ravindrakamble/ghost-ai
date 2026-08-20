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

## QA Report

Overall verdict: FAIL -- see Issue 1 (a genuine, verifiably fixable bug in the clear-then-add atomicity the brief explicitly required) and Issue 2 (housekeeping). All 11 numbered acceptance criteria pass on their literal text; the FAIL is driven by a deeper look at the Concrete Deliverables section explicit "no transient empty-canvas frame" requirement (which this QA pass was specifically asked to re-verify given the mechanism deviation) plus a real process gap.

### Mechanical gate -- reproduced independently

- `npx tsc --noEmit` -- PASS, no errors.
- `npx eslint .` -- PASS, 0 errors, 1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/.../__root.tsx`, confirmed unrelated to this spec.
- `npx vitest run --no-file-parallelism` -- PASS, 279/279 across 35 files (85.8s), matching the Dev Notes claimed figures exactly.
- `npx vitest run` (default parallelism, reproduced twice) -- flaky as described in the Dev Notes: run 1 passed clean (279/279); run 2 failed 4 files on timeout (`node-color-toolbar.test.tsx`, `workspace-navbar.test.tsx`, `canvas-control-bar.test.tsx`, `shape-panel.test.tsx`), run 3 failed 5 files including `workspace-navbar.test.tsx` again. Correction to the Dev Notes: the claim that none of the timing-out files are files this spec touches does not hold up under repeated runs -- `workspace-navbar.test.tsx`, a new file added by this spec, timed out in both of the failing repro runs here. That said, the underlying diagnosis is correct and independently confirmed: the specific set of failing files is different and effectively random each run, `--no-file-parallelism` gives a clean deterministic 279/279 every time, and this exact class of environment/jsdom-setup-cost timeout flakiness is already documented for prior, unrelated specs (see `context/spec-status/13-node-shape.md` QA section, same root cause). Not a regression introduced by this spec -- informational correction only, no Dev action required.
- `npx next build` -- PASS, Turbopack, all routes compiled.

### Two flagged claims -- independently verified against real installed source, not trusted

1. `{ type: "remove" }` is a no-op in `applyNodeChanges`/`applyEdgeChanges`; `onDelete` is the real removal channel -- CONFIRMED. Read `node_modules/@liveblocks/react-flow/dist/lib/flow.js` lines 9-109 (`applyNodeChanges`/`applyEdgeChanges`, both `case "remove": break`) and lines 184-200 (the real `onDelete` `useMutation` implementation, `nodesMap.delete`/`edgesMap.delete` against Storage). The excerpt in the Dev Notes matches the real source verbatim. `OnDelete<N, E>` signature (`{ nodes: N[]; edges: E[] }`) is correctly typed via the library own exported type (`node_modules/@liveblocks/react-flow/dist/index.d.ts` line 123) -- confirmed no `any` cast needed, `tsc --noEmit` is clean.

2. `fitView()` can be called synchronously with no rAF/effect/microtask deferral, because of internal `fitViewQueued`/`StoreUpdater` deferral -- CONFIRMED. Read `node_modules/@xyflow/react/dist/esm/index.js`: `fitView` (line ~1208) only does `store.setState({ fitViewQueued: true, ... })` and returns a promise; `setNodes` (line ~3396) checks `if (fitViewQueued && nodesInitialized) resolveFitView()`; `StoreUpdater` (line ~271) is a `useEffect` that re-runs `setNodes(props.nodes)` on every `nodes` prop reference change. Also read `node_modules/@xyflow/system/dist/esm/index.js` `adoptUserNodes` (line ~1624): `nodesInitialized` requires every node measured width/height, correctly undefined on the first pass for newly-added nodes, so `fitViewQueued` stays true until a later `setNodes` call reports the template new nodes as genuinely measured. The conclusion in the Dev Notes is accurate.

### Acceptance criteria -- independently re-verified against code

1. `starter-templates.ts` exports `CanvasTemplate` plus `CANVAS_TEMPLATES` (at least 3, each with id/name/description/nodes/edges) -- PASS. 3 templates (microservices, cicd-pipeline, event-driven-system), 6-7 nodes each.
2. Every node shape/color pair is a real `NodeShape`/`NODE_COLORS` entry -- PASS. Cross-checked the `const [DEFAULT, BLUE, PURPLE, ORANGE, , , GREEN, TEAL] = NODE_COLORS` destructure against `types/canvas.ts` actual array order (Default, Blue, Purple, Orange, Red, Pink, Green, Teal at indices 0-7) -- the two skipped slots (4, 5 = Red, Pink) and the resulting GREEN/TEAL bindings are correct. All shapes used (circle/hexagon/pill/cylinder/rectangle/diamond) are real `CANVAS_SHAPES` members with real `SHAPE_DEFAULT_SIZES` entries.
3. Modal opens as dialog, cards in scrollable grid with name/description/preview/Import -- PASS. `starter-templates-modal.tsx` verified directly.
4. Preview: fixed viewport, bounds from node positions (not hardcoded), edges as straight lines between centers, nodes via real shape/color, no React Flow instance -- PASS. `getTemplateBounds` computes from node position/width/height; no `@xyflow/react` import anywhere in `starter-template-preview.tsx` (grepped, confirmed absent); edges render as plain `<line>` between `nodeCenter()` results; nodes render via `<rect>`/`<circle>`/transformed `<g><polygon>/<path>`.
5. Import click calls `onImport(template)` then closes -- PASS. Verified in `starter-templates-modal.tsx` and its ordering test.
6. Navbar button opens modal -- PASS. `workspace-navbar.tsx` LayoutTemplate-icon button calls `onOpenTemplates`, which flows to `workspace-shell.tsx` `setIsTemplatesModalOpen(true)`, then to `Canvas`/`CanvasFlow` props, then to `StarterTemplatesModal` `open` prop.
7. Clear plus add both go through the existing `onNodesChange`/`onEdgesChange` change-dispatch mechanism -- PASS on substance (removal correctly uses `onDelete`, the verified-correct half of the same `useLiveblocksFlow` API, not a local-only path; adds use the standard `{ type: "add", item }` path). See Issue 1 below for a related atomicity gap that the design intent behind this criterion, from the Concrete Deliverables text, does not fully satisfy.
8. Only the template node/edge IDs remain, no leftovers -- PASS. Verified via `canvas.test.tsx` dispatch-shape test and the `onDelete({ nodes, edges })` then `onNodesChange`(add-only) then `onEdgesChange`(add-only) sequence.
9. `fitView` called after import, frames new bounds -- PASS. See claim 2 verification above; `fitView({ duration: 200 })` genuinely lands on the new diagram regardless of exact call timing.
10. No changes to `canvas-node.tsx`/`canvas-edge.tsx`/`shape-visual.tsx`/`node-color-toolbar.tsx` -- PASS. `git diff 7500eed -- components/editor/canvas-node.tsx components/editor/canvas-edge.tsx components/editor/shape-visual.tsx components/editor/node-color-toolbar.tsx` independently reproduced as empty (0 lines).
11. `npm run build` plus full gate -- PASS. See Mechanical gate above.

### Issues

[Bug -> Dev] Issue 1 -- The clear-then-add sequence does not actually avoid the transient empty-canvas frame the brief explicitly required, and a fix is available without violating acceptance criterion 7.

The brief Concrete Deliverables text states plainly: Removes and adds are batched into one array per call (not two separate `onNodesChange` calls) so collaborators do not see a transient empty-canvas frame between the clear and the repopulate. The Dev Notes / Known Limitations section discloses that the actual implementation (`onDelete({ nodes, edges })`, then a separate `onNodesChange` add-only call, then a separate `onEdgesChange` add-only call -- 3 sequential calls, each independently wrapped in its own `room.batch()` via `useMutation`) reintroduces exactly this race for remote collaborators, and states this is not fixable without a hand-rolled Storage mutation outside the `useLiveblocksFlow` API, which acceptance criterion 7 rules out.

This claim is incorrect. The `@liveblocks/core` `batch()` implementation was verified directly (`node_modules/@liveblocks/core/dist/index.js`, function `batch2`, ~line 13245):

```
function batch2(callback) {
  if (context.activeBatch) {
    return callback();   // nested batch calls just run inline, no new flush
  }
  ...
  try {
    returnValue = callback();
  } finally {
    ...
    if (currentBatch.ops.length > 0) {
      dispatchOps(currentBatch.ops);   // ops from ALL nested batch() calls
    }                                   // accumulate here and flush ONCE
    notify(currentBatch.updates);
    flushNowOrSoon();
  }
  return returnValue;
}
```

Batch nesting is explicitly supported and documented (`node_modules/@liveblocks/core/dist/index.d.ts` ~line 2414: "Nesting batches is supported."; `Room.batch<T>(fn: () => T): T` is public API on the `Room` type, ~line 4198). `useMutation` own implementation (`node_modules/@liveblocks/react/dist/chunk-JMMTB4CU.js`, `useMutation_withRoomContext`) already wraps every call in `room.batch(() => callback(...))` -- so `onDelete`, `onNodesChange`, and `onEdgesChange` each independently start and end their own top-level batch today, producing 3 separate `dispatchOps` calls (3 separate Storage commits/broadcasts) instead of 1.

Wrapping the three existing calls in an outer `room.batch()`, obtained via `useRoom()` (already exported by `@liveblocks/react/suspense`, the same module `canvas.tsx` already imports `useUndo`/`useRedo`/`useCanUndo`/`useCanRedo` from, so no new dependency), would cause all three nested `useMutation` calls to join that single outer batch and flush exactly once:

```
const room = useRoom()
// ...
const handleImportTemplate = useCallback((template: CanvasTemplate) => {
  room.batch(() => {
    onDelete({ nodes, edges })
    onNodesChange(nodeChanges)
    onEdgesChange(edgeChanges)
  })
  fitView({ duration: ZOOM_TRANSITION_DURATION_MS })
}, [nodes, edges, onNodesChange, onEdgesChange, onDelete, fitView, room])
```

This still dispatches exclusively through `onDelete`/`onNodesChange`/`onEdgesChange`, the same `useLiveblocksFlow`-returned mutations acceptance criterion 7 requires, so it does not hand-roll a Storage mutation outside the API and does not cross any scope limit. It genuinely resolves the explicit atomicity requirement in the brief instead of just disclosing it as unfixed.

What to fix: wrap the three mutation calls in `handleImportTemplate` with `room.batch(...)` (via `useRoom()` from `@liveblocks/react/suspense`), update the `canvas.tsx` docblock/comments and the `context/ui-context.md` Starter Templates section to reflect the corrected atomic sequence, and update the Known Limitations note (the remaining, still-legitimate limitation is only the cross-collaborator different-template race already flagged in Open Questions #3, not this one). `canvas.test.tsx` will need a `useRoom` mock added to its hoisted mock surface, and ideally a test asserting `room.batch` is called around all three mutations (or, at minimum, that behavior is otherwise unchanged).

[Bug -> Dev] Issue 2 -- `context/progress-tracker.md` was not updated.

`git diff 7500eed -- context/progress-tracker.md` is empty. The file still reads "Current Phase: Phase 18 -- not yet started" and "Current Goal: Analyst pass for feature spec 18," with no Completed entry for spec 18 actual Dev work, contradicting the explicit instruction in `AGENTS.md` (Update `context/progress-tracker.md` after each meaningful implementation change) and this pipeline own established convention -- every prior spec 05-17 has a full narrative Completed entry (files added/modified, gate results, QA/PO summaries once available). This is pure housekeeping, not a functional bug, but it is an explicit checklist item (#6) and a repeated, consistent convention across every prior spec in this codebase.

### Minor, non-blocking observations

- The vitest-flakiness claim in the Dev Notes (that none of the timing-out files are files this spec touches) is not fully accurate -- see Mechanical gate above -- but the underlying environment-flakiness diagnosis is correct and does not need a Dev fix.

## Handoff

QA failed -- see issues above. Routing to Dev for both: Issue 1 (the batching/atomicity fix in `canvas.tsx`, with corresponding doc/test updates) and Issue 2 (`context/progress-tracker.md` housekeeping). No Analyst involvement needed -- both issues are code/process fixes, not ambiguities in the brief.

## Dev Notes — Bugfix round

Scope of this round: Issue 1 only (the `room.batch(...)` atomicity fix). Issue 2 (`progress-tracker.md`) was explicitly excluded by the orchestrator for this round — every prior spec's "mark completed" `progress-tracker.md` update lands in a separate commit after QA+PO sign-off (e.g. spec 17's `69b4dba` is separate from its `71ac064` feat commit), not in the Dev bugfix commit, so it is intentionally left untouched here.

### Files changed

- `components/editor/canvas.tsx` — `useRoom` added to the existing `@liveblocks/react/suspense` import (alongside `useUndo`/`useRedo`/`useCanUndo`/`useCanRedo`, no new dependency). `CanvasFlow` now calls `const room = useRoom()`. `handleImportTemplate` builds `nodeChanges`/`edgeChanges` first, then wraps the three mutation calls — `onDelete({ nodes, edges })`, `onNodesChange(nodeChanges)`, `onEdgesChange(edgeChanges)` — in `room.batch(() => { ... })`; `fitView(...)` remains a separate, synchronous call immediately after the batch (unaffected by this fix — its own safety was already verified via source in the original Dev Notes and QA pass). `room` added to `handleImportTemplate`'s `useCallback` dependency array. Docblocks updated (the spec-18 docblock above `CanvasFlow` and `handleImportTemplate`'s own docblock) to describe the batched sequence instead of the disclosed 3-separate-mutation limitation.
- `components/editor/canvas.test.tsx` — added `useRoomMock`/`roomBatchMock` to the hoisted mock surface (`roomBatchMock` mirrors `@liveblocks/core`'s real `batch()` behavior by just invoking its callback synchronously) and mocked `useRoom` in the `@liveblocks/react/suspense` mock. `beforeEach` now sets `useRoomMock.mockReturnValue({ batch: roomBatchMock })`. Added one new test ("bugfix round: wraps onDelete/onNodesChange/onEdgesChange in a single room.batch(...) call...") asserting `roomBatchMock` is called exactly once and that all three mutations' first invocation happens after (not before) that batch call, via `mock.invocationCallOrder`. The pre-existing "clearing then adding" dispatch-shape test needed no changes — its assertions on call counts/args are unaffected by adding an outer batch wrapper around calls that were already being made.
- `context/ui-context.md` — the Starter Templates section's "Import mechanism" paragraph rewritten to describe the `room.batch(...)` wrapping and why it's necessary (nested `useMutation`-internal batches don't coalesce on their own; `@liveblocks/core`'s `batch()` is reentrant, so only an explicit outer `room.batch(...)` around all three calls merges them into one commit).
- `context/spec-status/18-starter-template.md` — this section.

### The fix

QA's Issue 1 diagnosis was independently re-confirmed before implementing: `node_modules/@liveblocks/core/dist/index.js`'s `batch()` (referenced there as `batch2`) checks `context.activeBatch` and, if already inside a batch, just runs the callback inline rather than starting a new flush — i.e. nested `batch()` calls fold into whichever batch is already active, and `node_modules/@liveblocks/core/dist/index.d.ts` documents "Nesting batches is supported." `useMutation` (`@liveblocks/react`) already wraps every call in its own `room.batch(...)`, so `onDelete`, `onNodesChange`, and `onEdgesChange` — three separate `useMutation`-returned functions — were each opening and closing their own top-level batch, producing 3 separate Storage commits/broadcasts. Introducing one *outer* `room.batch(() => { onDelete(...); onNodesChange(...); onEdgesChange(...) })` in `handleImportTemplate` means all three inner `useMutation` calls now find `context.activeBatch` already set and fold into the outer batch instead, so the whole clear-then-add sequence flushes once.

```ts
const handleImportTemplate = useCallback(
  (template: CanvasTemplate) => {
    const nodeChanges: NodeChange<CanvasNodeAlias>[] = template.nodes.map((node) => ({
      type: "add" as const,
      item: node,
    }))
    const edgeChanges: EdgeChange<CanvasEdgeAlias>[] = template.edges.map((edge) => ({
      type: "add" as const,
      item: edge,
    }))

    room.batch(() => {
      onDelete({ nodes, edges })
      onNodesChange(nodeChanges)
      onEdgesChange(edgeChanges)
    })

    fitView({ duration: ZOOM_TRANSITION_DURATION_MS })
  },
  [nodes, edges, onNodesChange, onEdgesChange, onDelete, fitView, room],
)
```

`room` comes from `useRoom()`, already exported by `@liveblocks/react/suspense` — the same module `CanvasFlow` already imports `useUndo`/`useRedo`/`useCanUndo`/`useCanRedo` from, so this is genuinely no new dependency. The fix still dispatches exclusively through `onDelete`/`onNodesChange`/`onEdgesChange`, the same `useLiveblocksFlow`-returned mutations acceptance criterion 7 requires — `room.batch(...)` only changes how many Storage commits those three calls produce, not which API performs the mutation, so it doesn't hand-roll a Storage mutation outside `useLiveblocksFlow` and doesn't cross acceptance criterion 7's boundary.

### Why this closes the transient-empty-canvas gap

Before this fix: `onDelete` flushed and broadcast its own Storage update (canvas now empty in Storage), then, in a separate commit, `onNodesChange` flushed the template's nodes, then, in a third separate commit, `onEdgesChange` flushed the template's edges. A remote collaborator subscribed to the same room could receive and render the intermediate state after the first commit and before the second — a real, observable empty-canvas frame.

After this fix: all three mutations execute inside one `room.batch(...)` call. Per the verified `batch()` source, ops from all three nested `useMutation` calls accumulate into the same `currentBatch.ops` array and are dispatched via a single `dispatchOps(currentBatch.ops)` call only once the outermost `batch()` callback returns — so Storage is updated and broadcast exactly once, with the delete and both adds already applied together. There is no intermediate commit a collaborator's subscription could observe between the clear and the repopulate; the empty-canvas state never exists as a distinct, broadcastable Storage snapshot. This directly satisfies the Concrete Deliverables text's explicit requirement ("Removes and adds are batched into one array per call... so collaborators don't see a transient empty-canvas frame between the clear and the repopulate") in substance, using the correct mechanism for this library version (one outer `room.batch(...)` around the two-call-minimum `onDelete`+`onNodesChange`+`onEdgesChange` sequence this version's API actually requires) rather than the brief's literal single-array-per-call sketch, which — per the original Dev Notes and QA's independent source verification — doesn't work at all in the installed `@liveblocks/react-flow` version.

`fitView(...)` is intentionally left outside the batch (it's a React Flow viewport method, not a Liveblocks Storage mutation — batching it would have no effect and isn't required for atomicity).

### Known limitations (updated)

- The cross-collaborator different-template race (two collaborators importing different templates at nearly the same moment) remains an acknowledged, out-of-scope multiplayer edge case per the brief's own Open Questions #3 — unrelated to and unaffected by this fix.
- The prior "3 separate mutations, transient empty-canvas frame" limitation noted in the original Dev Notes' Known Limitations section is superseded by this fix and no longer applies.
- No live two-tab verification was possible in this pipeline (consistent with every prior canvas spec) — the fix is verified via reading `@liveblocks/core`'s real `batch()` source (both this round and independently by QA beforehand) rather than an observed browser session. Recommend a human smoke test importing a template while a second tab is open on the same room, watching specifically for whether the canvas ever renders empty mid-import.

### Gate results (bugfix round)

- `npx tsc --noEmit` — pass, no errors.
- `npx eslint .` — pass, 0 errors, same 1 pre-existing unrelated warning in `.agents/skills/clerk-tanstack-patterns/.../__root.tsx`.
- `npx vitest run --no-file-parallelism` — 280/280 passing across 35 files (97.3s) — 279 pre-existing plus the 1 new batching test.
- `npx next build` — pass, Turbopack, all routes compiled.

### Untouched-files confirmation

Only `components/editor/canvas.tsx`, `components/editor/canvas.test.tsx`, `context/ui-context.md`, and `context/spec-status/18-starter-template.md` were touched this round. `context/progress-tracker.md` was deliberately left untouched per the orchestrator's explicit instruction for this round (see scope note above).

## QA Re-Review — Bugfix round

Overall verdict: **PASS**. Independently re-verified all five items the orchestrator asked for; the Dev Notes' claims hold up against the real installed source, the diff is exactly as scoped, and the full gate reproduces clean.

### 1. Reentrant-batch claim — independently verified against real installed source

Read `node_modules/@liveblocks/core/dist/index.js` directly (not trusted from the Dev Notes' excerpt):

- `batch2(callback)` (~line 13245): `if (context.activeBatch) { return callback(); }` — a nested call, when a batch is already active, runs the callback inline and returns immediately, with no new `activeBatch` object created and no independent flush. Only the outermost call creates `context.activeBatch`, runs the callback in a `try`, and in the `finally` block calls `dispatchOps(currentBatch.ops)` once (only if `currentBatch.ops.length > 0`), then `notify(...)` and `flushNowOrSoon()` once.
- Confirmed *where* ops actually land during a nested call: `onDispatch(ops, ...)` (~line 11935) does `if (context.activeBatch) { for (const op of ops) context.activeBatch.ops.push(op); ... }`. Since a nested `batch2()` call never replaces `context.activeBatch` with a new object, this push target is the *same* outer batch object for all three nested `useMutation` calls — i.e., ops from `onDelete`, `onNodesChange`, and `onEdgesChange` genuinely accumulate into one array, not three.
- Confirmed the nesting actually happens in practice: `node_modules/@liveblocks/react/dist/chunk-JMMTB4CU.js`'s `useMutation_withRoomContext` (~line 4285) wraps every call as `room.batch(() => callback(...))` — so `onDelete`/`onNodesChange`/`onEdgesChange`, each a `useMutation`-returned function, each independently call `room.batch()` when invoked. When invoked from inside `handleImportTemplate`'s outer `room.batch(() => { onDelete(...); onNodesChange(...); onEdgesChange(...) })`, each of these inner `room.batch()` calls hits the `context.activeBatch` truthy branch and folds in.

Net: the claim is correct exactly as stated — a nested `batch()` call folds into `context.activeBatch` rather than flushing independently, so the outer `room.batch(...)` in `handleImportTemplate` produces exactly one `dispatchOps` call covering all three mutations' ops. Not taken on trust — read the source directly, and additionally confirmed empirically (see Item 4 below) that reverting the fix makes the new test fail while every other test stays green, which is only possible if the batching genuinely changes runtime behavior the test can observe.

### 2. `canvas.tsx` diff scope — confirmed

`git diff -- components/editor/canvas.tsx` (working tree vs. HEAD, i.e. the bugfix round's actual diff) shows exactly: `useRoom` added to the existing `@liveblocks/react/suspense` import, `const room = useRoom()` added inside `CanvasFlow`, `room` added to `handleImportTemplate`'s dependency array, and the three mutation calls (`onDelete({ nodes, edges })`, `onNodesChange(nodeChanges)`, `onEdgesChange(edgeChanges)`) moved inside `room.batch(() => { ... })`. `fitView({ duration: ZOOM_TRANSITION_DURATION_MS })` remains its own statement immediately after the `room.batch(...)` call, outside the batch callback — correct, since `fitView` is a React Flow viewport method, not a Liveblocks Storage mutation, and batching it would have no effect. Docblocks were updated to match. No other logic in the file changed (diff is otherwise limited to these lines).

### 3. Full gate — reproduced independently, all green

- `npx tsc --noEmit` — PASS, no errors.
- `npx eslint .` — PASS, 0 errors, 1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/templates/tanstack-basic-auth/src/routes/__root.tsx` (`@next/next/no-head-element`), unrelated to this spec — matches the Dev Notes exactly.
- `npx vitest run --no-file-parallelism` — PASS, 280/280 across 35 files (97.0s) — matches the Dev Notes' claimed figures.
- `npx next build` — PASS, Turbopack, all routes compiled, no new dynamic/static classification issues.

### 4. New test — genuinely asserts the batching behavior, verified by reverting the fix

Read the new test (`components/editor/canvas.test.tsx`, "bugfix round: wraps onDelete/onNodesChange/onEdgesChange in a single room.batch(...) call..."): it asserts `roomBatchMock` is called exactly once, and that `onDeleteMock`/`onNodesChange`/`onEdgesChange`'s first `invocationCallOrder` are each greater than `roomBatchMock`'s own `invocationCallOrder`, i.e. the three mutations actually run as part of the batch callback's execution, not before `room.batch(...)` is invoked. The hoisted `roomBatchMock: vi.fn((callback) => callback())` mirrors real `batch()` behavior (synchronous inline invocation) closely enough for this to be a meaningful ordering check, not a rubber-stamp mock.

Not taken on faith — independently reverted just the fix (`git stash push -- components/editor/canvas.tsx`, i.e. back to the pre-batch 3-separate-mutation version from the original Dev Notes round) and reran `components/editor/canvas.test.tsx` in isolation: the new test failed (`expected "vi.fn()" to be called 1 times, but got 0 times` on the `roomBatchMock` assertion) while the other 17 tests in the file stayed green, confirming the test fails specifically and only against the unfixed code, not everything. Restored the fix afterward (`git stash pop`) and confirmed `canvas.tsx` matches the intended fix again.

One minor, non-blocking observation: the ordering assertions (`invocationCallOrder[0]` comparisons) would not catch a contrived implementation that calls `room.batch(() => {})` with an empty callback and then invokes the three mutations directly afterward in the same synchronous handler — such code would still pass both assertions despite not actually coalescing anything. This is not a real gap in this review, since the actual `canvas.tsx` source was independently read and confirmed to call the three mutations genuinely inside the batch callback (Item 2 above); flagging only as a theoretical test-strictness note for future reference, not something requiring a Dev fix.

### 5. `progress-tracker.md` — confirmed still untouched

`git status --short context/progress-tracker.md` returns nothing — no modification. Consistent with the orchestrator's explicit instruction that this round is scoped to Issue 1 only, and every prior spec's "mark completed" `progress-tracker.md` update lands in a separate commit after QA+PO sign-off, not bundled into the Dev bugfix round. Confirmed via `git diff --stat` (working tree vs. HEAD) that only the 4 expected files changed: `components/editor/canvas.tsx`, `components/editor/canvas.test.tsx`, `context/spec-status/18-starter-template.md`, `context/ui-context.md`.

### Conclusion

Issue 1 from the original QA Report is genuinely resolved: the reentrant-batch mechanism is real (verified against source, not summary), `handleImportTemplate` wraps all three Liveblocks mutations in one `room.batch(...)` with `fitView` correctly left outside it, the full gate is clean, the new test meaningfully distinguishes fixed from unfixed code (empirically confirmed by reverting), and `progress-tracker.md` remains untouched as intentionally scoped. No further Dev action needed for Issue 1. Issue 2 (`progress-tracker.md` housekeeping) remains open per the original QA Report, deferred by design to a separate post-sign-off commit — not a blocker for this round's verdict.

## Handoff

QA re-review PASSED. Routing to Product Owner for sign-off, per this pipeline's usual flow once QA passes. Issue 2 (`progress-tracker.md` "mark completed" update) should still land in its own commit after Product Owner sign-off, matching every prior spec's convention (e.g. spec 17's `69b4dba`, separate from its `71ac064` feat commit).

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Product fit against `project-overview.md`

This spec is a direct, literal hit on **Success Criterion 3** ("A user can import a prebuilt starter design into the canvas") and the Core User Flow's step 4 ("User optionally imports a starter system design template into the canvas"). Before this spec, no starter-template mechanism existed anywhere in the codebase; after it, a signed-in user in a project's canvas can open a navbar-triggered modal, see three genuinely distinct, meaningfully-authored templates (microservices, CI/CD pipeline, event-driven system — each with sensible shape choices: `hexagon` for gateways/event buses, `cylinder` for databases/artifact registries/analytics stores, `diamond` for a CI quality gate, `pill` for services), preview each as a real diagram (not a placeholder image), and import one into the live, Liveblocks-synced canvas. I read `components/editor/starter-templates.ts` directly, not just Dev's description of it — the three templates are real, structurally sound content (positions read as an actual laid-out diagram, not an arbitrary grid; every edge's `source`/`target` resolves to a real node in the same template), not filler.

This also indirectly strengthens **Success Criterion 2** (multiple users collaborating in the same canvas simultaneously): the QA-forced bugfix (wrapping `onDelete`/`onNodesChange`/`onEdgesChange` in one `room.batch(...)`) is specifically what prevents a remote collaborator from observing a transient empty-canvas frame mid-import — a genuine multiplayer correctness fix, not cosmetic. I independently re-read the final `canvas.tsx` (not just the Dev Notes' excerpt) and confirmed `handleImportTemplate` matches exactly what both Dev Notes and QA describe: the three mutations inside `room.batch(...)`, `fitView` correctly left outside it.

No Success Criteria are weakened or put at risk by this spec — it adds a new, isolated import mechanism on a change-dispatch path (`onNodesChange`/`onEdgesChange`/`onDelete`) every prior canvas spec already established, without touching node/edge rendering (Criterion 2's foundation) or any AI/spec-generation surface (Criteria 4/5).

### Independent scope/diff verification (not trusting Dev/QA claims)

Ran `git diff 7500eed -- components/editor/canvas-node.tsx components/editor/canvas-edge.tsx components/editor/shape-visual.tsx components/editor/node-color-toolbar.tsx` (against this branch's real parent, `fix/shape-panel-pointer-drag`'s tip — not `main`) across the *entire* branch, including the still-uncommitted bugfix-round changes in the working tree: **empty, 0 lines**. All four protected rendering files are genuinely byte-for-byte untouched.

Ran `git diff 7500eed --stat` across the same full range (initial commit `16a737a` plus the working-tree bugfix-round diff): the touched-file list is exactly what Dev Notes and QA describe — five new files (`starter-templates.ts`, `starter-template-preview.tsx`, `starter-templates-modal.tsx`, plus their three sibling test files and `workspace-navbar.test.tsx`), three modified wiring files (`workspace-navbar.tsx`, `workspace-shell.tsx`, `canvas.tsx`), their corresponding test files, `context/ui-context.md`, and this status file. No `app/api` route, no `prisma/schema.prisma` change, no new dependency in `package.json` — confirmed via `git diff 7500eed -- app prisma` (empty) and by reading `canvas.tsx`'s import list directly (`useRoom` added to an *existing* `@liveblocks/react/suspense` import, not a new package). `context/progress-tracker.md` is confirmed untouched (`git diff 7500eed -- context/progress-tracker.md` empty), correctly deferred to this review per this pipeline's own convention (Dev only ever marks "In Progress"; PO promotes to "Completed" after PR creation).

Read `components/editor/canvas.tsx` in full (not just the diff): `handleImportTemplate`'s docblock and body match the Dev Notes/QA claims verbatim — `onDelete`/`onNodesChange`/`onEdgesChange` genuinely execute inside `room.batch(() => { ... })`, `fitView({ duration: ZOOM_TRANSITION_DURATION_MS })` is a separate statement immediately after, outside the batch. I did not just trust the QA re-review's "Item 2" diff-scope confirmation — I independently re-derived the same conclusion from the file itself.

Also confirmed `components/editor/starter-templates.ts` directly against Concrete Deliverable requirements: `CanvasTemplate` matches the brief's literal interface, IDs are static human-readable strings (not `generateNodeId()`-shaped), every `templateNode()` call sources its color pair from a `NODE_COLORS`-destructured binding and its size from `SHAPE_DEFAULT_SIZES[shape]` — no invented colors, shapes, or sizes.

Reviewed the `context/ui-context.md` diff directly: the new "Starter Templates" section documents the modal/preview/import mechanism, the `onDelete`-vs-`{type:"remove"}` deviation, and the `room.batch(...)` fix rationale — consistent with the code, not aspirational.

### Scope check

No touches to any `project-overview.md` Out of Scope item (billing, enterprise permission tiers, versioned spec history, production object storage migration, mobile apps) — this spec doesn't come near any of them. No touches to any of this spec's own Out-of-scope callouts either: no template-saving UI, no custom/user-authored template CRUD, no new `app/api` route or Prisma model for templates (confirmed via diff above — `architecture-context.md`'s "resolved by template ID at import time... do not require a separate database record" is satisfied exactly as written, by a plain `.ts` array), and no on-canvas-creation auto-import prompt (only the navbar-button path was built, matching the brief's own reading of `architecture-context.md`'s permissive "at any time" wording).

### The no-confirmation-dialog judgment call (Open Question 6) — my own view, flagged for the human

I formed an independent view on this rather than deferring entirely to the Analyst's recommendation. On balance, I agree **no confirmation dialog is an acceptable posture for this stage**, for reasons beyond what the brief already gave:

- The import action is already gated behind two deliberate clicks (open the Templates modal, then click a specific card's Import button) — it is not a single stray click on the primary canvas surface, unlike, say, an accidental key press.
- Liveblocks undo (spec 17) is a real, working recovery mechanism for the *local* case (the importing user's own accidental click), not a hypothetical — I confirmed `useUndo`/`useRedo` are genuinely wired to `CanvasControlBar` and keyboard shortcuts in this same file.
- Unlike Delete Project (which destroys a project record, its collaborators' access, and its specs permanently, with no undo path at all), a template import only overwrites the *current* room's canvas content — a fundamentally lower-stakes, more-recoverable action, so a different confirmation posture for it is not obviously inconsistent product design, just a different one.

That said, I want to flag this explicitly for the human reviewer rather than silently agree, because the Analyst was right to call out a real asymmetry worth a second look before merge: undo does **not** fully cover the multiplayer case. If a second collaborator is on the canvas when the import happens, their own local edits made in the moments just before the clear could be lost from *their* perspective without any prompt, and Liveblocks' shared undo/redo history stack does not necessarily behave the way a single-user undo would when multiple people have interleaved edits in it (this pipeline has consistently flagged shared-history interleaving as an unresolved edge case, e.g. this spec's own Open Questions #3, and it was never resolved to run live). A confirmation dialog would not fix that underlying multiplayer-undo ambiguity either, so I don't think adding one is a prerequisite for this spec's sign-off — but I recommend the human weigh in on whether this posture (zero confirmation for a full-canvas wipe, recoverable only via a real but not fully proven-safe-for-multiplayer undo) is acceptable before merging, and consider it as a candidate follow-up (either a lightweight confirmation, or an "only enabled when no one else is actively present" gate) rather than blocking this spec on it now.

### `progress-tracker.md` accuracy

Confirmed untouched (see diff verification above), correctly deferred per this pipeline's convention — Dev only marks "In Progress"; the Product Owner promotes to "Completed" with the QA/PO summary and PR link after sign-off. Per this task's explicit instruction, I am not opening a PR or touching `progress-tracker.md` in this round; that step is deferred back to the requester.

### Rough edges — acceptable at this stage

- No live browser/multiplayer verification possible in this pipeline (consistent with specs 11–17) — recommend a human smoke test specifically: (1) import a template with a second tab open on the same room, watching for any transient empty-canvas frame; (2) confirm `fitView` actually frames the new diagram, not stale bounds; (3) confirm Ctrl+Z genuinely restores the pre-import canvas. Not a blocker for this recommendation, consistent with how every prior canvas spec has been judged.
- The disclosed, deliberately out-of-scope cross-collaborator different-template race (two users importing different templates at nearly the same moment) remains unaddressed — correctly scoped out per the brief's own Open Questions #3, not something this spec's text asks to solve, and not a blocker for later specs.
- The no-confirmation-dialog posture discussed above — accepted for this stage, flagged for human awareness, not a blocker.

None of these would block spec 19 or later specs from building on this one correctly — the templates library, preview component, and import mechanism are additive and self-contained, and don't change any interface (`useLiveblocksFlow`'s returned `nodes`/`edges`/`onNodesChange`/`onEdgesChange`/`onDelete`, `CanvasNodeData`/`CanvasEdgeData`) a later spec would depend on.

### Conclusion

All 11 numbered acceptance criteria hold up under my own independent re-verification (not just trusting QA's re-review), including the two items QA's bugfix-round re-review specifically re-checked (the `room.batch(...)` atomicity fix and the `fitView` timing claim) — I re-read the actual `canvas.tsx` source myself rather than relying solely on QA's account of it. Scope is clean against both this spec's own Out-of-scope callouts and `project-overview.md`'s Out of Scope wall. `progress-tracker.md` remains correctly untouched pending this sign-off. The one genuinely debatable product-posture question (no confirmation dialog before a destructive clear) is, in my judgment, acceptable for this stage but flagged above for explicit human attention before merge.

## Handoff

Product Owner PASS — ready for human review. Per this round's explicit task scope, PR creation and the `progress-tracker.md` "Completed" update are deferred back to the requester rather than performed in this pass.
