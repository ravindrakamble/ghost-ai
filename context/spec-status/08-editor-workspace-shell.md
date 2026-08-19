# Spec 08 — Editor Workspace Shell

## Analyst Brief

### Scope statement

Build the `/editor/[roomId]` route as a server component with a project access check (owner-or-collaborator; unauthenticated → `/sign-in`, no access or nonexistent project → `AccessDenied`), plus the static, non-functional workspace layout around it (project-name navbar, share/AI-toggle action buttons, active-room highlight in the existing `ProjectSidebar`, canvas placeholder, right-sidebar placeholder). No canvas, Liveblocks, AI chat, or sharing behavior — this spec is scaffolding and access control only.

### Concrete deliverables

- **`app/editor/[roomId]/page.tsx`** (new) — async server component. Resolves Clerk identity, resolves the project by `roomId` (== `Project.id`, per spec 07's Dev Notes — the app never introduced a separate Liveblocks room ID), and renders one of: redirect to `/sign-in` (no session), `<AccessDenied />` (no session-independent access — project missing OR caller is neither owner nor collaborator), or the workspace shell with the resolved project's `{ id, name }`.
- **`lib/project-access.ts`** (new) — access-check helper, kept separate from `lib/projects.ts`'s existing `getOwnedProjectOrError` (which is owner-only and serves *mutation* routes from spec 06 — not to be touched or reused here, since this spec needs owner-*or*-collaborator *view* access instead). Expected shape:
  - a function resolving current Clerk identity (`userId` + primary email), matching the `currentUser()` pattern already used in `lib/projects.ts#getProjectsForUser`.
  - a function that loads a project by ID and returns a discriminated result covering: not signed in, project not found, signed in but neither owner nor collaborator (match by `ownerId === userId` or `collaborators` containing the caller's email), or ok-with-project. Exact shape left to the Senior Developer, but should mirror the existing `ProjectLookupResult` pattern in `lib/projects.ts` for consistency.
- **`components/editor/access-denied.tsx`** (new) — presentational, no client interactivity required (server component): centered layout, lock icon (`lucide-react`), short message, `next/link` back to `/editor`.
- **Workspace layout components** (new, exact filenames left to the Senior Developer, e.g. `components/editor/workspace-shell.tsx` + small sub-parts) — client component(s) since the AI-sidebar-toggle needs local UI state. Renders:
  - a top bar showing the resolved project name, plus a share button and an AI-sidebar-toggle button (both visually present, functionally inert this spec — see Open Questions #1).
  - a canvas placeholder area (dark background, centered message) that fills remaining space.
  - a right-sidebar placeholder (slide-over, toggled by the AI-sidebar-toggle button) reserving space for the future AI chat.
- **`components/editor/project-sidebar.tsx`** (modify) — highlight the project matching the active room. Per spec 07's precedent (`hooks/use-project-actions.ts` already reads `useParams<{ roomId?: string }>()` successfully from a component rendered above the `[roomId]` segment), `ProjectSidebar` can call `useParams()` directly rather than needing the room ID prop-threaded from the page.
- **No changes anticipated** to `app/editor/layout.tsx`, `EditorShell`, `EditorNavbar`, `lib/projects.ts`'s existing exports, `app/api/projects/*`, or `prisma/schema.prisma` — see Open Questions #1 for why the new project-name/share/AI-toggle bar is scoped as an addition inside this route's own tree rather than a modification of the shared global navbar.

### Acceptance criteria

1. `/editor/[roomId]` is a server component (per spec text, not a client component with a `useEffect` fetch).
2. An unauthenticated request to `/editor/[roomId]` results in a redirect to `/sign-in`.
3. A signed-in request for a project ID that does not exist renders `AccessDenied`.
4. A signed-in request for a project the caller neither owns nor collaborates on renders `AccessDenied`.
5. A signed-in owner or collaborator request renders the workspace layout with the real project name.
6. `lib/project-access.ts` exists and both access-check responsibilities (identity resolution, owner-or-collaborator check) live there, outside the page component.
7. `AccessDenied` has a centered layout, a lock icon, a short message, and a link back to `/editor`.
8. The workspace layout has: a top bar with project name + share button + AI-sidebar-toggle button, the existing `ProjectSidebar` with the current project visibly highlighted, a canvas placeholder filling remaining space with dark background and centered message, and a right-sidebar placeholder for future AI chat.
9. No canvas logic (React Flow), Liveblocks calls, AI chat, or working share/collaborator behavior is introduced.
10. `npx tsc --noEmit` passes with no errors; `npm run build` / `npx next build` passes.

### Dependencies

- **Spec 06 (Project APIs)** — complete (QA-passed, Product-Owner-passed, per `progress-tracker.md`). Provides the `Project` / `ProjectCollaborator` Prisma models this spec's access check reads.
- **Spec 07 (Wire Editor Home)** — complete (QA-passed, Product-Owner-passed, awaiting only human sign-off per `progress-tracker.md`). Establishes that the create flow already navigates to `/editor/${project.id}` and that `useParams().roomId` is the intended mechanism for detecting the active workspace — this spec is what makes that route real. Also establishes `ProjectSidebar`'s current props/structure, which this spec extends rather than replaces.
- **Spec 03 (Auth)** — complete. Clerk `auth()`/`currentUser()` and `proxy.ts` route protection already in place; note `proxy.ts` already protects all non-public routes globally, so the page-level "redirect unauthenticated to `/sign-in`" requirement is effectively defense-in-depth on top of existing middleware, not the sole enforcement point. Implement it anyway since the spec calls it out explicitly (same posture as `lib/projects.ts#getProjectsForUser`'s existing "defensive fallback" comment).
- This spec is itself a stated dependency for **spec 09** (share dialog — needs the navbar's share button and a workspace to attach the dialog to) and **spec 10** (Liveblocks — its auth route spec text says "verify project access using the existing access helper," referring to `lib/project-access.ts` built here).

### Open questions

1. **Does "top navbar showing the project name" mean the existing global `EditorNavbar` (used by all `/editor/*` routes) grows a project-name/share/AI-toggle mode, or does this route render its own second-level bar inside the workspace layout?** The spec's `## Layout` section lists project-name/share/AI-toggle together with the canvas and right-sidebar placeholders as one cohesive "workspace layout," and `EditorNavbar` currently lives in the shared `app/editor/layout.tsx` (rendered for `/editor` home too, where there is no project context). Modifying the shared navbar to be workspace-aware would require either a client-side fetch of project data (duplicating the server-side access check this spec already does) or restructuring how `app/editor/layout.tsx` and `EditorNavbar` receive route-specific data — a bigger structural change than this spec's stated scope ("no canvas logic... yet," implying otherwise minimal footprint). **Recommendation:** keep `EditorNavbar` untouched; add the project-name/share/AI-toggle bar as part of this route's own workspace shell component, rendered inside `<main>` below the existing global navbar. This satisfies the spec's literal requirement (a top navbar showing project name and those two actions exists in the workspace layout) without touching already-signed-off shared chrome or spec 07's delivered code. Flagging for the Senior Developer to confirm or push back on, since the spec text alone doesn't rule out the alternative.
2. **Is the share button expected to be clickable-but-inert, or `disabled`, in this spec?** Spec 08 lists "share button" as a navbar action to build; spec 09's text ("Add a Share button... that opens the share dialog") could be read as spec 09 adding the button itself, not just wiring an existing one. Scope text for spec 08 explicitly excludes "sharing behavior," which argues for the button existing visually now with spec 09 adding the click handler. **Recommendation:** render the button in spec 08 with no `onClick` (or a no-op), not `disabled` — matches the "AI sidebar toggle" precedent (also listed as a navbar action here, and its own toggle-the-placeholder behavior is trivial local UI state that's clearly fine to wire up now, unlike sharing which requires real dialog/API work owned by spec 09).
3. **Should the AI-sidebar-toggle actually show/hide the right-sidebar placeholder, or just be present visually?** The spec lists both "AI sidebar toggle" as a navbar action and "right sidebar placeholder" as part of the layout, which only makes sense together as a working show/hide. This is UI-only local state, not AI chat behavior, so it does not conflict with "no ... AI chat ... yet." **Recommendation:** wire the toggle to control the placeholder's visibility now.

### Out-of-scope callouts

- **Liveblocks / real-time canvas** (spec 10, 11+) — the canvas area is a static placeholder only. No React Flow, no Liveblocks provider, no room connection.
- **AI chat** (spec 20, 25, 26) — the right sidebar is an empty placeholder reserving layout space only.
- **Share dialog and collaborator invite/remove** (spec 09) — the share button exists in the navbar but performs no action; no collaborator list/invite/remove UI or API routes.
- **Collaborator mutation permissions** — `lib/project-access.ts`'s owner-or-collaborator check is for *viewing* the workspace only. It must not be wired into or replace `lib/projects.ts#getOwnedProjectOrError` (spec 06's owner-only mutation gate for `PATCH`/`DELETE /api/projects/[id]`) — those remain separate concerns for separate operations.
- **Autosave / canvas snapshot persistence** (spec 21) — not implicated; no canvas state exists yet to save.
- Project-overview.md's Out of Scope wall (billing, enterprise permission tiers, versioned spec history, prod object storage migration, mobile apps) — not implicated by this spec's text.

## Handoff

Brief ready for Senior Developer at `context/spec-status/08-editor-workspace-shell.md`.

## Dev Notes

### Files added

- `app/editor/[roomId]/page.tsx` — the workspace route. Async server component: awaits `params`, calls `lib/project-access.ts#getProjectAccess`, then redirects to `/sign-in` (unauthenticated), renders `AccessDenied` (not-found or forbidden), or renders `WorkspaceShell` with the resolved `{ id, name }`.
- `lib/project-access.ts` — `getCallerIdentity()` (Clerk `userId` + primary email, mirrors `lib/projects.ts#getProjectsForUser`'s pattern) and `getProjectAccess(projectId)` (discriminated `{ ok: true; project } | { ok: false; reason: "unauthenticated" | "not-found" | "forbidden" }`, checking `ownerId === userId` or collaborator email match). Kept fully separate from `lib/projects.ts#getOwnedProjectOrError` per the brief — not touched, not reused, not replaced.
- `components/editor/access-denied.tsx` — server component: centered layout, `Lock` icon (`h-8 w-8`, matching `ui-context.md`'s "feature icon in empty state" sizing), short message, `next/link` back to `/editor`.
- `components/editor/workspace-shell.tsx` — client component (owns `isAiSidebarOpen` state); composes the navbar, canvas placeholder, and AI sidebar placeholder for `/editor/[roomId]`.
- `components/editor/workspace-navbar.tsx` — presentational: project name, inert Share button (no `onClick`, not `disabled` — per Open Question #2's recommendation), AI-sidebar-toggle button (wired to real local UI state, per Open Question #3).
- `components/editor/canvas-placeholder.tsx` — presentational: dark (`bg-base`) background, centered message, `flex-1` so it fills remaining space.
- `components/editor/ai-sidebar-placeholder.tsx` — presentational: slide-over (`translate-x-full` / `translate-x-0`), `aria-hidden` mirrors open state, absolutely positioned within the workspace area (not the full viewport) so it overlays the canvas rather than the global chrome.
- `lib/project-access.test.ts`, `app/editor/[roomId]/page.test.tsx`, `components/editor/access-denied.test.tsx`, `components/editor/workspace-shell.test.tsx`, `components/editor/project-sidebar.test.tsx` — new unit/component tests (see Test coverage below).
- `vitest.setup.ts` (new) — see "Testing infra decision" below.

### Files changed

- `components/editor/project-sidebar.tsx` — added `useParams<{ roomId?: string }>()` (per spec 07's established precedent — this component is rendered above the `[roomId]` segment but the hook still resolves it) and threads `isActive` into both the owned-project `ProjectItem` and the inline shared-project row, highlighting the project matching the active room with `bg-accent-dim`/`text-brand` tokens.
- `vitest.config.mts` — added `test.setupFiles: ["./vitest.setup.ts"]`.
- `context/code-standards.md` — documented the `vitest.setup.ts` decision in the existing Testing section.

### Key decisions

- **Open Question #1 (navbar placement):** followed the brief's recommendation — `EditorNavbar` and `app/editor/layout.tsx` are untouched; the project-name/share/AI-toggle bar is a second-level bar (`WorkspaceNavbar`) rendered inside this route's own `WorkspaceShell`, below the global navbar.
- **Open Question #2 (share button):** rendered with no `onClick` at all (not `disabled`) — clickable-but-inert, ready for spec 09 to attach a handler without needing to also remove a `disabled` attribute.
- **Open Question #3 (AI toggle):** wired to real local UI state that shows/hides the placeholder — this is UI-only, not AI chat behavior, so it's in scope per the brief's own reasoning.
- `roomId` is treated as the `Project.id` directly (per spec 07's Dev Notes — no separate Liveblocks room ID exists), consistent with how `hooks/use-project-actions.ts` already reads `useParams().roomId`.
- `getProjectAccess`'s `ProjectAccessResult` returns the narrow `{ id, name }` `Project` shape (same as `types/project.ts`), not the full Prisma record — the page only ever needs those two fields, and keeping the return type narrow avoids leaking `collaborators`/`ownerId` further than necessary.
- **Testing infra decision (not explicitly scoped by the brief, but blocking):** `code-standards.md` said jest-dom and RTL were "installed for this," but no prior spec had actually wired jest-dom's matchers or RTL's cleanup into the Vitest run (spec 06/07's one component test file only had a single `it` block, so the gap was latent). Both `toBeInTheDocument()`-style matchers and multi-`it` component test files surfaced it here. Fixed by adding `vitest.setup.ts` (imports `@testing-library/jest-dom/vitest`, calls RTL's `cleanup()` in a global `afterEach`) and wiring it via `test.setupFiles` in `vitest.config.mts`. Documented in `code-standards.md` so future specs don't rediscover this.

### Test coverage added

- `lib/project-access.test.ts` — `getCallerIdentity` (no session, signed in with/without primary email) and `getProjectAccess` (unauthenticated, not-found, forbidden as non-owner/non-collaborator, ok as owner, ok as collaborator-by-email, forbidden-without-querying-by-email when the caller has no primary email).
- `app/editor/[roomId]/page.test.tsx` — redirects to `/sign-in` when unauthenticated; renders `AccessDenied` for not-found and forbidden; renders `WorkspaceShell` with the resolved project for ok; confirms the awaited `roomId` is passed through to the access check.
- `components/editor/access-denied.test.tsx` — heading, message, and `href="/editor"` link.
- `components/editor/workspace-shell.test.tsx` — project name renders, AI sidebar starts closed (`aria-hidden="true"`) and toggles open/closed via the toggle button, Share button is present and has no click handler.
- `components/editor/project-sidebar.test.tsx` — owned-project highlight, shared-project highlight (via the Shared tab), and the no-active-room case (nothing highlighted).

Commands run, all passing: `npx vitest run` (61/61 across 11 files), `npx tsc --noEmit` (clean), `npx eslint .` (0 errors — 1 pre-existing warning in an unrelated `.agents/skills` template file), `npx next build` (succeeds; `/editor/[roomId]` listed as a dynamic (`ƒ`) route).

### Known limitations / deferrals

- Not visually verified in-browser (same posture as prior specs behind Clerk auth with no interactive session in this environment) — verified via type-check, lint, unit tests, and production build only.
- Share button and AI-sidebar-toggle styling/placement are first-pass; spec 09 may want to adjust the Share button once it grows a real click handler and dialog.

## QA Report

**Overall verdict: PASS**

### Mechanical gate

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS — no errors |
| `npx eslint .` | PASS — 0 errors; 1 pre-existing warning in an unrelated `.agents/skills` template file (`__root.tsx`), not touched by this spec |
| `npx next build` | PASS — Turbopack build succeeds; `/editor/[roomId]` listed as `ƒ` (dynamic) in the route table |
| `npx vitest run` | PASS — 61/61 tests across 11 files |

All four independently re-run, not taken on Dev's claim alone.

### Acceptance criteria

1. `/editor/[roomId]` is a server component — PASS. `app/editor/[roomId]/page.tsx` has no `"use client"`, is `async`, awaits `params`.
2. Unauthenticated → redirect to `/sign-in` — PASS. Verified in code (`getProjectAccess` returns `reason: "unauthenticated"` → `redirect("/sign-in")`) and in `page.test.tsx`.
3. Non-existent project → `AccessDenied` — PASS. `getProjectAccess` returns `not-found` when `prisma.project.findUnique` resolves `null`; page renders `<AccessDenied />`; covered by both `project-access.test.ts` and `page.test.tsx`.
4. Signed-in, neither owner nor collaborator → `AccessDenied` — PASS. `forbidden` branch checks `ownerId === userId` and collaborator email match; covered by tests for both the plain-forbidden and no-primary-email cases.
5. Owner/collaborator → workspace layout with real project name — PASS. `WorkspaceShell` receives the narrow `{ id, name }` project and renders the name in the navbar heading; covered by `workspace-shell.test.tsx` and `page.test.tsx`.
6. `lib/project-access.ts` exists, both responsibilities (`getCallerIdentity`, `getProjectAccess`) live there, outside the page — PASS.
7. `AccessDenied`: centered layout, lock icon, short message, link back to `/editor` — PASS. `Lock` from `lucide-react`, `next/link` with `href="/editor"`, centered flex column; covered by `access-denied.test.tsx`.
8. Workspace layout has top bar (project name + share + AI-toggle), highlighted `ProjectSidebar`, dark canvas placeholder filling remaining space, right-sidebar placeholder — PASS. `WorkspaceNavbar`, `CanvasPlaceholder` (`flex-1`, `bg-base`), `AiSidebarPlaceholder` (absolutely positioned slide-over within the workspace area) all present; `ProjectSidebar` now reads `useParams().roomId` and highlights the matching project in both the owned list (`ProjectItem`) and the inline shared-project row.
9. No canvas/Liveblocks/AI chat/working share behavior — PASS. Grepped all new/changed files for `liveblocks`/`reactflow`/`react-flow` — only doc-comment mentions, no imports or logic. Share button has no `onClick` handler (confirmed in `workspace-navbar.tsx` and asserted in `workspace-shell.test.tsx`).
10. `tsc`/`next build` pass — PASS (see mechanical gate above).

All 10 acceptance criteria pass.

### Architecture invariants

- No long-running AI work introduced (N/A to this spec) — confirmed no such code added.
- Metadata/blob separation not implicated — confirmed no blob-related code added.
- Auth/ownership enforcement: `getProjectAccess` is call before any workspace content renders; unauthenticated/not-found/forbidden are all short-circuited before reaching `WorkspaceShell`. `lib/projects.ts#getOwnedProjectOrError` (spec 06's mutation-only owner gate) is untouched — confirmed via `git diff lib/projects.ts`, which only shows spec 07's unrelated `getProjectsForUser` addition.
- Client components used only where interactivity/state is needed: `page.tsx` and `access-denied.tsx` are server components (no `"use client"`); only `workspace-shell.tsx` (owns toggle state) and pre-existing `project-sidebar.tsx` (already a client component, now also reading `useParams()`) are marked `"use client"`. `workspace-navbar.tsx`, `canvas-placeholder.tsx`, `ai-sidebar-placeholder.tsx` correctly have no directive — they're presentational leaves consumed by the client parent.
- No invariant violations found.

### Standards compliance

- No `any` in any new/changed file (grepped).
- No raw Tailwind color classes (`zinc-`/`slate-`/`gray-`) or hex literals in changed files — grepped `app/editor/[roomId]/page.tsx`, `lib/project-access.ts`, and all new `components/editor/*` files; only false-positive matches were `translate-x-*` utility strings, not colors. All colors used (`bg-base`, `bg-surface`, `bg-elevated`, `bg-subtle`, `text-copy-primary`, `text-copy-muted`, `text-brand`, `bg-accent-dim`, `border-surface-border`) are real tokens defined in `app/globals.css`.
- `components/ui/*` confirmed untouched (`git status`/`git diff` both clean for that directory).
- Border radius scale respected (`rounded-2xl` for the `AccessDenied` icon tile, `rounded-lg` for sidebar row/item — consistent with pre-existing `ProjectItem` usage elsewhere in the same file).
- Test file organization and mocking conventions (`vi.hoisted` + `vi.mock` for Clerk/Prisma, `// @vitest-environment jsdom` docblocks for component tests) followed per `code-standards.md`.

### Error handling

- Unauthenticated, not-found, and forbidden are all distinct branches, each independently tested. The no-primary-email edge case (`getCallerIdentity` returns `email: null`) is explicitly tested to confirm it correctly falls through to `forbidden` rather than throwing or matching by accident.
- Both `not-found` and `forbidden` render the same generic `AccessDenied` message rather than leaking which case applies — a reasonable, security-conscious choice not contradicted by the spec.

### Housekeeping

- `context/progress-tracker.md`'s "In Progress" entry for spec 08 accurately reflects what was built (files added/changed, test counts, command results) and matches the Dev Notes in this file. "Next Up" correctly points to QA then Product Owner review.

### Issues found

None. No bugs, no spec gaps.

QA passed — ready for Product Owner review.

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Against project-overview.md's Success Criteria

This spec is explicitly scaffolding (server-side access control + a static, non-interactive workspace layout), so it does not itself complete most Success Criteria — that's expected and by design at this point in the incremental build. What it does do:

- **Criterion 1 ("A signed-in user can create and open a project")** — this spec is the piece that makes the second half of that sentence true. Spec 07 already wired project creation and navigation to `/editor/${project.id}`, but until now that route (`/editor/[roomId]`) did not exist, so "open a project" had no real destination. Verified in code: `app/editor/[roomId]/page.tsx` resolves access via `lib/project-access.ts#getProjectAccess` and renders a real workspace with the project's actual name (`WorkspaceShell` → `WorkspaceNavbar` renders `project.name`, confirmed by reading the files directly). This is genuine, not cosmetic, progress on Criterion 1.
- **Criteria 2–6** (real-time collaboration, starter templates, AI generation, spec generation, storage-layer correctness) — correctly untouched by this spec. No canvas, no Liveblocks, no AI, no new persisted artifacts. Confirmed by direct inspection of `workspace-shell.tsx`, `workspace-navbar.tsx`, and `app/editor/[roomId]/page.tsx` — no premature wiring of any of these, matching QA's grep-based confirmation.
- The access-control layer (`lib/project-access.ts`) is a load-bearing dependency for specs 09 (share dialog) and 10 (Liveblocks room auth), both of which the Analyst Brief explicitly named as consumers. Getting the owner-or-collaborator view-gate right now, cleanly separated from spec 06's owner-only mutation gate (`getOwnedProjectOrError`), is exactly the kind of foundational work that prevents a later spec from having to retrofit access control. I verified this separation directly: `lib/project-access.ts` has no imports from or references to `lib/projects.ts`, and its own doc comment explicitly warns future specs not to conflate the two.

### Scope check against project-overview.md's Out of Scope list

No violations. Nothing in this spec touches billing, permission tiers beyond owner/collaborator, versioned spec history, blob storage migration, or mobile. Confirmed by reading all new/changed files directly — the workspace is a static shell, the share button has no `onClick`, and the AI sidebar toggle only controls local `useState` visibility of an empty placeholder `div`, not any chat functionality.

Also checked against this spec's own Out-of-scope callouts (Liveblocks, AI chat, share dialog behavior, autosave) — none were touched. This matches QA's independent grep for `liveblocks`/`reactflow`/`react-flow`.

### progress-tracker.md accuracy

The "In Progress" entry for spec 08 (lines 93–100) accurately lists what was actually built — files added/changed, the testing-infra fix, and command results — and matches both the Dev Notes and QA Report in this file. One item to correct before this spec is considered closed: the tracker's "Next Up" section (line 103) still reads "QA pass on spec 08, then Product Owner review," which is now stale since QA has passed and this Product Owner review is the current step. This is a minor staleness issue, consistent with the pipeline's own pattern (specs 06 and 07 were moved from "In Progress" to "Completed" with a full PASS trail only after all three reviews concluded) — not a defect requiring a round back to the Analyst, but the tracker should be updated to move spec 08 into "Completed" (with QA PASS and Product Owner PASS lines, mirroring specs 06/07's entries) and "Next Up" advanced to spec 09, once this review is filed.

### Rough edges assessed as acceptable at this stage

- Not visually verified in-browser (no interactive Clerk session available in this environment) — consistent with every prior spec behind auth; verified instead via type-check, lint, unit/component tests, and production build. Not a blocker.
- Share button is inert (no click handler) and AI-sidebar toggle is wired to real local state — both match the brief's Open Questions #2/#3 recommendations and don't block spec 09 or 10 from building on top cleanly.
- Both "not-found" and "forbidden" render an identical generic `AccessDenied` message rather than distinguishing the reason — a reasonable, security-conscious default (avoids confirming project existence to unauthorized callers) that doesn't conflict with the spec text.

No issues rise to the level of sending this back to the Analyst. This spec is ready for the human's final call on whether to proceed to spec 09.
