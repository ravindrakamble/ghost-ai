# Spec 11 — Base Canvas

## Analyst Brief

### Scope statement

This spec replaces the static `CanvasPlaceholder` in the editor workspace with a working, Liveblocks-connected React Flow canvas: a client-side room wrapper (`LiveblocksProvider` / `RoomProvider` / `ClientSideSuspense` / a connection-error fallback), React Flow wired to Liveblocks-synced node/edge state via `useLiveblocksFlow` starting from empty arrays, shared canvas types in `types/canvas.ts`, and default (non-custom) node/edge rendering with a `MiniMap` and dot-pattern background. It delivers the collaborative canvas *foundation* only — no persistence, no custom node/edge visuals, no `Controls` panel, no AI-generated content, and no presence/cursor UI.

### Concrete deliverables

- `package.json` — three new dependencies this spec requires but that are not currently installed: `@liveblocks/react` (`LiveblocksProvider`/`RoomProvider`/`ClientSideSuspense`/`useErrorListener`), `@liveblocks/react-flow` (`useLiveblocksFlow`, optionally `Cursors`), `@xyflow/react` (React Flow itself — `ReactFlow`, `Background`, `MiniMap`, `Node`/`Edge` types). See Open Questions #1.
- `types/canvas.ts` (new) — a node data shape carrying `label`, `color`, `shape`, plus `canvasNode`/`canvasEdge` type identifiers for future custom node/edge registration (not consumed by any rendering component in this spec — see Open Questions #4).
- A new client-side canvas component under `components/editor/` (e.g. `components/editor/canvas.tsx`) replacing `components/editor/canvas-placeholder.tsx` — owns `LiveblocksProvider` (`authEndpoint="/api/liveblocks-auth"`), `RoomProvider` (`id` = the current room ID, `initialPresence` satisfying the full `Presence` type), `ClientSideSuspense` with a simple loading fallback, a connection-error fallback, and an inner component that calls `useLiveblocksFlow({ suspense: true, nodes: { initial: [] }, edges: { initial: [] } })` and renders `<ReactFlow>` with the synced `nodes`/`edges`/change handlers, `connectionMode="loose"`, `fitView`, a `<MiniMap>`, and a dot-pattern `<Background>`.
- `components/editor/workspace-shell.tsx` (modified) — swaps `<CanvasPlaceholder />` for the new canvas component, passing the current project's ID (`project.id`) as the Liveblocks room ID (per spec 10's convention: room ID = project ID).
- `components/editor/canvas-placeholder.tsx` — removed once the new component is wired in (see Open Questions #7).
- Vendor stylesheet imports required by the new packages (`@xyflow/react/dist/style.css`, `@liveblocks/react-flow/styles.css`), imported from wherever the new canvas component lives.

### Acceptance criteria

1. `app/editor/[roomId]/page.tsx` remains a server component — no Liveblocks/React Flow logic is added to the page itself; it continues to resolve access and render `WorkspaceShell`.
2. A new client-side canvas component wraps the canvas surface in `LiveblocksProvider` (`authEndpoint="/api/liveblocks-auth"`, consuming spec 10's route as-is) and `RoomProvider` scoped to the current room ID, with `initialPresence` satisfying the full `Presence` type (`{ cursor: null, thinking: false }`, not just `{ cursor: null }` — see Open Questions #2).
3. The canvas is wrapped in `ClientSideSuspense` with a simple loading fallback, and a distinct fallback is shown when the Liveblocks room connection fails (mechanism left to the Senior Developer — see Open Questions #3).
4. `types/canvas.ts` defines a node data shape supporting `label`, `color`, and `shape`, and defines `canvasNode`/`canvasEdge` type identifiers, without introducing any custom node/edge rendering components or registering them via React Flow's `nodeTypes`/`edgeTypes`.
5. React Flow is wired to Liveblocks-synced state via `useLiveblocksFlow` (`@liveblocks/react-flow`) with `suspense: true`, starting with empty `nodes`/`edges` arrays; the returned `nodes`, `edges`, `onNodesChange`, `onEdgesChange` (and `onConnect`) are passed into `<ReactFlow>`.
6. The rendered canvas has `connectionMode="loose"`, `fitView`, a `<MiniMap>`, and a dot-pattern `<Background>` — no `<Controls>` panel.
7. `components/editor/workspace-shell.tsx` renders the new canvas component in place of `CanvasPlaceholder`, using `project.id` as the room ID; `canvas-placeholder.tsx` is deleted, not left as unused dead code.
8. No canvas snapshot persistence, no AI-generated content, and no custom node/edge visual components are added.
9. `npm run build` passes.
10. `npx tsc --noEmit` and `npx eslint .` pass with no new errors.

### Dependencies

- Spec 10 (Liveblocks Setup) — **complete**. This spec consumes `POST /api/liveblocks-auth` as the `authEndpoint`, and `liveblocks.config.ts`'s `Presence`/`UserMeta` types (via global augmentation) as-is; no changes to either are expected.
- Spec 08 (Editor Workspace Shell) — **complete**. `app/editor/[roomId]/page.tsx`, `WorkspaceShell`, and `CanvasPlaceholder` all exist and are exactly what this spec modifies/replaces.
- Spec 09 (Share Dialog) — **complete**, unrelated but confirms `WorkspaceShell`'s current prop contract (`project: { id, name }`, `isOwner: boolean`), which this spec must not break.
- `LIVEBLOCKS_SECRET_KEY` — **provisioned** in `.env.local` per `progress-tracker.md` (added after spec 10's pipeline round, live-verified against the real Liveblocks API). Unlike spec 10 at its brief time, this spec is not blocked by a missing secret.
- New third-party packages this spec must install: `@liveblocks/react`, `@liveblocks/react-flow`, `@xyflow/react` — none currently in `package.json` (only `@liveblocks/client`/`@liveblocks/node` exist, from spec 10). Confirmed via `package.json` and a `node_modules` glob returning no matches for any of the three.

### Open questions

1. **`useLiveblocksFlow` is real, but requires packages not yet installed.** The spec's implementation step 3 says to "use `useLiveblocksFlow`" without naming a package or flagging installation, mirroring spec 10's now-corrected "already installed" premise. Confirmed against `.claude/skills/liveblocks-best-practices/references/multiplayer-react-flow.md`: `useLiveblocksFlow` (and `Cursors`) are real exports of `@liveblocks/react-flow`, which requires `@xyflow/react` as its underlying React Flow package, and `LiveblocksProvider`/`RoomProvider`/`ClientSideSuspense` come from `@liveblocks/react`. `package.json` and `node_modules` confirm none of these three packages exist in this repo today. Recommendation: the Senior Developer installs all three as part of this spec's work — this is a correction to the spec text, not scope expansion, since the packages are a hard prerequisite for the deliverables the spec itself asks for (same reasoning already accepted for spec 10's `@liveblocks/node`/`@liveblocks/client`).
2. **Initial presence as specified is incomplete.** The spec's implementation step 2 says "initial presence with `cursor: null`," but `liveblocks.config.ts`'s `Presence` type (pinned by spec 10 / `architecture-context.md`'s Realtime Conventions) is `{ cursor: { x, y } | null; thinking: boolean }` — a required, non-optional `thinking` field. Recommendation: `RoomProvider`'s `initialPresence` must be `{ cursor: null, thinking: false }`; omitting `thinking` would fail to satisfy the pinned type, not just be an incomplete-but-valid partial presence.
3. **The error-fallback mechanism isn't specified.** The spec asks for "an error fallback for Liveblocks connection issues" but not how. Two documented patterns exist: `ErrorBoundary` from `react-error-boundary` (a fourth new dependency, per the skill's `rendering-error-components`/`suspense-vs-regular-hooks` references) wrapping `ClientSideSuspense`, or `useErrorListener` (already part of `@liveblocks/react`, no new dependency) driving local error state, per the skill's `handling-connection-errors` reference. Recommendation: prefer `useErrorListener` + local state to avoid a fourth new dependency for a single fallback UI, unless the Senior Developer finds `ErrorBoundary` meaningfully cleaner to wire around `ClientSideSuspense`. Left as an implementation choice, not a product decision — either satisfies the spec's one-line requirement.
4. **Tension between "define `canvasNode`/`canvasEdge` types" and "don't add custom node or edge rendering yet."** Implementation step 4 asks for these type identifiers; Scope Limits explicitly defer custom rendering. Recommendation: define `canvasNode`/`canvasEdge` in `types/canvas.ts` as plain string-literal type identifiers (plus the `label`/`color`/`shape` data shape they'll eventually carry), but do not register them via React Flow's `nodeTypes`/`edgeTypes` props and do not build any node/edge React components in this spec. Since the canvas starts with empty `nodes`/`edges` arrays, nothing will actually reference these type strings yet, satisfying "shared canvas types exist" without pulling forward the rendering work Scope Limits defers.
5. **Whether to define the full `NODE_COLORS`/`NODE_SHAPES` palette constants now.** `ui-context.md`'s Canvas section describes an 8-color, 6-shape palette "defined in `types/canvas.ts`" as if already established, but that file doesn't exist yet — no prior spec created it. Recommendation: define the `label`/`color`/`shape` type shape the spec's step 4 explicitly asks for, but defer the actual `NODE_COLORS`/`NODE_SHAPES` constant arrays to whichever later spec first builds `canvasNode`/`canvasEdge`'s real visual components — that's where they'd actually be consumed. Flagged because a less careful reading of `ui-context.md` could pull the full palette (and implicitly, rendering work) into this spec despite Scope Limits excluding custom rendering.
6. **No live browser verification available in this pipeline.** `code-standards.md` reserves Playwright for "canvas/interaction-level checks," but no spec so far has wired up Playwright, and this pipeline's Dev/QA agents have no interactive browser session. `LIVEBLOCKS_SECRET_KEY` is now provisioned, so a human *can* verify live multiplayer canvas behavior end to end, but the automated pipeline should not claim more than `npm run build`/type-check/lint passing plus a code-level read against the installed SDKs' real types. Recommendation: Dev/QA state this gap explicitly, same treatment as spec 10's documented live-verification limitation, rather than silently implying it was tested.
7. **Whether `canvas-placeholder.tsx` should be deleted or just orphaned.** The spec's own title, "Replace the canvas placeholder," reads as removal. Recommendation: delete `components/editor/canvas-placeholder.tsx` once the new canvas component is wired into `workspace-shell.tsx`, per `code-standards.md`'s "keep modules small and single-purpose" / avoid dead code.

### Out-of-scope callouts

- **Live cursor rendering** (`Cursors` from `@liveblocks/react-flow`) — not requested by any of the spec's implementation-step bullets (no mention of cursors), and `architecture-context.md`'s Realtime Conventions attribute presence-cursor UI to specs 19/24. Excluded even though it would be a small addition once the underlying packages are installed for this spec.
- **Presence avatar stack / "who's online" UI** — spec 19.
- **`thinking`-state UI** — spec 24.
- **`ai-status-feed` `broadcastEvent` / `ai-chat` `LiveList`** — specs 22/24/25; this spec touches only the base room connection and node/edge sync.
- **Canvas snapshot persistence to Vercel Blob** (`canvas/{projectId}.json`) — spec 21 (canvas autosave). This spec's canvas starts empty every load and never saves or loads a snapshot.
- **Starter template import** — a separate feature ("Starter System Designs" in `project-overview.md`), not this spec.
- **AI-generated architecture nodes/edges** — a separate feature ("AI Architecture Generation"), explicitly excluded by the spec's own "don't add AI behavior."
- **Custom node/edge visual components** (shapes, colors actually rendered, hover-revealed connection handles per `ui-context.md`) — explicitly deferred by the spec's own Scope Limits ("don't add custom node or edge rendering yet"); this spec only wires default React Flow node/edge rendering.
- **`<Controls>` panel** — explicitly deferred by the spec's own Scope Limits ("don't add controls yet").
- **Billing, enterprise permission tiers, versioned spec history, production object storage migration, mobile apps** — nothing in this spec's text touches `project-overview.md`'s Out of Scope wall, noted per the standing rule.

## Dev Notes

### Files added

- `types/canvas.ts` — `NodeShape`, `CanvasNodeData` (`label`/`color`/`shape`), `CanvasEdgeData`, and the `CANVAS_NODE_TYPE`/`CANVAS_EDGE_TYPE` string identifiers (plus fully-typed `CanvasNode`/`CanvasEdge` aliases built on `@xyflow/react`'s `Node`/`Edge` generics), per Open Questions #4/#5 — defined but not registered via `nodeTypes`/`edgeTypes`, and not consumed by `components/editor/canvas.tsx` in this spec.
- `components/editor/canvas.tsx` — the client-side canvas wrapper: `LiveblocksProvider` (`authEndpoint="/api/liveblocks-auth"`) → `RoomProvider` (`id={roomId}`, `initialPresence={{ cursor: null, thinking: false }}`) → `CanvasRoomBoundary` (local-state connection-error fallback via `useErrorListener`) → `ClientSideSuspense` (loading fallback) → `CanvasFlow` (`useLiveblocksFlow({ suspense: true, nodes: { initial: [] }, edges: { initial: [] } })` wired into `<ReactFlow>` with `connectionMode={ConnectionMode.Loose}`, `fitView`, `<MiniMap>`, and a dot-pattern `<Background variant={BackgroundVariant.Dots}>`; no `<Controls>`, no `nodeTypes`/`edgeTypes`). Imports both vendor stylesheets (`@xyflow/react/dist/style.css`, `@liveblocks/react-flow/styles.css`) here since this is the only file that renders React Flow.
- `components/editor/canvas.test.tsx` — mocks `@liveblocks/react/suspense`, `@liveblocks/react-flow`, and `@xyflow/react` (all three need a live network connection to do anything real) to verify: `LiveblocksProvider`/`RoomProvider` receive the right `authEndpoint`/room ID/full `Presence` shape; `useLiveblocksFlow` is called with `{ suspense: true, nodes: { initial: [] }, edges: { initial: [] } }` and its returned nodes/edges/handlers reach `<ReactFlow>` with `connectionMode="loose"`, `fitView`, a `MiniMap`, and a `dots` `Background`; and that a `ROOM_CONNECTION_ERROR` reported via the captured `useErrorListener` callback swaps the canvas for the error fallback (and that other error types, e.g. `CREATE_THREAD_ERROR`, are ignored).
- `types/canvas.test.ts` — pins `CANVAS_NODE_TYPE`/`CANVAS_EDGE_TYPE`'s literal string values as a guard against silent renaming, since a future spec will match against these strings when registering `nodeTypes`/`edgeTypes`.

### Files changed

- `components/editor/workspace-shell.tsx` — swaps `<CanvasPlaceholder />` for `<Canvas roomId={project.id} />`; updated the file's doc comment accordingly.
- `components/editor/workspace-shell.test.tsx` — mocks `@/components/editor/canvas` (same reasoning as above — a real Liveblocks room connection doesn't belong in this component-level test) and asserts `WorkspaceShell` renders it with `data-room-id="p1"` in place of the old "canvas coming soon" placeholder-text assertion.
- `package.json` — added `@liveblocks/react`, `@liveblocks/react-flow`, `@xyflow/react` (all `^3.24.0`/`^12.11.3`, matching the already-installed `@liveblocks/client`/`@liveblocks/node` major version where applicable). No `--legacy-peer-deps` needed this time; `npm install` reported 0 peer conflicts for these three.

### Files removed

- `components/editor/canvas-placeholder.tsx` — deleted (not left as dead code) once `Canvas` was wired into `workspace-shell.tsx`, per Open Questions #7's recommendation. Confirmed no remaining code references via a repo-wide grep (only doc/history mentions in `context/` remain, which is expected).

### Skills used

- `liveblocks-best-practices` — read `references/multiplayer-react-flow.md` (confirmed the `useLiveblocksFlow`/`ReactFlow` wiring shape and the exact package names/versions to install), `references/handling-connection-errors.md` (confirmed `useErrorListener`'s `error.context.type === "ROOM_CONNECTION_ERROR"` pattern, used as-is in `CanvasRoomBoundary`), `references/rendering-loading-components.md` and `references/suspense-vs-regular-hooks.md` (confirmed `ClientSideSuspense` + suspense-hook conventions, and that `useErrorListener` is a regular hook usable directly inside `LiveblocksProvider`/`RoomProvider` without needing `ErrorBoundary`/`react-error-boundary`).

### Key decisions

- **Error fallback mechanism**: followed the brief's recommendation — `useErrorListener` (from `@liveblocks/react/suspense`) driving local `useState` in a small `CanvasRoomBoundary` component, rather than `ErrorBoundary` from `react-error-boundary`. Confirmed via the skill that `useErrorListener` only requires being called inside `LiveblocksProvider` (satisfied since `RoomProvider` is nested inside it) — no fourth new dependency needed for a single fallback UI. Only `ROOM_CONNECTION_ERROR` is treated as connection-fatal (auth failure, no access, full room, changed room ID); other `LiveblocksError` context types (e.g. `CREATE_THREAD_ERROR`, not relevant to this spec's Comments-free canvas) are explicitly ignored rather than blanket-triggering the fallback.
- **`connectionMode`/`variant` passed as typed enum members** (`ConnectionMode.Loose`, `BackgroundVariant.Dots`), not the string literals `"loose"`/`"dots"` the spec text uses in prose. Confirmed against `@xyflow/react`'s installed type defs that both props are typed as TS string *enums*, not string-literal unions — a bare string literal doesn't structurally satisfy an enum type under `strict` mode, so the enum member is required to type-check. Behaviorally identical (the enum values are the same strings); this is a type-correctness detail, not a behavior deviation from the brief.
- **`types/canvas.ts` left unconsumed by `canvas.tsx`**, exactly as the brief's Open Questions #4 anticipated — the file exists and type-checks, but nothing in this spec's canvas rendering path imports `CanvasNode`/`CanvasEdge`/`CANVAS_NODE_TYPE`/`CANVAS_EDGE_TYPE`, since the canvas starts and stays empty and uses React Flow's default (untyped) node/edge rendering.
- **`NODE_COLORS`/`NODE_SHAPES` palette constants deferred**, per Open Questions #5 — only the `label`/`color`/`shape` type shape was defined (`color: string`, not a union of the 8 hex pairs), since the constants have no consumer until a later spec builds the actual node component.
- Kept all of `Canvas`'s sub-pieces (`CanvasRoomBoundary`, `CanvasLoading`, `CanvasError`, `CanvasFlow`) as unexported functions in one file (`components/editor/canvas.tsx`), matching the brief's "a new client-side canvas component under `components/editor/`" (singular) — they're small, tightly coupled, and none is reusable outside this room-connection wrapper.
- No `hooks/use-liveblocks-flow.ts` wrapper was added — `useLiveblocksFlow` is a third-party hook consumed directly in `CanvasFlow`, not repo-authored logic that the `hooks/` convention (`architecture-context.md`) is meant to house.

### Test coverage

- `components/editor/canvas.test.tsx` (4 tests, new) — see "Files added" above.
- `types/canvas.test.ts` (1 test, new) — guards the two exported type-identifier string literals.
- `components/editor/workspace-shell.test.tsx` (updated, 3 tests, all still passing) — the placeholder-text assertion was replaced with a room-ID assertion against the now-mocked `Canvas`.
- Commands run, all passing:
  - `npx tsc --noEmit` — clean, no errors.
  - `npx eslint .` — 0 errors (1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/…/__root.tsx`, unrelated to this spec, untouched by it).
  - `npx vitest run` — 136/136 passing across 21 files (was 131/131 before this spec; +5 net: 4 new in `canvas.test.tsx`, 1 new in `types/canvas.test.ts`, workspace-shell.test.tsx's 3 tests unchanged in count).
  - `npx next build` — succeeds; `/editor/[roomId]` still builds as a dynamic (`ƒ`) route, matching spec 08/09's shape; no new build warnings.

### Known limitations / deferrals

- **No live browser verification**, per Open Questions #6 — `LIVEBLOCKS_SECRET_KEY` is provisioned and spec 10 already live-verified the auth route itself, but no live multiplayer canvas session (two browser tabs actually syncing nodes/edges through a real Liveblocks room) was exercised in this pipeline. All verification here is type-level (against the installed SDKs' real `.d.ts` files) and mocked-unit-test-level, same treatment as spec 10's documented limitation.
- Per the spec's own Scope Limits, deliberately not built: `<Controls>` panel, custom node/edge visual components (`nodeTypes`/`edgeTypes` registration), canvas snapshot persistence, AI-generated content, live cursor rendering (`Cursors` from `@liveblocks/react-flow`), and presence avatar/thinking-state UI. All of these are named as later specs' scope in the brief's Out-of-scope callouts.
- The canvas currently starts empty on every load and has no way to persist or reload state across page refreshes — expected per this spec (autosave/snapshot loading is spec 21), not a defect.

## QA Report

**Overall verdict: PASS**

### Mechanical gate

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass — no errors |
| `npx eslint .` | Pass — 0 errors, 1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/.../__root.tsx` (unrelated to this spec, not touched) |
| `npx vitest run` | Pass — 136/136 tests across 21 files |
| `npx next build` | Pass — build succeeds; `/editor/[roomId]` remains a dynamic route |

All figures independently reproduced; they match the Dev Notes claims exactly.

### Acceptance criteria checklist

1. app/editor/[roomId]/page.tsx remains a server component, no Liveblocks/React Flow logic added to the page - Pass. Read the file directly: no "use client", no Liveblocks/React Flow imports; it still only resolves access and renders WorkspaceShell.
2. New client-side canvas component wraps the surface in LiveblocksProvider (authEndpoint="/api/liveblocks-auth") and RoomProvider scoped to the room ID, with initialPresence={{ cursor: null, thinking: false }} - Pass. Confirmed in components/editor/canvas.tsx lines 30-31, and the value matches liveblocks.config.ts's Presence type ({ cursor: {x,y} | null; thinking: boolean }) exactly - thinking is present and required, not omitted.
3. ClientSideSuspense with a loading fallback, plus a distinct connection-error fallback - Pass. CanvasLoading/CanvasError are distinct components; the error fallback is driven by useErrorListener inside CanvasRoomBoundary, gated on error.context.type === "ROOM_CONNECTION_ERROR" (other error types are correctly ignored, per the brief's Open Questions #3 recommendation).
4. types/canvas.ts defines a node data shape with label/color/shape, plus canvasNode/canvasEdge type identifiers, without introducing or registering any custom node/edge rendering components - Pass. CanvasNodeData has all three fields; CANVAS_NODE_TYPE/CANVAS_EDGE_TYPE are plain string constants; grep confirms no nodeTypes/edgeTypes prop usage anywhere in canvas.tsx.
5. React Flow wired to Liveblocks-synced state via useLiveblocksFlow({ suspense: true, nodes: { initial: [] }, edges: { initial: [] } }), with nodes/edges/onNodesChange/onEdgesChange/onConnect passed into <ReactFlow> - Pass. Confirmed in CanvasFlow (canvas.tsx lines 94-114) and exercised by canvas.test.tsx's second test, which asserts the exact call args and that the returned values reach <ReactFlow>.
6. connectionMode="loose", fitView, a <MiniMap>, a dot-pattern <Background>, no <Controls> - Pass. ConnectionMode.Loose/BackgroundVariant.Dots used (typed enum members rather than string literals - confirmed this is required under strict mode since @xyflow/react's props are typed as string enums, not literal unions; behaviorally identical). Grep confirms no Controls import or usage anywhere in the changed files.
7. workspace-shell.tsx renders the new canvas component using project.id as the room ID; canvas-placeholder.tsx deleted - Pass. <Canvas roomId={project.id} /> confirmed in workspace-shell.tsx line 50; components/editor/canvas-placeholder.tsx confirmed absent from the filesystem; repo-wide grep for canvas-placeholder|CanvasPlaceholder returns only historical/doc mentions in context/progress-tracker.md and prior spec-status files (expected).
8. No canvas snapshot persistence, no AI-generated content, no custom node/edge visual components - Pass. Grep for blob|localStorage|fetch(|snapshot and trigger|openai|anthropic|generat in canvas.tsx/types/canvas.ts returns no functional matches (only doc-comment mentions of what was deliberately not built).
9. npm run build passes - Pass, reproduced above.
10. npx tsc --noEmit and npx eslint . pass with no new errors - Pass, reproduced above.

All 10 acceptance criteria pass.

### Architecture invariants (context/architecture-context.md)

- Realtime Conventions: initialPresence matches the pinned Presence shape exactly ({ cursor: null, thinking: boolean }, field name thinking) - confirmed.
- Invariant 1 (no long-running AI work in request handlers): N/A - no request handlers touched in this spec.
- Invariant 2 (metadata vs. blob storage separation): N/A - no storage code added; canvas starts empty every load, consistent with "no persistence" scope limit.
- Invariant 3 (auth/ownership enforced at every mutation boundary): N/A to this spec directly (no new mutation added), but the room connection correctly routes through spec 10's /api/liveblocks-auth, which already enforces this - confirmed the authEndpoint string matches exactly and the route's contract (POST with { room } body, resolved by LiveblocksProvider's default auth flow) lines up with app/api/liveblocks-auth/route.ts's actual implementation.
- Invariant 4 (client components only where needed): Canvas and WorkspaceShell are both "use client", justified by real-time Liveblocks state and local UI toggles respectively - confirmed appropriate.
- Invariant 5 (canvas schema consistency between user content and templates): N/A - no template import logic touches this spec; types/canvas.ts's shape is defined but unconsumed, as intended.

No invariant violations found.

### Standards compliance (context/code-standards.md)

- No "any" usage in any new/changed file - confirmed via grep (only a doc-comment substring match on the word "any" in types/canvas.ts, not a type usage).
- No raw Tailwind color classes (zinc-/slate-) or hardcoded hex values in canvas.tsx/types/canvas.ts/workspace-shell.tsx - confirmed via grep, zero matches. Only token classes (bg-base, text-copy-muted) used.
- components/ui/* untouched - confirmed via git diff main --stat, no components/ui files in the changeset.
- Test files co-located and correctly named (canvas.test.tsx, types/canvas.test.ts, workspace-shell.test.tsx), the jsdom environment docblock present where DOM is needed, third-party SDKs mocked via vi.mock/vi.hoisted rather than hitting real Liveblocks/React Flow - consistent with the Testing section's conventions.
- Hooks convention: no new hooks/ file added; useLiveblocksFlow is consumed directly as a third-party hook inside CanvasFlow, which is a reasonable reading of the convention (it exists to house repo-authored hooks, not to wrap every third-party hook call) - not flagged as a violation.
- package.json diff is exactly the three claimed dependencies (@liveblocks/react, @liveblocks/react-flow, @xyflow/react) at the versions stated - confirmed via git diff main -- package.json.

### Error handling

This spec's only failure mode in scope is the Liveblocks room connection itself (no new mutation/API logic is added). CanvasRoomBoundary correctly narrows on ROOM_CONNECTION_ERROR specifically (covering auth failure, no access, full room, changed room ID per the Dev Notes) and ignores unrelated error contexts (e.g. CREATE_THREAD_ERROR), which is both tested (canvas.test.tsx, tests 3 and 4) and matches the brief's Open Questions #3 recommendation. The loading and error fallbacks are visually distinct components (CanvasLoading vs. CanvasError), satisfying acceptance criterion 3's "distinct fallback" requirement.

### Housekeeping

- context/progress-tracker.md updated to reflect spec 11's Dev pass complete, awaiting QA, with an accurate pointer to context/spec-status/11-base-canvas.md for the full pipeline trail - confirmed via direct read.

### Other verification performed

- Cross-checked initialPresence's literal value against liveblocks.config.ts's declare global { interface Liveblocks { Presence: Presence } } augmentation directly (not just Dev Notes' claim) - matches exactly.
- Confirmed app/api/liveblocks-auth/route.ts (spec 10) resolves the room ID from body.room and that LiveblocksProvider's default behavior is to POST { room: roomId } to authEndpoint - the two contracts line up without any custom authEndpoint function needed.
- Confirmed via git diff main --stat that the full changeset is scoped to exactly the files the Dev Notes claim (canvas.tsx, canvas.test.tsx, types/canvas.ts, types/canvas.test.ts, workspace-shell.tsx/.test.tsx, canvas-placeholder.tsx deletion, package.json/package-lock.json, progress-tracker.md, this spec-status file) - no unexplained scope creep.
- Per this task's instructions and consistent with spec 08's QA treatment: this spec cannot be visually verified in a browser in this environment (no interactive session, and per the brief's Open Questions #6, live multiplayer canvas behavior requires two real tabs against a live Liveblocks room). This is noted as an expected limitation of the pipeline, not a defect - all verification performed here is type-level (against the real installed .d.ts files), mocked-unit-test-level, and static-analysis-level (grep/diff/build).

### Issues found

None. No [Bug -> Dev] or [Spec gap -> Analyst] items to log.

### Handoff

QA passed - ready for Product Owner review.

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Success criteria fit

This is the first spec to render an actual collaborative canvas surface, judged against `project-overview.md`'s Success Criteria:

- **Criterion 2** ("Multiple users can collaborate in the same canvas simultaneously") — this spec makes the criterion concretely visible for the first time: `WorkspaceShell` now renders `<Canvas roomId={project.id} />`, which wraps a real `LiveblocksProvider`/`RoomProvider` (scoped to the project via spec 09/10's access + auth chain) around a `useLiveblocksFlow`-synced React Flow surface. Two collaborators opening the same project would now join the same Liveblocks room and see the same (currently empty) node/edge state sync between them via `onNodesChange`/`onEdgesChange`/`onConnect`. That is a genuine, load-bearing step toward Criterion 2 — not just infrastructure sitting behind a criterion (spec 10's framing), but the first spec where the criterion's mechanism is actually wired end to end at the code level. It is not yet *demonstrated* live (see Rough edges below), and there is nothing to look at yet (empty canvas, no cursors, no presence UI — those are specs 19/24), but the sync plumbing itself is real and correctly scoped. This reading matches the brief's own framing and QA's "N/A, but routes through spec 10 correctly" note on Invariant 3 — I confirm it holds up under review, not just as a stated intention.
- No other Success Criterion (1, 3, 4, 5, 6) is claimed or touched by this spec, correctly.

### Scope check against project-overview.md

- **Out of Scope wall** (billing, permission tiers, versioned spec history, production object storage migration, mobile apps) — untouched, nothing in this diff comes close.
- **This spec's own Scope Limits**, each independently confirmed by direct read of `components/editor/canvas.tsx`:
  - No `<Controls>` — confirmed absent (grep and direct read of `CanvasFlow`'s JSX, which renders only `<MiniMap>` and `<Background variant={BackgroundVariant.Dots}>`).
  - No custom node/edge rendering — confirmed no `nodeTypes`/`edgeTypes` prop anywhere; `types/canvas.ts`'s `CANVAS_NODE_TYPE`/`CANVAS_EDGE_TYPE` are unreferenced outside their own file and its test.
  - No persistence logic — confirmed no `fetch`/blob/localStorage calls; `useLiveblocksFlow` starts from `{ initial: [] }` for both nodes and edges every load, which is Liveblocks Storage sync (in-room, in-memory-on-the-server-side-of-Liveblocks), not app-level snapshot persistence to Vercel Blob (that's spec 21's job, correctly deferred).
  - No AI behavior — confirmed, nothing in this diff touches prompts, generation, or `broadcastEvent`/chat.
  - No live cursor rendering (`Cursors` from `@liveblocks/react-flow`) or presence UI — confirmed absent, correctly deferred to specs 19/24 per the brief's Out-of-scope callouts.
- Diff surface is exactly what Dev Notes/QA claim (`git diff main..spec/11-base-canvas --stat`): `canvas.tsx`/`.test.tsx`, `types/canvas.ts`/`.test.ts`, `workspace-shell.tsx`/`.test.tsx` changes, `canvas-placeholder.tsx` deletion, `package.json`/lock, progress-tracker, this status file. No unexplained scope creep.

### `types/canvas.ts` defined-but-unconsumed — sanity check

This is a reasonable interim state, not a red flag. Reasoning holds: the file exists solely to pin a shared vocabulary (`CanvasNodeData`'s `label`/`color`/`shape`, `CANVAS_NODE_TYPE`/`CANVAS_EDGE_TYPE` string identifiers) that a later spec building actual custom node/edge components will need to agree on rather than reinvent — the pinned literal-string test (`types/canvas.test.ts`) exists specifically to guard against silent renaming before that consumer shows up. Registering `nodeTypes`/`edgeTypes` now, or building the `NODE_COLORS`/`NODE_SHAPES` palette constants `ui-context.md` describes, would have pulled real rendering work into a spec whose own Scope Limits explicitly exclude it — correctly resisted per Open Questions #5's own reasoning. The risk this pattern normally carries (dead code nobody will ever wire up) is mitigated here because the type shape is small, cheap to define, load-bearing for a concretely-named future spec, and test-guarded — not speculative scaffolding for an undefined future.

### Rough edges — acceptable at this stage

- **No live browser/multiplayer verification.** Same category and same treatment as spec 10's documented gap: this pipeline has no interactive browser session, so two-tab real-time sync (nodes/edges actually propagating between two live Liveblocks room connections) has not been exercised — only type-level (against installed `.d.ts` files), mocked-unit-test-level (`canvas.test.tsx`'s 4 tests, all three SDKs mocked), and static-analysis-level (grep/diff/build) verification exists. Unlike spec 10, this spec doesn't need a *new* secret provisioned (`LIVEBLOCKS_SECRET_KEY` already closed out after spec 10's round) — what's missing here is purely an interactive browser, not a missing credential. This is consistent with how spec 10's live-API gap was handled: flagged explicitly in Dev Notes/QA rather than silently implied as tested, not blocking a PASS, and appropriately left for a human smoke test (open the same project in two browser windows/profiles, confirm a node move in one appears in the other) before this is treated as end-to-end proven. Recommend the human do that smoke test at some point before specs 19+ (presence/cursors) build further on top of this room-connection assumption, though nothing about this spec's code gives reason to doubt it will work — the wiring matches the Liveblocks SDK's documented `useLiveblocksFlow` contract exactly, and the auth handshake it depends on (spec 10) was already live-verified against the real API.
- **Canvas is empty and has no persistence across refresh** — explicitly expected per this spec's scope (autosave/snapshot loading is spec 21), not a defect.
- Neither rough edge blocks a later spec from building correctly on top of this one: the room-connection/sync contract is stable and typed, and `types/canvas.ts`'s shape is pinned and test-guarded for the next spec that needs it.

### progress-tracker.md accuracy

The "In Progress" entry for spec 11 accurately reflects what was actually built and verified: correct file list (`canvas.tsx`, `types/canvas.ts`, `workspace-shell.tsx` change, `canvas-placeholder.tsx` deletion, `package.json` additions), correct test/build figures (136/136 across 21 files, tsc/eslint/build all passing), and it does not overstate this as "live multiplayer verified" — it stays at the level of what was actually checked. No correction needed to the entry's content; per this pipeline's process it should now move from "In Progress" to "Completed" (with the PR link) — done below since the verdict is PASS.

### PR creation

- `gh auth status` confirms an authenticated session (`ravindrakamble`, `repo` scope) — no blocker here, unlike spec 09's round.
- `git branch -a` confirms `spec/11-base-canvas` exists locally with one commit ahead of `main` (`f6a714a`), so there is real work to hand off.
- Proceeding to push the branch and open a PR against `main` (not merging).
