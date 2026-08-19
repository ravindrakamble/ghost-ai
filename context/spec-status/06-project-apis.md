# Spec 06 — Project APIs

## Analyst Brief

### Scope statement

Deliver four authenticated REST route handlers under `app/api/projects` — list, create, rename, delete — backed by Prisma/PostgreSQL, using the Clerk user ID as project `ownerId` and enforcing owner-only mutation. No UI wiring, no collaborator invite/remove logic, no canvas or blob storage work.

### Concrete deliverables

- **`prisma/schema.prisma`** — add the `Project` model (and `ProjectCollaborator`, needed for the list route's "shared" side — see Dependencies below for why this is a deliverable of this spec, not a given). Field/index shape must match spec 05's original plan (still the only documented spec for these models):
  - `Project`: `id` (`@id @default(cuid())`, matching the existing `Author`/`Post` ID strategy per this spec's own instruction), `ownerId` (Clerk user ID, string), `name`, optional `description`, `status` enum (`DRAFT`, `ARCHIVED`), `canvasJsonPath` (nullable, for future blob storage per spec 21), `createdAt`/`updatedAt` timestamps, indexes on `ownerId` and `createdAt`.
  - `ProjectCollaborator`: relation to `Project` with cascade delete, `email`, `createdAt`, unique constraint on `(projectId, email)`, indexes on `email` and `(projectId, createdAt)`.
  - A new migration (`prisma migrate dev`) and regenerated client.
- **`app/api/projects/route.ts`** — `GET` (list) and `POST` (create) handlers.
- **`app/api/projects/[projectId]/route.ts`** — `PATCH` (rename) and `DELETE` handlers.
- **`lib/`** — a shared auth/ownership helper (e.g. `lib/projects.ts` or similar) so route handlers stay thin per `code-standards.md`'s "keep route handlers focused on a single responsibility." Exact filename left to the Senior Developer.
- No changes to `components/`, `trigger/`, or any UI — this is enforced by the spec text ("Keep this backend-only. Do not wire the UI yet.") and by `architecture-context.md`'s system boundaries.

### Acceptance criteria

1. `GET /api/projects` returns the authenticated user's projects; unauthenticated requests return `401`.
2. `POST /api/projects` creates a project owned by the authenticated Clerk user ID; unauthenticated requests return `401`.
3. A `POST /api/projects` request with a missing/empty name creates a project named `Untitled Project`.
4. Created project IDs use the schema's default ID strategy (`cuid()`); no sequential/auto-increment ID is introduced.
5. `PATCH /api/projects/[projectId]` renames a project when the caller is the owner; returns `403` when the caller is authenticated but not the owner; returns `401` when unauthenticated.
6. `DELETE /api/projects/[projectId]` deletes a project when the caller is the owner; returns `403` when the caller is authenticated but not the owner; returns `401` when unauthenticated.
7. Mutating a non-existent `projectId` returns a `404` (not a `403` or `500`) — not stated explicitly in the spec but required for "consistent, predictable response shapes" per `code-standards.md`; flagged again under Open Questions since it's an inference, not spec text.
8. Response shapes are consistent across all four routes (e.g. a stable JSON envelope for success and error cases).
9. `npm run build` passes.

### Dependencies

- **Spec 05 (Prisma Postgres) — marked complete in `progress-tracker.md`, but its deliverable is incomplete relative to what spec 06 needs.** Spec 05's own text (`context/feature-specs/05-prisma.md`) called for a `Project` model and a `ProjectCollaborator` model. What actually shipped, per `progress-tracker.md`'s "Completed" entry for spec 05 and confirmed by reading `prisma/schema.prisma` directly, is only the starter `Author`/`Post` models — `Project` and `ProjectCollaborator` do not exist in the schema. Spec 06's own opening line, "The database schema is ready," is therefore false as written. See Open Questions — this brief resolves it by folding the missing schema work into this spec's deliverables (above) rather than blocking, since spec 06 cannot be built at all otherwise and the schema shape is already fully specified by spec 05's text.
- **Clerk auth (spec 03)** — complete per `progress-tracker.md`. `clerkMiddleware` in `proxy.ts` already protects routes; route handlers can call Clerk's server-side auth to get the current user ID (and email, for collaborator matching — see Open Questions).
- **`lib/prisma.ts` singleton** — complete (spec 05), confirmed present and exporting `prisma`.

### Open questions

1. **Does `GET /api/projects` include collaborator (shared) projects, or owner-only?** Spec 06's text just says "list current user's projects." Spec 07 (`wire-editor-home.md`, not this spec, but read for context per the Analyst's read-ahead need to scope this correctly) says the editor home fetches "owned and shared projects server-side using the existing project data helper" — implying the list route (or the helper wrapping it) must return both. `ProjectCollaborator` is keyed by email, not Clerk user ID, so returning shared projects requires resolving the authenticated user's email via Clerk (e.g. `currentUser()`), not just their user ID.
   **Recommendation:** Since spec 06's own acceptance text only says "list current user's projects" and never mentions collaborators, and since spec 07 is a separate, later spec that explicitly owns the "wire it up" step, ship `GET /api/projects` in this spec returning **owner-only** projects, matching the literal spec 06 text. Flag explicitly for spec 07's Analyst pass that it must decide then whether the list endpoint needs a shared/collaborator addition (e.g. a `?scope=` param or a second query) — do not have spec 06's Senior Developer guess at that shape now.
2. **Project ID vs. Liveblocks room ID.** Spec 07 says "slugify the name to create the room ID" and "The project ID and Liveblocks room ID should stay aligned," which reads as if the room ID is derived client-side from the name — in tension with spec 06's explicit instruction here to use the schema's default ID strategy (`cuid()`, server-generated). This spec's text is unambiguous ("use the schema's existing ID strategy, do not add sequential IDs"), so this brief follows it literally: `POST /api/projects` server-generates the ID via Prisma's default. **Recommendation:** flag this tension for spec 07's Analyst pass to resolve (e.g. project ID and room ID may simply be the same cuid, with "slugify" in spec 07 describing something else like a display slug) — not a spec 06 decision.
3. **404 on mutating a missing project.** Neither the spec text nor `project-overview.md` states this explicitly. Included as acceptance criterion 7 above as a recommendation derived from `code-standards.md`'s "consistent, predictable response shapes," not a decision pulled from spec text — flagged here per the hard rule against inventing behavior.
4. **Response envelope shape** (e.g. `{ project }` vs. the raw record, error shape `{ error: string }` vs. something more structured) is left to the Senior Developer; the spec does not define one and no prior spec in this codebase has established a convention yet. Not blocking — the Senior Developer should pick one and it becomes the convention for later API specs.

### Out-of-scope callouts

- **Collaborator invite/remove logic** — explicitly owned by spec 09 (`09-share-dialog.md`), which says "Add the required API logic for: listing collaborators, inviting collaborators, removing collaborators." This spec adds the `ProjectCollaborator` table (needed as a prerequisite, see Dependencies) but does not add any route that creates, lists, or deletes rows in it.
- **Any UI wiring** — spec text is explicit: "Keep this backend-only. Do not wire the UI yet." Spec 07 owns wiring the sidebar/dialogs to these routes.
- **Canvas snapshot / blob storage logic** — `canvasJsonPath` is included as a schema column (per spec 05's original plan) but no route in this spec reads or writes to Vercel Blob; that's spec 21 (canvas autosave) and later.
- **Enterprise permission tiers, billing, versioned spec history** — per `project-overview.md`'s Out of Scope wall; not implicated by this spec's text anyway, but noted per the hard rule.
- **Liveblocks room token issuance** — mentioned in `architecture-context.md`'s Auth and Collaboration Model but not part of this spec's four CRUD routes.

## Dev Notes

### Files added/changed

- `prisma/schema.prisma` — added `ProjectStatus` enum, `Project` model, `ProjectCollaborator` model, per the brief's field/index shape (Project: `ownerId`/`createdAt` indexes; ProjectCollaborator: `(projectId, email)` unique, `email` index, `(projectId, createdAt)` index, cascade delete on `Project`).
- `prisma/migrations/20260819021510_add_project_and_collaborator/` — new migration, applied to the linked Prisma Postgres database via `prisma migrate dev`.
- `lib/projects.ts` (new) — shared helper: `getAuthenticatedUserId()` (wraps Clerk `auth()`, returns `string | null`), `getOwnedProjectOrError(projectId, userId)` (single DB lookup, returns a discriminated union — `404` if missing, `403` if not owned, else the project), and the `DEFAULT_PROJECT_NAME` constant. Centralizes the 404-before-403 precedence so both mutation routes use identical logic.
- `lib/api-response.ts` (new) — `errorResponse(message, status)` → `NextResponse.json({ error: message }, { status })`. Establishes the error envelope convention.
- `app/api/projects/route.ts` (new) — `GET` (list owner's projects, `401` if unauthenticated) and `POST` (create project; empty/whitespace/missing `name` defaults to `"Untitled Project"`; malformed/missing JSON body is treated as an empty body rather than a `400`, so a bare `POST` still succeeds with defaults).
- `app/api/projects/[projectId]/route.ts` (new) — `PATCH` (rename; `401` unauthenticated, `400` missing/blank `name`, `404` missing project, `403` non-owner, `200` on success) and `DELETE` (`401`/`404`/`403` same precedence, `200` with `{ success: true }` on delete).
- `lib/prisma.ts` (fixed, pre-existing file from spec 05) — Prisma 7's generated `PrismaClient` no longer has a zero-argument constructor; the Accelerate branch (`prisma+postgres://` URLs) now requires `new PrismaClient({ accelerateUrl: databaseUrl })`. This was a latent `tsc` error (confirmed pre-existing via `git stash`) that this spec's schema change surfaced when regenerating the client; fixed as a root-cause fix, not a workaround, since it blocked the mandatory `tsc --noEmit` gate. Only the Accelerate branch changed — the `pg`-adapter branch this project actually uses (`postgres://`) is untouched.
- `app/api/projects/route.test.ts`, `app/api/projects/[projectId]/route.test.ts`, `lib/projects.test.ts` (new) — unit tests, see Test Coverage below.
- `vitest.config.mts` (new) — Vitest config: `node` test environment by default, `@/*` path alias matching `tsconfig.json`.
- `package.json` — added `test` script (`vitest run`); added `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom` as devDependencies (installed with `--legacy-peer-deps`, see decision below).
- `context/code-standards.md` — added a `## Testing` section recording the Vitest setup decision, environment convention, and the `--legacy-peer-deps` install note, per the persona's Testing instructions.
- `context/progress-tracker.md` — phase/goal updated to spec 06; spec 06 moved into "In Progress" pending QA.

### Key decisions

- **GET /api/projects scope**: owner-only, per the brief's Open Question 1 recommendation. Spec 07 must decide separately whether/how to add shared-project listing.
- **Project ID strategy**: server-generated `cuid()` via Prisma's schema default, per the brief's Open Question 2 — no client-supplied or sequential ID.
- **404-before-403 on mutations**: implemented as acceptance criterion 7 requires — `getOwnedProjectOrError` always checks existence before ownership, so a non-existent `projectId` never falls through to a `403`.
- **Response envelope** (brief's Open Question 4, left to Senior Developer): success responses use a resource-keyed envelope — `{ projects: [...] }`, `{ project: {...} }`, `{ success: true }` for delete; errors are `{ error: string }`. This is now the established convention for future API specs per the brief's instruction.
- **POST /api/projects with missing/invalid JSON body**: treated as an empty object (falls back to all defaults) rather than a `400`, so `POST /api/projects` with no body at all is a valid way to create a default-named project. `PATCH`, by contrast, returns `400` on unparseable JSON — a rename request must supply a body, so a parse failure there is a genuine client error, not "no fields provided."
- **`lib/prisma.ts` Accelerate-branch fix**: root-caused and fixed rather than worked around (see Files above) because it was blocking the mandatory `tsc --noEmit` gate. Flagging here since it technically touches a file spec 05 delivered, not spec 06's stated deliverables — no behavior change for this project's actual `postgres://` connection path.

### Test coverage

- `lib/projects.test.ts` — `getAuthenticatedUserId` (session / no-session), `getOwnedProjectOrError` (404 / 403 / owned).
- `app/api/projects/route.test.ts` — `GET` (401, owner-scoped list); `POST` (401, create with name, empty-name default, no-body default).
- `app/api/projects/[projectId]/route.test.ts` — `PATCH` (401, 400 missing name, 404, 403, 200 rename); `DELETE` (401, 404, 403, 200 delete).
- All Clerk `auth()` and Prisma calls are mocked (`vi.mock` + `vi.hoisted`) — no real database or Clerk session touched by these tests.
- Commands run, all passing:
  - `npx tsc --noEmit` — pass (0 errors).
  - `npx eslint` — pass (0 errors; 1 pre-existing warning in an unrelated `.agents/skills/...` template file, not touched by this spec).
  - `npx next build` — pass; `/api/projects` and `/api/projects/[projectId]` both registered as dynamic (`ƒ`) routes.
  - `npx vitest run` — pass, 20/20 tests, 3 test files.

### Known limitations / deferrals

- No rate limiting on these routes (consistent with the project-wide deferral already logged under "Deferred — Production Hardening").
- `ProjectCollaborator` table exists (schema prerequisite) but has no route reading/writing it yet — correctly out of scope per the brief (spec 09 owns that).
- No UI wiring, per the brief — verified no files under `components/`, `trigger/`, or any page were touched.
- Response envelope shape is a new convention established here, not dictated by prior spec text; flagged in case a later spec's Analyst wants to revisit it.

## QA Report

**Overall verdict: PASS**

### Mechanical gate

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass — 0 errors |
| `npx eslint` | Pass — 0 errors (1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/.../__root.tsx`, unrelated to this spec) |
| `npx next build` | Pass — `/api/projects` and `/api/projects/[projectId]` both compiled as dynamic (`ƒ`) routes; no `ignoreBuildErrors`/`ignoreDuringBuilds` bypass in `next.config.ts` |
| `npx vitest run` | Pass — 3 test files, 20/20 tests |
| `npx prisma migrate status` | "Database schema is up to date!" — the `20260819021510_add_project_and_collaborator` migration is applied against the linked database, not just present as a local file |

All four independently re-run; Dev Notes' claims confirmed accurate.

### Acceptance criteria

| # | Criterion | Result |
| --- | --- | --- |
| 1 | `GET /api/projects` returns authenticated user's projects; `401` unauthenticated | Pass |
| 2 | `POST /api/projects` creates project owned by authenticated user; `401` unauthenticated | Pass |
| 3 | `POST` with missing/empty name defaults to `Untitled Project` | Pass (whitespace-only name also correctly defaults) |
| 4 | Created project IDs use schema default `cuid()`; no sequential ID | Pass — `id String @id @default(cuid())`, no explicit `id` passed to `prisma.project.create` |
| 5 | `PATCH` renames when owner; `403` non-owner; `401` unauthenticated | Pass |
| 6 | `DELETE` deletes when owner; `403` non-owner; `401` unauthenticated | Pass |
| 7 | Mutating non-existent `projectId` returns `404`, not `403`/`500` | Pass — `getOwnedProjectOrError` checks existence before ownership on both `PATCH` and `DELETE` |
| 8 | Response shapes consistent across all four routes | Pass — `{ projects }` / `{ project }` / `{ success: true }` on success, `{ error }` on failure; envelope convention applied uniformly |
| 9 | `npm run build` passes | Pass (`next build` invoked directly; `package.json`'s `build` script is `next build`, same command) |

### Architecture invariants — spot-checked, none violated

- No long-running AI/background work in the route handlers.
- Metadata-only; no blob/canvas storage touched (`canvasJsonPath` added to schema per brief but unused, correctly out of scope).
- Auth (401) and ownership (403/404) enforced before every mutation in both `PATCH` and `DELETE`; `POST`/`GET` require auth.
- No `components/`, `trigger/`, or page files touched — confirmed via `git status`.

### Standards compliance — spot-checked

- No `any` in any new file (`lib/projects.ts`, `lib/api-response.ts`, both route files, all three test files) — `unknown` + `typeof` narrowing used throughout.
- No raw Tailwind color classes or hex literals in the changed files (N/A — no styling touched, confirmed via grep).
- `components/ui/*` untouched.
- Route handlers are thin; auth/ownership/lookup logic lives in `lib/projects.ts`, error envelope in `lib/api-response.ts`.
- Input validated before logic runs (name trimming/typeof checks precede any Prisma call).

### Error handling

- 401 (no session), 400 (missing/blank name on rename, invalid JSON on rename), 404 (missing project), 403 (authenticated non-owner) all covered and unit-tested.
- `POST`'s "malformed/missing JSON body → treated as empty object" decision is documented in Dev Notes and doesn't contradict any acceptance criterion (criterion 3 only requires missing/empty *name* to default; it doesn't require malformed JSON to `400`). Noting it here as an observation, not a bug — it's a reasonable, disclosed interpretation of an open question (brief's Open Question 4 left envelope/edge-case shape to the developer), and `PATCH`'s stricter behavior (400 on invalid JSON) is internally consistent with the stated rationale (rename requires a body; create doesn't).

### Housekeeping

- `context/progress-tracker.md` updated: Phase/Goal reflect spec 06, "In Progress" entry accurately describes state (awaiting QA — now resolved by this report).
- `context/code-standards.md` Testing section added, matches what was actually installed/configured (`vitest.config.mts`, `node` default environment, `--legacy-peer-deps` note) — verified against actual `package.json` devDependencies and `vitest.config.mts` contents.

### Issues

None found requiring routing back to Dev or Analyst. No `[Bug → Dev]` or `[Spec gap → Analyst]` items.

### Handoff

QA passed — ready for Product Owner review.

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Reasoning against `project-overview.md`

- **Success Criterion 1** ("A signed-in user can create and open a project"): this spec is backend-only by explicit instruction ("Keep this backend-only. Do not wire the UI yet.") and does not itself satisfy the criterion end to end — that's spec 07's job. What's delivered is the correct, necessary enabler: authenticated CRUD routes with owner enforcement. This is the expected shape of incremental progress under `ai-workflow-rules.md` ("Prefer small, verifiable increments," "Split an implementation step if it combines UI changes and ... API routes"), matching the pattern already set by specs 04 (UI-only, mocked) and 05 (schema-only). Not a case of "technically satisfies the brief while missing product intent" — the brief's scope *is* the product intent for this increment.
- **Success Criterion 6** ("Project metadata and generated artifacts are stored in the correct layers"): directly advanced. `Project`/`ProjectCollaborator` now exist in Postgres via Prisma, matching spec 05's originally documented shape (which had shipped incomplete — the Analyst Brief correctly caught and folded in the missing schema work rather than blocking spec 06 on a defective spec 05). `canvasJsonPath` is present but correctly unused (blob storage is spec 21+).
- Criteria 2–5 (real-time canvas, starter templates, AI generation, spec generation) are not implicated by this spec and are untouched — no regression risk observed.

### Scope check

- No item from `project-overview.md`'s Out of Scope list (billing, enterprise permission tiers, versioned spec history, production object storage, mobile) is implicated or touched.
- This spec's own out-of-scope callouts (collaborator invite/remove routes, UI wiring, blob storage reads/writes) were respected — QA independently confirmed via `git status` that no `components/`, `trigger/`, or page files were touched, and no route reads/writes `ProjectCollaborator` or the blob layer beyond the schema column.
- Two product-shaped decisions were deliberately deferred rather than guessed at: `GET /api/projects` scope (owner-only vs. shared) and the project-ID-vs-Liveblocks-room-ID tension with spec 07's text. Both are explicitly flagged in Dev Notes for spec 07's Analyst pass to resolve, rather than invented here. This is the correct call — spec 06's own text only says "list current user's projects" and "use the schema's existing ID strategy," and inventing an answer to a question spec 07 explicitly owns would risk a mismatch. Not a blocker for this spec; not something a later spec would be blocked from correcting.
- Response envelope convention (`{ projects }` / `{ project }` / `{ success: true }` / `{ error }`) is a reasonable, disclosed choice for an undefined convention and is now documented for future API specs to follow — a rough edge that's fine at this stage, not one that would block spec 07 or later API specs from building on it correctly.

### `progress-tracker.md` accuracy — NOT accurate, needs correcting

QA's Housekeeping section claims `progress-tracker.md` was updated so the "In Progress" entry "accurately describes state (awaiting QA — now resolved by this report)." That update was not actually made. As read for this review, the file still says:

- **Current Goal**: "Feature spec 06 (Project APIs) implemented, awaiting QA." — stale; QA has passed.
- **In Progress**: "Feature spec 06: Project APIs — implemented by Senior Developer, awaiting QA." — stale; should read as QA-passed, awaiting Product Owner sign-off.

The "Next Up" section, by contrast, is already correct ("QA pass on feature spec 06, then Product Owner sign-off, then feature spec 07"), and spec 06 is not yet moved into "Completed" — which is correct, since Product Owner sign-off (this review) had not happened until now.

This is a documentation-currency gap, not a product-scope or delivered-functionality problem, and `ai-workflow-rules.md`'s "Before Moving To The Next Unit" gate #3 ("`progress-tracker.md` reflects the completed work") means it must be fixed before spec 07 starts — not before this PASS is granted. Per this role's tool boundary (the only artifact this review produces is this section), I am not editing `progress-tracker.md` myself. Whoever picks up spec 07 (or the human, on accepting this PASS) should update the Current Goal / In Progress / Completed sections to reflect: spec 06 QA-passed and Product-Owner-approved, pending only the human's final go-ahead.

### Boundary note

This PASS means spec 06 is ready for the human to review and decide whether to accept it and move on to spec 07. It is not a deployment authorization, and this review has no visibility into business, legal, security, or infrastructure considerations outside this repo.
