# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase
- Phase 14: Node Editing — Senior Developer pass done, QA next.

## Current Goal
- QA pass on feature spec 14 (Node Editing).

## Completed

- Feature spec 13: Node Shape
  - `components/editor/shape-visual.tsx` (new) — shared shape-geometry component (`ShapeVisual`) consumed by both `canvas-node.tsx` and `shape-panel.tsx`'s drag preview: CSS `<div>` for rectangle/pill/circle, inline scaling `<svg viewBox="0 0 100 100" preserveAspectRatio="none">` for diamond/hexagon/cylinder. Border/stroke subtle at rest (`border-surface-border`/`var(--border-default)`), brand accent when selected (`border-brand`/`var(--accent-primary)`).
  - `components/editor/canvas-node.tsx` (modified) — replaced the spec-12 placeholder (bordered rectangle for every shape) with `ShapeVisual`, wired to React Flow's real `NodeProps.selected`.
  - `components/editor/shape-panel.tsx` (modified) — added a cursor-attached ghost drag preview via native `dataTransfer.setDragImage`, backed by 6 always-mounted, off-screen preview elements (one per shape, sized per `SHAPE_DEFAULT_SIZES`) so `setDragImage` always has an already-rendered DOM node at `dragstart`. Panel's own layout/buttons unchanged.
  - `context/ui-context.md` (modified) — documented the shape-rendering rules and the drag-preview mechanism under Canvas.
  - No changes to `lib/canvas-shapes.ts`, `types/canvas.ts`, or `canvas.tsx`'s drop/node-creation logic — confirmed empty diff, out of scope per the brief.
  - `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (180/180 across 25 files), `npx next build` all pass.
  - QA: PASS, no bugs or spec gaps found. All 11 acceptance criteria independently re-verified against the code, including reading `shape-visual.tsx`/`canvas-node.tsx`/`shape-panel.tsx` in full (not just the diff) to confirm no fixed-pixel SVG dimensions and that `selected` is genuinely sourced from React Flow's real `NodeProps`. Byte-for-byte confirmation via `git diff` that `lib/canvas-shapes.ts`, `types/canvas.ts`, and `canvas.tsx` were untouched.
  - Product Owner: PASS — ready for human review (round 1, no escalation). Confirmed this spec closes a real product-quality gap toward Success Criterion 2 (collaborative canvas): previously every node shape rendered as an identical bordered rectangle, undermining the canvas's purpose as an architecture-diagramming surface where shape conveys role (decision/gateway, database/storage, external system). Also de-risks future Criteria 4/5 (AI-generated nodes, spec generation) by giving `data.shape` real visual meaning ahead of time. Scope check clean against `project-overview.md`'s Out of Scope wall and this spec's own Scope Limits (no shape-panel layout rebuild, no change to node creation, no resize/label editing, drag changes limited to the ghost preview) — confirmed at the byte level via diff. No live browser drag-and-drop verification possible in this pipeline — flagged as an acceptable rough edge, not blocking, recommended as a human smoke test (drag each of the 6 shapes, confirm the ghost preview matches the dropped node's shape/size, confirm the preview disappears on both drop and a cancelled drag) before considering this fully done.
  - **PR not yet opened.** Branch `spec/13-node-shape` was pushed to `origin` (commit `04f7e7e`), but `gh pr create` was blocked by the review environment's auto-mode permission classifier (confirmed not a `gh auth`/tooling gap — `gh auth status` succeeded and a minimal test call was blocked identically). Human needs to open the PR against `main` manually (branch and commit are ready) or grant permission for this action; see "Next Up".
  - Full pipeline trail in `context/spec-status/13-node-shape.md`.

- Feature spec 12: Shape Panel
  - `lib/canvas-shapes.ts` (new) — shared, non-component logic: `CANVAS_SHAPES` (ordered list), `SHAPE_DEFAULT_SIZES` (per-shape default `{ width, height }` table), `SHAPE_LABELS`, `CANVAS_DRAG_MIME_TYPE`, `serializeShapeDragPayload`/`parseShapeDragPayload` (validates untrusted `dataTransfer` input at the drop boundary), `generateNodeId` (shape + timestamp + counter + a short random suffix to close a low-probability cross-client collision gap), `createDroppedNode`.
  - `components/editor/canvas-node.tsx` (new) — `CanvasNode`, the first custom node renderer registered for `CANVAS_NODE_TYPE`: bordered rectangle, centered label (or an "Untitled" placeholder), fill/text color from `data.color`/`DEFAULT_NODE_TEXT_COLOR`. No shape-specific SVGs yet (later spec).
  - `components/editor/shape-panel.tsx` (new) — `ShapePanel`, the floating pill-shaped toolbar (bottom-center, `rounded-full`/`bg-elevated`/`border-surface-border`) with 6 draggable icon buttons (lucide `Square`/`Diamond`/`Circle`/`Pill`/`Cylinder`/`Hexagon`); `dragstart` sets the shape/size `dataTransfer` payload.
  - `types/canvas.ts` (modified) — added `DEFAULT_NODE_COLOR` (`#1F1F1F`) and `DEFAULT_NODE_TEXT_COLOR` (`#EDEDED`), both per `ui-context.md`'s documented default pairing. No full `NODE_COLORS` palette yet (not needed by this spec).
  - `components/editor/canvas.tsx` (modified) — wraps `CanvasFlow` in `ReactFlowProvider` (required for `useReactFlow()`/`screenToFlowPosition`, since `<ReactFlow>` doesn't auto-provide that context to its own instantiating component); adds `onDragOver`/`onDrop` directly as `<ReactFlow>` props (verified to land on the real wrapper div via prop passthrough); registers `nodeTypes={{ [CANVAS_NODE_TYPE]: CanvasNode }}`; on drop, adds the new node via `onNodesChange([{ type: "add", item: newNode }])` (the only node-mutation mechanism `useLiveblocksFlow` exposes); renders `<ShapePanel>` in the canvas's existing `relative` wrapper.
  - `context/ui-context.md` (modified) — documented the new floating shape-panel pill-toolbar convention under Canvas.
  - `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (159/159 across 24 files), `npx next build` all pass.
  - QA: PASS, no bugs or spec gaps found. All 9 acceptance criteria independently re-verified against the code, all mechanical checks independently reproduced. Went further than prior specs by reading the real unminified `@liveblocks/react-flow` source to confirm the `"add"` NodeChange genuinely writes into the room's Liveblocks `LiveMap`, and confirmed `ReactFlowProvider` correctly wraps the component calling `useReactFlow()`.
  - Product Owner: PASS — ready for human review (round 1, no escalation). Confirmed this is the first spec where a user can actually add visible content to the shared canvas — a concrete step toward Success Criterion 2 ("multiple users can collaborate in the same canvas simultaneously"), building on spec 11's room/sync mechanism. Scope check clean against `project-overview.md`'s Out of Scope wall and this spec's own scope limits (no shape-specific SVGs, no edges, no node editing after creation, no `Controls` panel, no persistence, no AI). `DEFAULT_NODE_TEXT_COLOR`'s addition beyond the brief's literal text confirmed as a reasonable, documented judgment call, same precedent as spec 10's `CURSOR_COLORS`. No live browser drag-and-drop verification possible in this pipeline — flagged as an acceptable rough edge, not blocking, recommended as a human smoke test (drag each of the 6 shapes onto the canvas, confirm a node appears at roughly the drop position, confirm visible in a second browser tab) before considering this fully done.
  - PR opened against `main`: [PR #5](https://github.com/ravindrakamble/ghost-ai/pull/5) — not yet merged, human's call.
  - Human manual smoke test confirmed: dragging shapes from the panel creates nodes visible in both browser tabs simultaneously — the drop → `onNodesChange("add")` → Liveblocks `LiveMap` → sync path QA traced through source is confirmed working live, not just in unit tests.
  - Full pipeline trail in `context/spec-status/12-shape-panel.md`.

- Feature spec 11: Base Canvas
  - `components/editor/canvas.tsx` (new) — client-side canvas wrapper: `LiveblocksProvider`/`RoomProvider` (room ID = `project.id`, `initialPresence={{ cursor: null, thinking: false }}`) → `CanvasRoomBoundary` (local-state connection-error fallback via `useErrorListener`, no `react-error-boundary` dependency added) → `ClientSideSuspense` → `CanvasFlow` (`useLiveblocksFlow({ suspense: true, nodes: { initial: [] }, edges: { initial: [] } })` wired into `<ReactFlow connectionMode={ConnectionMode.Loose} fitView>` with `<MiniMap>` and a dot-pattern `<Background>`; no `<Controls>`, no custom node/edge rendering).
  - `types/canvas.ts` (new) — `CanvasNodeData` (`label`/`color`/`shape`), `CanvasEdgeData`, and `CANVAS_NODE_TYPE`/`CANVAS_EDGE_TYPE` identifiers, defined but not yet registered or consumed anywhere (future custom-rendering spec's job).
  - `components/editor/workspace-shell.tsx` (modified) — renders `<Canvas roomId={project.id} />` in place of the deleted `CanvasPlaceholder`.
  - `components/editor/canvas-placeholder.tsx` — deleted, no remaining references.
  - `package.json` — added `@liveblocks/react`, `@liveblocks/react-flow`, `@xyflow/react`.
  - `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (136/136 across 21 files), `npx next build` all pass.
  - QA: PASS, no bugs or spec gaps found. All 10 acceptance criteria independently re-verified against the code, all mechanical checks independently reproduced, `canvas-placeholder.tsx` confirmed deleted with no remaining references.
  - Product Owner: PASS — ready for human review (round 1, no escalation). Confirmed this is the first spec where the collaboration mechanism behind Success Criterion 2 is wired end to end at the code level (same project → same Liveblocks room → synced node/edge state), building on spec 09 (collaborator access) and spec 10 (room auth). Scope check clean against `project-overview.md`'s Out of Scope wall and this spec's own Scope Limits (no `Controls`, no custom node/edge rendering, no persistence, no AI behavior). `types/canvas.ts`'s defined-but-unconsumed state confirmed as a reasonable, test-guarded interim decision rather than dead code. No live browser/multiplayer verification possible in this pipeline (no interactive session) — flagged as an acceptable rough edge, not blocking, recommended as a human smoke test before specs 19+ (presence/cursors) build further on this room-connection assumption.
  - Merged to `main` via [PR #4](https://github.com/ravindrakamble/ghost-ai/pull/4). Human manual test confirmed the room-auth path works live (surfaced and cleared a one-time dev-server cold-compile timeout on first load — `/api/liveblocks-auth`'s cold compile plus its chain of Prisma/Clerk/Liveblocks calls exceeded Liveblocks' 10s client auth timeout on the very first hit; resolved on reload, not a code defect). Two-tab room connection confirmed live via the Liveblocks Dashboard (2 connected users shown for the same room when the project was open in two tabs) — the actual mechanism spec 11 delivers. Node/edge sync itself can't be exercised until spec 12 (Shape Panel) adds node-creation UI.
  - Full pipeline trail in `context/spec-status/11-base-canvas.md`.

- Feature spec 10: Liveblocks Setup
  - `liveblocks.config.ts` (root) — `Presence` (`cursor: { x, y } | null`, `thinking: boolean`) and `UserMeta` (`{ id: string; info: { name, avatar, color } }`) types, global type augmentation.
  - `lib/liveblocks.ts` — `getLiveblocksClient()`, a lazily-instantiated, `globalThis`-cached `@liveblocks/node` singleton (deferred so a missing `LIVEBLOCKS_SECRET_KEY` doesn't break `next build`'s page-data collection); `lib/liveblocks-color.ts` — pure `getCursorColor(userId)` string-hash → fixed 8-color palette mapping.
  - `app/api/liveblocks-auth/route.ts` — `POST` handler: Clerk auth (401) → `getProjectAccess` (404/403) → `getLiveblocksClient()` (500 if unconfigured) → idempotent `getOrCreateRoom(roomId, { defaultAccesses: [] })` → `prepareSession(...).allow(roomId, ["room:write"]).authorize()`.
  - `package.json` — added `@liveblocks/node` and `@liveblocks/client` (spec's premise that these were pre-installed did not hold).
  - `.env.local` — a real `LIVEBLOCKS_SECRET_KEY` is now provisioned (added 2026-08-19, after the pipeline round below). Live end-to-end verification against the real Liveblocks API confirmed working: `getOrCreateRoom` created a room, `prepareSession(...).authorize()` returned `200` with a session token body, `deleteRoom` cleaned it up — closing the human-provisioning gap flagged during the pipeline round.
  - `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (131/131 across 19 files), `npx next build` all pass (build confirmed to pass even with `LIVEBLOCKS_SECRET_KEY` unset).
  - QA: PASS, no bugs or spec gaps found. All 11 acceptance criteria independently re-verified against the code, including cross-checking the Liveblocks SDK usage (`getOrCreateRoom`, `prepareSession`/`Session.allow`/`authorize`) directly against `@liveblocks/node`'s real type definitions.
  - Product Owner: PASS — ready for human review (round 1, no escalation). Confirmed this spec delivers the authorization boundary (`getOrCreateRoom(roomId, { defaultAccesses: [] })`) that makes spec 11's shared-room canvas access safe, without itself adding any UI/canvas/`RoomProvider` — consistent with how specs 08/09 were judged as necessary preconditions rather than end-to-end demonstrations of Success Criterion 2.
  - Merged to `main` via [PR #3](https://github.com/ravindrakamble/ghost-ai/pull/3).
  - Full pipeline trail in `context/spec-status/10-liveblocks-setup.md`.

- Feature spec 09: Share Dialog
  - New: `types/collaborator.ts`; `lib/collaborators.ts` (list/invite/remove against `prisma.projectCollaborator`, live Clerk Backend API enrichment, no new local user table); `app/api/projects/[projectId]/collaborators/route.ts` (`GET` owner-or-collaborator, `POST` owner-only); `app/api/projects/[projectId]/collaborators/[collaboratorId]/route.ts` (`DELETE` owner-only); `hooks/use-collaborators.ts`; `components/editor/share-dialog.tsx`.
  - Modified: `lib/project-access.ts` (`ProjectAccessResult`'s `ok: true` branch now also returns `isOwner: boolean`); `app/editor/[roomId]/page.tsx` (threads `isOwner` through); `components/editor/workspace-navbar.tsx` (Share button now opens the dialog instead of being inert); `components/editor/workspace-shell.tsx` (owns `useCollaborators` + dialog open state; the collaborator fetch is triggered from the Share button's click handler rather than a `useEffect`, to satisfy `eslint-plugin-react-hooks`'s `set-state-in-effect` rule — `ShareDialog` itself is presentational).
  - `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (110/110 across 16 files), `npx next build` all pass.
  - QA: PASS, no bugs or spec gaps found. All 11 acceptance criteria independently re-verified against the code (not just Dev's claim), including confirming the owner-only mutation gate (`getOwnedProjectOrError`) is enforced server-side independent of the client's `isOwner` UI-gating, and that no local user table was introduced.
  - Product Owner: PASS — ready for human review (round 1, no escalation). Confirmed this spec is the actual mechanism by which a project becomes accessible to anyone besides its owner — the precondition Success Criterion 2 ("multiple users can collaborate") and spec 10 (realtime canvas) depend on. Scope check confirmed clean against `project-overview.md`'s Out of Scope list: no local user table, no email-sending/notification system, no permission tiers beyond owner/collaborator, no Liveblocks/room-membership changes, `prisma/schema.prisma` and `package.json` both diff-empty.
  - **PR not yet opened.** No `spec/09-share-dialog` branch exists — this spec's work (along with specs 07 and 08's) sits as uncommitted changes on `feat/prisma-postgres-and-project-apis`, which only has committed history through specs 05–06. `gh` CLI is also unavailable in the review environment. Both need human attention before a PR can be created; see "Next Up".
  - Full pipeline trail in `context/spec-status/09-share-dialog.md`.

- Feature spec 08: Editor Workspace Shell
  - `app/editor/[roomId]/page.tsx` (new) — async server component. Resolves `lib/project-access.ts#getProjectAccess`; redirects unauthenticated to `/sign-in`, renders `AccessDenied` for missing/unauthorized projects, otherwise renders `WorkspaceShell` with the real project `{ id, name }`.
  - `lib/project-access.ts` (new) — `getCallerIdentity()` + `getProjectAccess()`, an owner-or-collaborator *view*-access gate kept fully separate from `lib/projects.ts#getOwnedProjectOrError` (owner-only, mutation routes).
  - `components/editor/access-denied.tsx` (new), `components/editor/workspace-shell.tsx` + `workspace-navbar.tsx` + `canvas-placeholder.tsx` + `ai-sidebar-placeholder.tsx` (new) — static, non-functional workspace layout; AI-sidebar toggle is real local UI state, Share button is inert (spec 09 wires it up).
  - `components/editor/project-sidebar.tsx` (modified) — reads `useParams().roomId` to highlight the active project in both the owned and shared lists.
  - Testing infra gap found and fixed: `vitest.setup.ts` (new, wired via `vitest.config.mts`) — jest-dom matchers and RTL `cleanup()` weren't actually active despite being "installed" per spec 06's Testing section (latent gap, only surfaced by this spec's multi-`it` component tests). Documented in `context/code-standards.md`.
  - `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (61/61 across 11 files), `npx next build` all pass.
  - QA: PASS, no bugs or spec gaps found. All 10 acceptance criteria independently re-verified against the code (not just Dev's claim), including grepping for accidental Liveblocks/React Flow imports and confirming the mutation-only owner gate (`getOwnedProjectOrError`) was left untouched.
  - Product Owner: PASS — ready for human review (round 1, no escalation). Confirmed this spec is the piece that makes "open a project" (Success Criterion 1) real — `/editor/[roomId]` previously had no destination page. No scope creep into Liveblocks/canvas (spec 10), AI chat (specs 20/25/26), or share behavior (spec 09); project-overview.md's Out of Scope wall untouched. `lib/project-access.ts` confirmed cleanly separated from spec 06's mutation-only owner gate, which spec 09/10 depend on.
  - Full pipeline trail in `context/spec-status/08-editor-workspace-shell.md`.

- Feature spec 07: Wire Editor Home
  - `app/editor/layout.tsx` is now an async server component: fetches owned + shared projects via new `lib/projects.ts#getProjectsForUser` (Clerk `currentUser()` id + primary email; `ProjectCollaborator` keyed by email) and threads both lists as props through `EditorShell` → `ProjectDialogsProvider` → `ProjectSidebar`. `app/editor/page.tsx` is back to a server component; its "New Project" button moved into a new client leaf, `components/editor/editor-home-empty-state.tsx`.
  - New `hooks/use-project-actions.ts` replaces the mock `useProjectDialogs` hook: owns dialog state and real create/rename/delete calls against spec 06's `app/api/projects` routes (contracts unchanged). Create navigates using the server-returned project ID (not the cosmetic `slug-suffix` room-ID preview, which stays UI-only). Delete's "active workspace" redirect-vs-refresh check reads `useParams().roomId`, which is a no-op until spec 08 adds `/editor/[roomId]`.
  - Removed now-dead mock code: `components/editor/use-project-dialogs.ts`, `lib/mock-projects.ts`. `types/project.ts` trimmed to `{ id, name }` (`slug` was never a persisted column; it's derived at render time via `lib/slug.ts`, now including a new `generateShortSuffix()`).
  - `npx tsc --noEmit`, `npx eslint`, `npx vitest run` (40/40 across 6 files), `npx next build` all pass.
  - QA: PASS, no bugs or spec gaps found. All 8 acceptance criteria independently verified against the code (not just Dev's claim), including confirming the mock files/references are fully deleted.
  - Product Owner: PASS — ready for human review (round 1, no escalation). Confirmed no scope creep into spec 08 (workspace route/access checks), spec 09 (collaborator invite/remove UI), or spec 10 (Liveblocks); `app/api/projects` contracts and `prisma/schema.prisma` confirmed untouched. Navigating to a newly created project currently has no destination page (`/editor/[roomId]` doesn't exist until spec 08) — expected and documented as a known limitation, not a defect of this spec.
  - Full pipeline trail in `context/spec-status/07-wire-editor-home.md`.

- Feature spec 06: Project APIs
  - `lib/projects.ts` — `getAuthenticatedUserId`, `getOwnedProjectOrError`, `DEFAULT_PROJECT_NAME` shared auth/ownership helper.
  - `lib/api-response.ts` — `errorResponse()` envelope helper.
  - `app/api/projects/route.ts` — `GET` (list owner's projects), `POST` (create; empty name defaults to "Untitled Project").
  - `app/api/projects/[projectId]/route.ts` — `PATCH` (rename), `DELETE`; both enforce 401/404/403 precedence.
  - `prisma/schema.prisma` — added `Project`, `ProjectCollaborator` models + `ProjectStatus` enum (migration `20260819021510_add_project_and_collaborator`, applied to the linked database) — this was spec 05's originally-planned schema, never actually shipped until now.
  - `lib/prisma.ts` — fixed a pre-existing `tsc` error on the (unused) Accelerate branch: Prisma 7's generated client has no zero-arg constructor, so it now passes `{ accelerateUrl: databaseUrl }`.
  - First spec needing tests: added Vitest + React Testing Library (`vitest.config.mts`; decision recorded in `context/code-standards.md`'s new Testing section; installed with `--legacy-peer-deps` due to a Babel 7/8 peer conflict between `@vitejs/plugin-react` and `shadcn`). 20/20 unit tests passing across 3 files.
  - `npx tsc --noEmit`, `npx eslint`, `npx next build`, `npx vitest run` all pass — independently re-verified by QA, not just Dev's claim.
  - QA: PASS, no bugs or spec gaps found (one non-blocking behavioral observation: `POST` treats malformed/missing JSON as an empty body rather than 400 — documented, not a violation).
  - Product Owner: PASS — ready for human review (round 1, no escalation). Two product-shaped open questions correctly deferred to spec 07's Analyst pass rather than decided here: whether `GET /api/projects` should include collaborator-shared projects, and project-ID vs. Liveblocks room-ID slugging.
  - Full pipeline trail in `context/spec-status/06-project-apis.md`.
  - Scope note: backend only, per the brief — no UI wiring, no collaborator routes, no blob storage. Spec 07 owns wiring this into `/editor`.

- Feature spec 05: Prisma Postgres
  - Installed `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `dotenv`, `tsx`, `@types/node`, `@types/pg`.
  - Linked existing Prisma Postgres database (`db_cmszekrwi4jg519eexz26jiko`) via `prisma postgres link`; wrote `DATABASE_URL` to `.env` (gitignored via existing `.env*` rule, confirmed untracked).
  - Prisma 7 schema note: `datasource db { url = env(...) }` in `schema.prisma` is no longer supported — connection URL lives only in `prisma.config.ts` (`datasource.url`), and `PrismaClient` takes an `adapter` (or `accelerateUrl` for Accelerate) instead of reading the schema's `url`.
  - `prisma/schema.prisma`: `prisma-client` generator (output `../generated/prisma`), starter `Author`/`Post` models (1:many). `generated/prisma` is gitignored.
  - `prisma.config.ts`: schema path, `migrations.path`/`migrations.seed` (`tsx prisma/seed.ts`), `datasource.url` from `process.env.DATABASE_URL`.
  - `lib/prisma.ts`: singleton `PrismaClient`, branches on `DATABASE_URL` prefix — `PrismaPg` adapter for `postgres://` (this project's case), no adapter for `prisma+postgres://` (Accelerate).
  - Ran `prisma migrate dev --name init`, `prisma generate`, `prisma db seed` (`prisma/seed.ts` seeds one author + 3 posts) — all succeeded against the live database.
  - `scripts/verify-prisma.ts` and `prisma/seed.ts` both need `import "dotenv/config"` directly — unlike Prisma CLI commands (which load `.env` via `prisma.config.ts`), a bare `tsx` invocation has no parent process populating `process.env`.
  - `npx tsx scripts/verify-prisma.ts` → `✅ Connected — found 1 author row(s).`

- Feature spec 04: Project Dialogs
  - `/editor` home now renders an empty-state prompt (heading, description, `New Project` button) instead of the placeholder canvas text; content is not wrapped in a card.
  - Added `types/project.ts` (`Project`, `ProjectRole`), `lib/mock-projects.ts` (mock owner/collaborator projects), and `lib/slug.ts` (`slugify`) for the live slug preview.
  - Added `components/editor/use-project-dialogs.ts` — dedicated hook owning dialog type/active project, form `name`/derived `slug`, and `isLoading`, plus mock create/rename/delete mutators (in-memory only, no API calls).
  - Added `components/editor/project-dialogs-provider.tsx` — React context wrapping `EditorShell` children so the sidebar and the editor home page share one hook instance; renders the three dialogs.
  - Added `components/editor/dialogs/{create,rename,delete}-project-dialog.tsx`. Create shows a live slug preview under the name input; Rename prefills the name, auto-focuses, shows the current name in the description, and submits on Enter via a `<form>`; Delete is a destructive-only confirmation with no input and a `destructive`-variant confirm button.
  - `components/editor/project-sidebar.tsx` now lists real mock projects per tab — owned projects show hover-revealed Rename/Delete icon buttons, shared/collaborator projects show none. Added a mobile-only (`md:hidden`) backdrop scrim behind the sidebar that closes it on tap/click.
  - `components/editor/editor-shell.tsx` wraps its tree in `ProjectDialogsProvider`.
  - `npx tsc --noEmit`, `npx eslint`, and `npx next build` all pass with no errors.
  - Not visually verified in-browser: `/editor` is behind Clerk auth (`proxy.ts` middleware) and no signed-in session/credentials were available in this session — verified via type-check, lint, and production build only.

- Feature spec 03: Auth
  - `ClerkProvider` switched to `dark` theme (`@clerk/ui/themes`); appearance variables override all colors via CSS custom properties — no hardcoded values.
  - `/` root page is a server component: redirects authenticated users to `/editor`, unauthenticated to `/sign-in`.
  - Sign-in and sign-up pages redesigned with two-panel layout: left panel (logo, tagline, feature list) hidden on small screens; right panel centers the Clerk form. No gradients, no hero sections.
  - `EditorNavbar` simplified to `UserButton` only — removed `SignInButton`/`SignUpButton` and `Show` conditionals (editor is always protected).
  - All routes protected via `clerkMiddleware` in `proxy.ts`; `/sign-in` and `/sign-up` remain public.
  - TypeScript passes with no errors.

- Clerk Authentication
  - Installed Clerk CLI, linked to GhostAI app (`app_3EhS2dz9dgewfzyFSunyWf0MVMe`).
  - `@clerk/nextjs` installed; `ClerkProvider` wrapping `<body>` in `app/layout.tsx`.
  - `proxy.ts` middleware: all routes protected except `/sign-in` and `/sign-up`; `/__clerk/:path*` added to matcher.
  - Sign-in and sign-up pages scaffolded at `app/sign-in/[[...sign-in]]/page.tsx` and `app/sign-up/[[...sign-up]]/page.tsx`.
  - `@clerk/ui` installed with shadcn theme applied to `ClerkProvider` and imported in `globals.css`.
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` populated in `.env.local` via `clerk env pull`.
  - Auth controls (`SignInButton`, `SignUpButton`, `UserButton`, `Show`) added to `EditorNavbar` right section.

- Feature spec 02: Editor Shell
  - Created `components/editor/editor-navbar.tsx` — fixed-height top navbar, left sidebar toggle using `PanelLeftOpen`/`PanelLeftClose`, dark background with bottom border.
  - Created `components/editor/project-sidebar.tsx` — floating overlay sidebar (no push), slides in from left, Projects title + close button, shadcn Tabs (My Projects / Shared) with empty states, full-width New Project button.
  - Dialog pattern confirmed ready: existing `components/ui/dialog.tsx` already supports title, description, and footer actions via project color tokens.
  - TypeScript passes with no errors.

- Feature spec 01: Design System
  - Installed `shadcn/ui` (v4 base-nova preset, `@base-ui/react` primitives) and `lucide-react`.
  - Added `clsx`, `tailwind-merge`, `class-variance-authority` as dependencies.
  - Generated `lib/utils.ts` with `cn()` helper.
  - Generated `components/ui/` — Button, Card, Dialog, Input, Label, Tabs, Textarea, ScrollArea.
  - Updated `app/globals.css` with all dark-theme CSS custom properties (`--bg-base`, `--accent-primary`, etc.) and shadcn semantic tokens wired to dark values. Added `@theme inline` mappings for project utility names (`bg-base`, `text-copy-primary`, `border-surface-border`, `text-brand`, `bg-accent-dim`, etc.).
  - Added `dark` class to `<html>` in `app/layout.tsx` to activate `dark:` variant classes.
  - Updated `app/page.tsx` to use dark theme token classes.
  - TypeScript and `next build` both pass with no errors.

## In Progress

- Feature spec 14: Node Editing (Senior Developer pass done, awaiting QA)
  - `components/editor/canvas-node.tsx` (modified) — adds `@xyflow/react`'s `<NodeResizer>` (visible only when `selected`, min size from new `NODE_MIN_SIZE`, styled with `border-brand`/`bg-base` handles and a `border-surface-border` line — no raw hex) rendered as a sibling of `ShapeVisual`, after it in DOM order (so its `position: absolute` controls paint above the shape regardless of the CSS-shape-vs-SVG-shape branch's own `position`); adds double-click-to-edit (`useState` local `isEditing`) rendering a `<textarea>` in the same `children` slot `ShapeVisual` already centers, with `nodrag nopan` classes on the editable wrapper. Label changes dispatch on every keystroke through `useUpdateCanvasNode()`.
  - `hooks/use-update-canvas-node.ts` (new) — `CanvasNodeUpdateContext` + `useUpdateCanvasNode()`, the mechanism a leaf `CanvasNode` uses to dispatch a label update back through `CanvasFlow`'s real `onNodesChange` (a `"replace"` `NodeChange`) without embedding a non-serializable callback in Liveblocks-synced `data` or mutating React Flow's internal store directly. Returns `null` outside the provider.
  - `components/editor/canvas.tsx` (modified) — `CanvasFlow` now builds `updateNodeData` (looks up the current node by ID, merges the partial `data` update, dispatches `onNodesChange([{ id, type: "replace", item }])`) and provides it via `CanvasNodeUpdateContext.Provider` wrapping `<ReactFlow>`. No changes to drop/creation logic.
  - `lib/canvas-shapes.ts` (modified) — added `NODE_MIN_SIZE = { width: 40, height: 40 }`, a flat floor (not per-shape) well below every `SHAPE_DEFAULT_SIZES` entry. `createDroppedNode`/ID generation/drop-position math confirmed untouched via `git diff`.
  - `context/ui-context.md` (modified) — documented Node Resize (handle/line styling, `NODE_MIN_SIZE`) and Node Label Editing (textarea-overlay convention, live-per-keystroke sync mechanism) under Canvas.
  - Tests: `components/editor/canvas-node.test.tsx` gained resize-visibility and label-editing coverage (wrapped in `ReactFlowProvider` + `CanvasNodeUpdateContext.Provider`, now required since `<NodeResizer>`'s controls call `useStoreApi()` once visible); `hooks/use-update-canvas-node.test.tsx` (new); `lib/canvas-shapes.test.ts` gained an `NODE_MIN_SIZE` bounds check. 193/193 tests passing across 26 files (up from 180/25).
  - `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npx next build` all pass.
  - `components/editor/shape-visual.tsx` and `components/editor/shape-panel.tsx` confirmed byte-for-byte untouched via `git diff --stat` — satisfies the spec's Scope Limits (no shape-rendering or shape-panel changes).
  - Full pipeline trail in `context/spec-status/14-node-editing.md`.

## Next Up

- QA pass on feature spec 14 (Node Editing).

## Open Questions

- None yet.

## Deferred — Production Hardening (after spec 29)

Cross-cutting gaps found during the pre-pipeline review that don't block any individual spec 06–29, so they're logged here rather than wedged into an unrelated spec. Revisit as a dedicated pass once the feature specs are done:

- **Rate limiting** on `/api/ai/design` and `/api/ai/spec` — either endpoint can trigger a paid Gemini + Trigger.dev run; nothing currently stops a project collaborator from spamming them.
- **Vercel Blob access model** — confirm whether the blob store is public (default) or private. If public, the raw blob URL bypasses the app's own access checks once it leaks anywhere (client state, network tab, logs); the download-route wrapping specs 21/28 build is necessary but not sufficient if the underlying URL itself isn't also protected.
- **Migrations on deploy** — no spec currently wires `prisma migrate deploy` into the build/deploy step.
- **Error monitoring / observability** — nothing in the context docs specifies a monitoring tool (e.g. Sentry) for production.

## Architecture Decisions

- Using shadcn/ui v4 with `@base-ui/react` primitives (not Radix UI) — this is the default for the "base-nova" preset in shadcn v4.
- Tailwind v4 CSS-first configuration — no `tailwind.config.js`. All tokens in `globals.css` via `@theme inline`.
- Dark-only: `:root` and `.dark` both carry identical dark values. `<html>` always has `class="dark"`.
- Pre-spec-06 doc consistency pass (before starting the Analyst/Dev/QA/PO pipeline): resolved three contradictions across the remaining feature specs so no two specs assume different behavior for the same thing.
  - Presence field standardized on `thinking` (was `isThinking` in spec 10, `thinking` in specs 19/24) — spec 10 updated, decision recorded in `architecture-context.md` under "Realtime Conventions."
  - Prisma schema path in spec 21 corrected from `prisma/model/project.prisma` to `prisma/schema.prisma` — matches the actual single-file schema delivered in spec 05, not the multi-file `prisma/models/` split spec 05 originally described.
  - Token expiration: spec 22's design-run token route now sets 1-hour expiration, matching spec 27's spec-run token route (was previously only specified on 27).
  - New conventions documented in `architecture-context.md`: hooks go in a top-level `hooks/` folder going forward (spec 21's autosave hook updated from `/hook` accordingly; `components/editor/use-project-dialogs.ts` stays as a pre-convention exception), and the `ai-status-feed` / `ai-chat` Liveblocks mechanism is pinned down (`broadcastEvent` for status, Storage `LiveList` for chat) ahead of specs 22/24/25.

## Session Notes

- Next.js 16.2.6, React 19.2.4, Tailwind v4, shadcn v4.
- `components/ui/` files are generated — do not modify them.
- Theme tokens live in `globals.css`; components consume via Tailwind utility names.
