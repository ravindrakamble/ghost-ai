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
