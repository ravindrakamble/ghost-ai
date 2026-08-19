# Spec 07 — Wire Editor Home

## Analyst Brief

### Scope statement

Replace the mock project data and mock mutations behind the editor home sidebar/dialogs with the real, already-shipped `app/api/projects` endpoints from spec 06: server-side fetch of owned + shared projects for initial render, and a new client hook that performs real create/rename/delete calls and drives navigation/refresh. No changes to the API routes' contracts, no collaborator invite/remove UI, no canvas/workspace page work.

### Concrete deliverables

- **`app/editor/layout.tsx`** — becomes an `async` server component. Fetches the signed-in user's owned + shared projects (new `lib/projects.ts` function, called directly — not via an internal HTTP round-trip to `/api/projects`) and passes both lists as props into `EditorShell`. See Open Questions #1 for why this lives in `layout.tsx` rather than `page.tsx`, despite the spec text saying "the editor home page is a server component."
- **`app/editor/page.tsx`** — stays a server component (drops its current `"use client"` directive). The "New Project" empty-state button can no longer call `useProjectDialogsContext()` directly from a server component, so that click handler moves into a small new client leaf component that `page.tsx` renders (exact name left to the Senior Developer, e.g. `components/editor/editor-home-empty-state.tsx`).
- **`hooks/use-project-actions.ts`** (new) — per `architecture-context.md`'s Hooks Convention ("New client-side hooks go in a top-level `hooks/` folder"). Owns:
  - dialog open/close state (`create` / `rename` / `delete` / `null`), active project, name input, derived slug preview, `isLoading`.
  - **Create**: generates a cosmetic room-ID-style preview (slugified name + short unique suffix) for the dialog UI, calls `POST /api/projects` with `{ name }`, and on success navigates to the new project's workspace route using the **server-returned project ID** (see Open Questions #2 — this is a recommendation, not settled spec text).
  - **Rename**: calls `PATCH /api/projects/[id]`, then refreshes (`router.refresh()`) so the server-fetched lists in `layout.tsx` re-run with the new name.
  - **Delete**: calls `DELETE /api/projects/[id]`; if the deleted project is the currently active workspace, redirects to `/editor`; otherwise refreshes. "Active workspace" should be determined via Next.js routing primitives (`useParams()`/`usePathname()`) against the future `/editor/[roomId]` segment from spec 08 — see Dependencies. Until spec 08 ships that route, this branch is effectively a no-op and delete always takes the refresh path, which is expected, not a bug.
- **`lib/projects.ts`** — extend with a new list-fetching function (e.g. `getProjectsForUser`) that resolves the caller's Clerk identity (`userId` **and** primary email — `ProjectCollaborator` is keyed by email, not user ID) and returns owned projects (by `ownerId`) and shared projects (via `ProjectCollaborator`) as two separate lists. See Open Questions #3 on why this is in scope now despite spec 09 owning collaborator invite/remove.
- **`lib/slug.ts`** — likely extended with a short unique suffix generator for the cosmetic create-dialog preview (exact API left to the Senior Developer).
- **`components/editor/project-dialogs-provider.tsx`** — rewired onto `hooks/use-project-actions.ts` instead of the current mock `useProjectDialogs`; accepts the server-fetched owned/shared lists as props (threaded from `layout.tsx` → `EditorShell` → provider) instead of sourcing `MOCK_PROJECTS` internally.
- **`components/editor/editor-shell.tsx`** — accepts and threads the fetched project lists as props into the provider.
- **`components/editor/project-sidebar.tsx`** — consumes the real owned/shared lists instead of filtering a flat `MOCK_PROJECTS`-backed array by `.role`.
- **`components/editor/dialogs/{create,rename,delete}-project-dialog.tsx`** — minimal changes; continue reading from context, now backed by real loading/error state from the new hook instead of mock state.
- **`types/project.ts`** — `Project.slug` is not a real column on the Prisma `Project` model (see spec 06's shipped schema: `id`, `ownerId`, `name`, `description`, `status`, `canvasJsonPath`, timestamps — no `slug`). Adjust the type so `slug` is understood as a display-only value derived from `name` via `lib/slug.ts` at render time, not a field sourced from the API response.
- **Cleanup**: `components/editor/use-project-dialogs.ts` (mock hook) and `lib/mock-projects.ts` become dead code once the rewiring above is complete and should be removed rather than left as unused duplicates — see Open Questions #4, this is an inference from `code-standards.md`, not literal spec text.
- **No changes anticipated** to `app/api/projects/route.ts`, `app/api/projects/[projectId]/route.ts`, or `prisma/schema.prisma` — this spec consumes the existing, QA-passed and Product-Owner-passed spec 06 contract as-is.

### Acceptance criteria

1. `/editor` fetches owned and shared projects server-side (no client-side fetch for the initial render) and the sidebar renders that real data — `MOCK_PROJECTS` is no longer used.
2. Only owned projects show Rename/Delete controls in the sidebar (existing behavior, preserved with real data); shared/collaborator projects remain read-only, matching spec 06's owner-only mutation enforcement.
3. Submitting the create dialog calls `POST /api/projects` with the entered name; on success the app navigates to the new project's workspace route using the ID returned by the API (not a client-computed ID).
4. The create dialog continues to show a room-ID-style live preview (slug + short unique suffix) as informational UI, per spec text, even though it is not the value actually sent as the project's ID (see Open Questions #2).
5. Submitting the rename dialog calls `PATCH /api/projects/[id]` for the target project; on success the sidebar reflects the new name without a full page reload (`router.refresh()` or equivalent).
6. Submitting the delete dialog calls `DELETE /api/projects/[id]`; on success, if the deleted project was the active workspace, the app redirects to `/editor`; otherwise the sidebar refreshes in place.
7. `/editor` remains behind Clerk route protection (untouched by this spec — `proxy.ts` is not a deliverable here).
8. `npm run build` passes with no TypeScript errors.

### Dependencies

- **Spec 06 (Project APIs)** — QA-passed and Product-Owner-passed per `progress-tracker.md` (round 1, awaiting only human review). All four routes (`GET`/`POST` on `/api/projects`, `PATCH`/`DELETE` on `/api/projects/[projectId]`) are available and used as-is; this spec must not change their request/response contracts.
- **Spec 04 (Project Dialogs)** — complete. Provides the dialog components, sidebar shell, and the mock `useProjectDialogs` hook this spec supersedes.
- **Spec 03 (Auth)** — complete. Clerk `auth()`/`currentUser()` available server-side for identity resolution.
- **Hooks Convention (`architecture-context.md`)** — established; governs the new hook's location (`hooks/use-project-actions.ts`).
- **Not a dependency, but relevant context**: spec 08 (`/editor/[roomId]` workspace shell + `lib/project-access.ts`) and spec 09 (collaborator invite/remove routes) are **not yet built**. Spec 07 must not wait on either — but the delete flow's "active workspace" check should use routing primitives that will naturally line up with spec 08's `[roomId]` segment once it exists, and this spec must not attempt to build spec 09's invite/remove functionality itself (see Out-of-scope callouts).

### Open questions

1. **Where does the server-side fetch actually live: `page.tsx` or `layout.tsx`?** Spec text says "the editor home page is a server component" and "pass both lists to the sidebar," but `ProjectSidebar` is rendered by `EditorShell` inside `app/editor/layout.tsx`, not by `app/editor/page.tsx` — a page component cannot pass props "up" into its own layout. **Recommendation:** do the fetch in `app/editor/layout.tsx` (also trivially a server component, and the actual server-rendered ancestor of the sidebar) and thread the lists down as props through `EditorShell`. This satisfies the spec's real requirements (server-side fetch, no client fetch for initial load, sidebar shows real data) even though it's technically the layout rather than the page doing the fetching.

2. **Does "slugify the name to create the room ID" mean the client computes the real project/room ID, or just a UI preview?** Spec 07 says "slugify the name to create the room ID," "generate a short unique suffix," and "the project ID and Liveblocks room ID should stay aligned." Read literally, this could mean `POST /api/projects` should accept a client-supplied ID. But spec 06's shipped, QA-passed, Product-Owner-passed contract explicitly server-generates `cuid()` IDs and its acceptance criteria state "no sequential/auto-increment ID is introduced" — changing that now would silently alter an already-signed-off API contract as a side effect of a UI-wiring spec, which `ai-workflow-rules.md` scoping rules argue against ("do not combine unrelated system boundaries in a single step"). Liveblocks itself also isn't set up until spec 10, so there is no real "room" to align with yet. **Recommendation:** keep `POST /api/projects` unchanged; treat "slugify + short suffix" as generating a cosmetic preview string only (matching the live-preview UX spec 04 already built); after creation, navigate using the real, server-returned `project.id`. Because that same `id` will later be reused as the Liveblocks room ID in spec 10, "project ID and room ID stay aligned" is still satisfied — they are the same value, just not client-computed. Flagging this clearly for the Senior Developer to confirm or push back on, since it's a genuine reading of ambiguous spec text against an already-locked prior contract, not a plainly stated instruction.

3. **Should "shared projects" actually be queried now, given spec 09 owns collaborator invite/remove?** Spec 07's own text requires fetching "owned and shared projects." `ProjectCollaborator` (keyed by email) exists in the schema per spec 06, but no route currently writes to it — that's spec 09. Listing "projects I've been added to" (spec 07's need) is a different query direction from "listing collaborators of a project" (spec 09's need, for the share dialog), even though both read the same table. **Recommendation:** implement the shared-projects read query now in `lib/projects.ts`, since it's explicitly requested by spec 07's text, is a simple additive read, and does not touch spec 09's invite/remove write paths. In practice it will return an empty list until spec 09 ships (nothing can populate `ProjectCollaborator` yet) — that's expected, not a defect.

4. **Should `components/editor/use-project-dialogs.ts` be deleted, or left in place unused?** `architecture-context.md`'s Hooks Convention says this file "stays where it is rather than being moved as a side effect of an unrelated spec" — but that note is about not *relocating* the file into `hooks/` for tidiness, written before spec 07 existed to actually supersede its logic. **Recommendation:** once `hooks/use-project-actions.ts` and the rewired provider fully replace its responsibilities, delete `use-project-dialogs.ts` (and the now-unused `lib/mock-projects.ts`) rather than leave dead mock code behind, per `code-standards.md`'s "keep modules small and single-purpose." Flagging in case the Senior Developer or QA reads the architecture note as requiring the file to remain untouched indefinitely.

### Out-of-scope callouts

- **Collaborator invite/remove logic and the share dialog** — explicitly owned by spec 09. This spec only *reads* `ProjectCollaborator` (to list a user's shared projects); it adds no route or UI for inviting, listing collaborators-of-a-project, or removing collaborators.
- **`/editor/[roomId]` workspace shell, `AccessDenied`, `lib/project-access.ts`** — explicitly owned by spec 08. This spec's create/delete flows reference a future workspace route only insofar as they need a navigation target and an "is this the active workspace" check; they do not build that route or its access checks.
- **Liveblocks room creation/tokens** — spec 10 and later. Nothing in this spec creates or issues a Liveblocks room; "room ID" language in the spec text is resolved (per Open Questions #2) as reusing the existing project ID, not standing up real Liveblocks infrastructure.
- **Changing `app/api/projects` request/response contracts** — spec 06 is already QA-passed and Product-Owner-passed; this spec consumes it as-is (see Open Questions #2 for the one place this could be argued otherwise, and why this brief recommends against it).
- **Billing, enterprise permission tiers, versioned spec history, prod object storage migration, mobile apps** — per `project-overview.md`'s Out of Scope wall; not implicated by this spec's text anyway, noted per the hard rule.

## Handoff

Brief ready for Senior Developer at `context/spec-status/07-wire-editor-home.md`.

## Dev Notes

### Files added

- `hooks/use-project-actions.ts` — new hook per the Hooks Convention. Owns dialog state (`create`/`rename`/`delete`/`null`), active project, name input, derived `slug`/`roomIdPreview`, `isLoading`, `error`. Create/rename/delete each call the real spec 06 routes (`fetch`, no new API client abstraction) and drive `next/navigation`'s `useRouter().push/refresh`. Delete's "active workspace" check uses `useParams<{ roomId?: string }>().roomId === deletedProjectId` — a no-op until spec 08 adds `/editor/[roomId]`, as anticipated in Open Questions #1/#5.
- `hooks/use-project-actions.test.ts` — covers all three mutations' success and failure paths, the empty-name/empty-fetch guard on create, and both branches of the delete "active workspace" check, plus the cosmetic room-ID preview format.
- `components/editor/editor-home-empty-state.tsx` — new client leaf so `app/editor/page.tsx` can stay a server component while still wiring the "New Project" button to `openCreateDialog`.
- `components/editor/editor-home-empty-state.test.tsx` — confirms the click handler calls `openCreateDialog` (context mocked).
- `lib/slug.test.ts` — new coverage for `slugify` (previously untested) and the new `generateShortSuffix`.

### Files changed

- `app/editor/layout.tsx` — now an `async` server component; calls `getProjectsForUser()` directly (no internal HTTP round-trip) and threads `ownedProjects`/`sharedProjects` into `EditorShell`. This is where the server-side fetch actually lives, per Open Questions #1 — `ProjectSidebar` is rendered by the layout's tree, not by `page.tsx`.
- `app/editor/page.tsx` — dropped `"use client"`; renders `EditorHomeEmptyState` instead of calling `useProjectDialogsContext()` directly.
- `lib/projects.ts` — added `getProjectsForUser()` (resolves Clerk `currentUser()`, queries owned projects by `ownerId` and shared projects via `ProjectCollaborator.email` matching the primary email, both narrowed with `select: { id, name }` to match the UI's `Project` type directly — no separate mapping step). Renamed the Prisma-generated `Project` type import to `ProjectRecord` locally to avoid a name collision with `@/types/project`'s `Project`; `getOwnedProjectOrError`'s existing behavior/signature is unchanged.
- `lib/projects.test.ts` — added `getProjectsForUser` coverage: no-session → empty lists (no query), owned-by-id + shared-by-email query shapes, and the no-primary-email → empty shared list (no second query) branch.
- `lib/slug.ts` — added `generateShortSuffix()` (`crypto.randomUUID()`, hyphens stripped, sliced) for the create dialog's cosmetic room-ID preview.
- `types/project.ts` — `Project` is now `{ id: string; name: string }`. Dropped `slug` (never a real column — see spec 06's schema) and `role` (no longer needed now that owned/shared arrive as two separate server-fetched lists rather than one flat array filtered by `.role`).
- `components/editor/project-dialogs-provider.tsx` — now wraps `hooks/use-project-actions.ts` instead of the deleted mock hook; accepts `ownedProjects`/`sharedProjects` as props (threaded from the layout) and merges them into the context value alongside the hook's return.
- `components/editor/editor-shell.tsx` — accepts and threads `ownedProjects`/`sharedProjects` props into the provider.
- `components/editor/project-sidebar.tsx` — reads `ownedProjects`/`sharedProjects` straight from context instead of filtering a flat list by `.role`.
- `components/editor/dialogs/{create,rename,delete}-project-dialog.tsx` — read `roomIdPreview` (create) instead of `slug`; all three now render `error` from the hook when a mutation fails; submit handlers wrapped in `void` since the hook's submit functions are now async.

### Files removed

- `components/editor/use-project-dialogs.ts` and `lib/mock-projects.ts` — fully superseded by the hook above and the real API; left in place they'd be unused dead code per `code-standards.md`. Per Open Questions #4's recommendation.

### Key decisions

- **Open Questions #1 (page vs. layout)**: followed the brief's recommendation — fetch lives in `app/editor/layout.tsx`, not `app/editor/page.tsx`, since `ProjectSidebar` is rendered by the layout's tree.
- **Open Questions #2 (room ID vs. real ID)**: followed the brief's recommendation — `POST /api/projects` contract is unchanged (server-generated `cuid()`). The create dialog's `roomIdPreview` (`slug-suffix`) is cosmetic only; navigation after create uses the server-returned `project.id`.
- **Open Questions #3 (query shared projects now)**: implemented `getProjectsForUser`'s shared-projects query now, as the brief recommended. It will return `[]` until spec 09 ships collaborator invite — verified this is the expected/only possible outcome right now (no write path exists yet), not a defect.
- **Open Questions #4 (delete dead mock code)**: deleted `components/editor/use-project-dialogs.ts` and `lib/mock-projects.ts` rather than leaving them unused, per the brief's recommendation.
- Added an `error: string | null` field to the hook (not explicitly named in the spec text, but implied by "real loading/error state from the new hook instead of mock state" in the brief's dialog bullet) and rendered it in all three dialogs — small, in-scope addition, not new scope.
- `getProjectsForUser` uses Prisma `select` to shape the query result to exactly `{ id, name }`, matching `types/project.ts`'s `Project` directly with no separate mapping/transform step.

### Test coverage added

- `lib/projects.test.ts` (extended) — `getProjectsForUser`: no-user → empty lists, owned+shared query shapes, no-primary-email → shared stays empty without a second query.
- `lib/slug.test.ts` (new) — `slugify` behavior (hyphenation, collapsing, trimming, empty input) and `generateShortSuffix` (default length/charset, custom length, distinct values across calls).
- `hooks/use-project-actions.test.ts` (new) — create (empty-name no-op, success + navigation, failure + error state), rename (success + refresh, failure + error state), delete (refresh vs. redirect-to-`/editor` branches, failure + error state), and the room-ID preview format.
- `components/editor/editor-home-empty-state.test.tsx` (new) — click calls `openCreateDialog` from context.
- Commands run, all pass: `npx tsc --noEmit` (clean), `npx eslint` (0 errors — 1 pre-existing warning in `.agents/skills/...` unrelated to this spec), `npx vitest run` (40/40 across 6 files), `npx next build` (succeeds; `/editor` reports as `ƒ` dynamic, expected since it does a per-user server fetch on every request).

### Known limitations / deferrals

- The "active workspace" delete check is inert until spec 08 adds `/editor/[roomId]` — matches the brief's explicit expectation, not a gap.
- Shared-projects list will be empty in practice until spec 09 ships collaborator invite/remove (nothing currently writes to `ProjectCollaborator`) — matches the brief's explicit expectation.
- Not manually verified in a signed-in browser session (no live Clerk session available in this environment) — verified via `tsc`, `eslint`, `vitest`, and `next build` only, consistent with how spec 04 was previously verified.

## QA Report

**Overall verdict: PASS**

### Mechanical gate

- `npx tsc --noEmit` — pass, no errors.
- `npx eslint .` — pass, 0 errors (1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/...`, unrelated to this spec, confirmed by file location).
- `npx next build` — pass. `/editor` reports as `ƒ` (dynamic), consistent with a per-request server-side fetch.
- `npx vitest run` — pass, 40/40 tests across 6 files (`lib/projects.test.ts`, `lib/slug.test.ts`, `hooks/use-project-actions.test.ts`, `components/editor/editor-home-empty-state.test.tsx`, plus the two pre-existing spec 06 route test files).

### Acceptance criteria

1. **PASS** — `app/editor/layout.tsx` is an async server component calling `getProjectsForUser()` directly (no internal HTTP round-trip); `ProjectSidebar` renders `ownedProjects`/`sharedProjects` from context. Confirmed `MOCK_PROJECTS`/`lib/mock-projects.ts`/`components/editor/use-project-dialogs.ts` are deleted and no longer referenced anywhere in the codebase (`git status`, grep both clean).
2. **PASS** — `project-sidebar.tsx`'s `ProjectItem` (owned tab) renders Rename/Delete icon buttons; the shared tab renders a plain, button-less `<div>`. Backed by the existing owner-only 403 enforcement in `PATCH`/`DELETE /api/projects/[projectId]` (unchanged from spec 06).
3. **PASS** — `submitCreate` in `hooks/use-project-actions.ts` posts `{ name: trimmedName }` to `/api/projects`, then navigates via `router.push(\`/editor/${body.project.id}\`)` using the server-returned `id`, not a client-computed value. Route target matches spec 08's stated `/editor/[roomId]` segment.
4. **PASS** — `roomIdPreview` (`slug-suffix`, via `lib/slug.ts`'s `slugify` + new `generateShortSuffix`) is rendered in `create-project-dialog.tsx` as `/editor/${roomIdPreview}`, purely informational; not sent in the `POST` body.
5. **PASS** — `submitRename` calls `PATCH /api/projects/${activeProject.id}`, then `router.refresh()` on success (no full reload) so the server-fetched `layout.tsx` list re-runs.
6. **PASS** — `submitDelete` calls `DELETE /api/projects/${deletedProjectId}`; branches on `useParams<{roomId?: string}>().roomId === deletedProjectId` — redirects to `/editor` when true, else `router.refresh()`. Correctly inert until spec 08 adds `/editor/[roomId]`, as the brief anticipated; both branches are unit-tested.
7. **PASS** — `proxy.ts` untouched (verified via `git status --porcelain`); `/editor` remains behind `clerkMiddleware`/`auth.protect()`.
8. **PASS** — `npm run build` / `npx next build` passes with no TypeScript errors.

### Architecture invariants

- No long-running AI work introduced; this spec is pure CRUD wiring. No violation.
- Metadata/blob separation not implicated by this spec's scope — no violation.
- Auth/ownership enforced at every mutation boundary: unchanged spec-06 routes still gate `PATCH`/`DELETE` with `getOwnedProjectOrError` (401/404/403); `getProjectsForUser` defensively returns empty lists when `currentUser()` is null (defense-in-depth behind Clerk middleware, not a substitute for it). No violation.
- Client components used only where interactivity is needed: `app/editor/page.tsx` and `app/editor/layout.tsx` correctly dropped `"use client"`/became server components; the "New Project" click handler was correctly isolated into a small client leaf (`components/editor/editor-home-empty-state.tsx`) rather than forcing the whole page client-side. No violation.
- Canvas schema consistency — not implicated by this spec. No violation.

### Standards compliance

- No `any` found in changed files (`tsc --noEmit` strict mode also confirms this).
- No raw Tailwind color classes or hex values in changed files. One grep hit (`slate-` in `project-sidebar.tsx` line 30) is a false positive — substring of `translate-x-full`/`translate-x-0`, not a color token.
- `components/ui/*` confirmed untouched via `git status --porcelain components/ui` (empty output).
- `types/project.ts` correctly trimmed to `{ id, name }`; `slug` documented as derived-at-render-time, not a persisted column, matching spec 06's shipped schema (verified against `prisma/schema.prisma`'s `Project` model — no `slug` column, `ProjectCollaborator` keyed by `email`).
- `getProjectsForUser`'s Prisma query (`collaborators: { some: { email } }`) matches the actual `ProjectCollaborator` relation/field names in `prisma/schema.prisma`.
- `app/api/projects/route.ts`, `app/api/projects/[projectId]/route.ts`, and `prisma/schema.prisma` confirmed unmodified by this spec's changes (only touched by the prior spec 05/06 commit, per `git log`).

### Error handling

- Create/rename/delete all wrap `fetch` in try/catch, surface a network-failure message, and separately surface the server's `{ error }` body on non-2xx responses (`!response.ok`) — dialogs render this via the `error` state, all three dialog components covered.
- `parseProjectResponse` tolerates a non-JSON/empty error body without throwing.
- Create is guarded against empty/whitespace-only names and double-submit (`isLoading`) client-side, in addition to the server's own validation.
- `getProjectsForUser` handles the no-session case (empty lists, no query) and the no-primary-email case (owned query runs, shared query is skipped rather than firing with an undefined email) — both unit-tested.

### Housekeeping

- `context/progress-tracker.md` updated under "In Progress" with an accurate, specific summary of what was built for spec 07, and "Next Up" correctly points to QA then Product Owner.

### Issues found

None. No bugs, no spec gaps.

QA passed — ready for Product Owner review.

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Method

Read `context/project-overview.md` in full (Goals, Scope, Success Criteria), this spec's Analyst Brief / Dev Notes / QA Report, the original spec text in `context/feature-specs/07-wire-editor-home.md`, and `context/progress-tracker.md`. Independently re-read the delivered code (not just trusting Dev/QA prose): `app/editor/layout.tsx`, `app/editor/page.tsx`, `hooks/use-project-actions.ts`, `lib/projects.ts`, `types/project.ts`, `components/editor/project-sidebar.tsx`, `components/editor/project-dialogs-provider.tsx`, `components/editor/editor-shell.tsx`, `components/editor/dialogs/create-project-dialog.tsx`, and `app/api/projects/route.ts`. Confirmed (via Glob/Grep) that `components/editor/use-project-dialogs.ts` and `lib/mock-projects.ts` no longer exist and have zero remaining references anywhere in the repo. Trusted QA's PASS on `tsc`/`eslint`/`vitest`/`next build` without re-running them — this review is about product fit and scope, not mechanics.

### Against project-overview.md's Success Criteria

1. **"A signed-in user can create and open a project"** — this spec delivers the "create" half fully: the sidebar and dialogs are wired to the real `POST /api/projects` (spec 06), and success navigates using the server-returned `project.id`, not a client-computed value. The "open" half is not yet reachable — `/editor/[roomId]` doesn't exist until spec 08, so today's create flow navigates to a route that 404s. This is explicitly flagged by the Analyst (Open Questions/Dependencies), reiterated in Dev Notes' Known Limitations, and correctly scoped out — spec 07's own brief and out-of-scope callouts never claimed to build the workspace shell. Per `ai-workflow-rules.md`'s incremental philosophy ("split work... build small, verifiable increments"), this is the right shape of partial progress, not a shortfall: the create/rename/delete plumbing spec 08 will need is now real and tested, rather than deferred wholesale.
2. **"Multiple users can collaborate in the same canvas simultaneously"** — not implicated by this spec (Liveblocks is spec 10+). No regression.
3. **"A user can import a prebuilt starter design"** — not implicated. No regression.
4. **"AI can generate an architecture... from a prompt"** — not implicated. No regression.
5. **"The graph can be converted into a persisted Markdown spec"** — not implicated. No regression.
6. **"Project metadata and generated artifacts are stored in the correct layers"** — this spec doesn't add new storage, but it does correctly stop conflating a display-only computed value (`slug`) with a persisted field: `types/project.ts` now documents `slug` as derived at render time via `lib/slug.ts`, matching spec 06's actual Prisma schema (no `slug` column). That's a small but real correctness improvement to how the metadata layer is represented in the type system.

### Scope check (Out of Scope wall + spec boundaries)

- No changes to `app/api/projects/route.ts`, `app/api/projects/[projectId]/route.ts`, or `prisma/schema.prisma` — confirmed by direct read; matches spec 06's contract being treated as frozen.
- No collaborator invite/remove UI — confirmed by reading `project-sidebar.tsx`: the "Shared" tab renders a plain, button-less `<div>` per project, no invite affordance anywhere. Correctly deferred to spec 09.
- No Liveblocks/room infrastructure introduced — the "room ID" language in the original spec text is resolved (per Open Questions #2) as a cosmetic slug preview only; `POST /api/projects` is unchanged and still server-generates `cuid()` IDs. This is the correct call: literally implementing client-supplied IDs would have silently reopened an already Product-Owner-passed spec 06 contract as a side effect of a UI-wiring spec — exactly the kind of boundary-crossing `ai-workflow-rules.md` warns against.
- Nothing in `project-overview.md`'s Out of Scope wall (billing, enterprise permission tiers, versioned spec history, prod object storage, mobile) is implicated.
- Mock cleanup (`use-project-dialogs.ts`, `lib/mock-projects.ts`) was deleted rather than left as dead code, consistent with `code-standards.md`; verified no dangling references remain.

### progress-tracker.md accuracy

Found stale before this review: the "Current Goal" line and the "In Progress" section still said spec 07 was "awaiting QA," even though QA has since passed — inconsistent with how spec 06's entry was recorded (moved to "Completed" with explicit "QA: PASS" / "Product Owner: PASS" lines). Corrected as part of this review:

- Moved the spec 07 entry from "In Progress" into "Completed," at the top, in the same format as spec 06's entry (summary of what was built + QA verdict + Product Owner verdict + pointer to the full trail in this file).
- Updated "Current Goal" to reflect QA-passed / Product-Owner-passed, awaiting human review.
- Updated "Next Up" to point at human review of spec 07 then the spec 08 Analyst pass, replacing the stale "QA pass on spec 07, then Product Owner review" line.
- Left one minor, non-misleading historical footnote as-is: the "Architecture Decisions" log still notes `components/editor/use-project-dialogs.ts` as a "pre-convention exception" from before spec 07 existed. That entry is a dated record of a past decision (accurate as of when it was made) rather than a claim about current state, so it wasn't changed — flagging it here for visibility rather than treating it as an accuracy defect.

No other content in Dev Notes / QA Report required correction — spot-checking the code against both confirmed they describe what was actually delivered, not an aspirational description.

### Rough edges assessed as acceptable at this stage

- Create navigates to a currently-nonexistent `/editor/[roomId]` route (404 until spec 08). Explicitly anticipated, documented, and does not block spec 08 — if anything it hands spec 08 a pre-tested navigation target.
- Delete's "active workspace" branch is presently inert (`useParams().roomId` is always undefined pre-spec-08). Both branches are unit-tested now, so spec 08 only needs to add the route, not revisit this logic.
- Shared-projects list is always empty in practice (no write path to `ProjectCollaborator` exists until spec 09). The read query is correctly additive and doesn't touch spec 09's write paths.
- Not manually verified in a signed-in browser session (no live Clerk session available in this environment) — consistent with how spec 04 was previously handled, and covered instead by unit tests plus `next build`'s dynamic-route confirmation for `/editor`.

None of these block spec 08 or 09 from building on this spec correctly; each is a documented, intentional seam at a known future integration point, not an unaddressed gap.

### Recommendation

PASS — ready for the human's final call on whether to proceed to spec 08. This is a recommendation only; it does not constitute deployment authorization and carries no visibility into business, legal, security, or infrastructure considerations outside this repo.
