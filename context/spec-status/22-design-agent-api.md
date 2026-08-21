# Spec 22: Design Agent API

Source spec: `context/feature-specs/22-design-agent-api.md`

## Analyst Brief

### Scope statement

Wire the backend plumbing for AI design generation: a `POST /api/ai/design` route that triggers a background task via Trigger.dev and records a `TaskRun`, a `POST /api/ai/design/token` route that issues a run-scoped Trigger.dev public token, and a minimal `trigger/design-agent.ts` task that accepts its payload and logs/echoes it. No AI provider call, no node/edge generation, and no canvas mutation happen anywhere in this spec.

### Concrete deliverables

- `package.json` — add the Trigger.dev SDK package (`@trigger.dev/sdk`) as a new dependency. **This is genuinely new infrastructure, not a reuse of something already installed** — see Open Questions #1.
- `trigger.config.ts` (new, project root) — Trigger.dev v3's own required project configuration file (project ref, task directories). Does not exist yet; must be created from scratch.
- `trigger/design-agent.ts` (new) — a minimal Trigger.dev task definition. Accepts `{ prompt: string; roomId: string }`, logs/echoes the payload, returns without calling any AI provider or touching Liveblocks/canvas state.
- `prisma/schema.prisma` (modified) — new `TaskRun` model: `id` (cuid PK, matching this schema's existing convention on `Project`/`ProjectCollaborator`), `runId` (unique), `projectId`, `userId`, `createdAt`. Indexes: one on `runId`, one compound on `[userId, projectId]`. Requires a real migration (`prisma migrate dev` / `prisma db push`), same as every prior schema-touching spec.
- `lib/trigger.ts` (new, likely) — a small shared module wrapping the Trigger.dev SDK's trigger/token calls, mirroring `lib/liveblocks.ts`'s lazy-instantiation-on-first-call pattern so a missing `TRIGGER_SECRET_KEY` doesn't break `next build`'s page-data collection. Exact shape is a Senior Developer call — see Open Questions #5.
- `app/api/ai/design/route.ts` (new) — `POST`: parses `{ prompt, roomId, projectId }`, enforces auth + project access via the existing `getProjectAccess(projectId)` helper (`lib/project-access.ts`) before triggering anything, triggers `trigger/design-agent.ts`'s task, creates a `TaskRun` row, returns `{ runId }`.
- `app/api/ai/design/token/route.ts` (new) — `POST`: parses `{ runId }`, authenticates the caller, looks up the `TaskRun` by `runId`, verifies `TaskRun.userId` matches the caller, issues a Trigger.dev public token scoped to that run with a 1-hour expiration, returns `{ token }`.
- Tests: `trigger/design-agent.test.ts`, `app/api/ai/design/route.test.ts`, `app/api/ai/design/token/route.test.ts` (all new), following this repo's existing convention of mocking Clerk's `auth()` and the Prisma singleton via `vi.mock`/`vi.hoisted` (`code-standards.md`'s Testing section) plus mocking the new Trigger.dev SDK calls the same way.
- No `components/*` file changes — this spec is backend-only (per its own "keep this focused on backend task wiring only" Scope Limit).

### Acceptance criteria

1. `POST /api/ai/design` returns 401 for an unauthenticated caller and 404/403 (via `getProjectAccess`) for a missing or non-member project, before any Trigger.dev call or Prisma write happens.
2. `POST /api/ai/design`, given a valid authenticated owner-or-collaborator request, triggers the `trigger/design-agent.ts` task through the Trigger.dev SDK and creates one `TaskRun` row (`runId`, `projectId`, `userId`, `createdAt`).
3. `POST /api/ai/design` returns the triggered run's ID to the client (`{ runId }`) — per this spec's own text, not a token (see Open Questions #2 for a mismatch with a later spec's assumption).
4. `TaskRun` exists in `prisma/schema.prisma` with `runId` (unique), `projectId`, `userId`, `createdAt`, an index on `runId`, and a compound index on `[userId, projectId]`.
5. `POST /api/ai/design/token` returns 401 for an unauthenticated caller.
6. `POST /api/ai/design/token`, given a `runId` that does not belong to the caller (or does not exist), does not return a usable token (403/404 — exact split is a Senior Developer call, following this repo's existing 401/404/403 precedence convention).
7. `POST /api/ai/design/token`, given a `runId` owned by the caller, issues a Trigger.dev public token scoped to that run only, with a 1-hour expiration, and returns it to the client.
8. `trigger/design-agent.ts` exports a task callable with `{ prompt, roomId }` that logs/echoes its input and performs no AI provider call, no node/edge creation, and no canvas/Liveblocks mutation.
9. No AI provider (Gemini/`@ai-sdk/google`) call exists anywhere in this spec's diff.
10. No canvas, node, edge, or Liveblocks room mutation exists anywhere in this spec's diff.
11. Request handlers stay thin — the actual task body lives only in `trigger/design-agent.ts`, not inline in either route handler (`architecture-context.md` Invariant 1: "Request handlers do not run long-lived AI work").
12. `npm run build` passes, along with this repo's other standard gates (`npx tsc --noEmit`, `npx eslint .`, `npx vitest run`) per `code-standards.md`'s Testing section — including with no `TRIGGER_SECRET_KEY` set in this environment, if the lazy-instantiation pattern from Open Questions #1/#5 is followed.

### Dependencies

- Spec 05 (Prisma Postgres) + spec 06 (Project APIs) — `Project` model and Prisma singleton (`lib/prisma.ts`). **Complete.**
- Spec 08 (Editor Workspace Shell) + spec 09 (Share Dialog) — the owner/collaborator access model (`lib/project-access.ts#getProjectAccess`) this spec's auth gate reuses directly, same as the spec 21 canvas route. **Complete.**
- Spec 10 (Liveblocks Setup) + spec 11 (Base Canvas) — establishes the "room ID = project ID" convention this spec's `roomId`/`projectId` inputs rely on. **Complete.**
- Spec 20 (AI Sidebar Shell) — the future UI consumer of these routes (spec 26's job, not this one). Explicitly confirmed untouched by this spec. **Complete, not modified here.**
- Spec 21 (Canvas Autosave) — establishes the "lazy client/token instantiation so a missing secret doesn't break `next build`" precedent (`lib/liveblocks.ts`, `lib/canvas-blob.ts`) this spec should follow for its own Trigger.dev client. **Complete.**
- **Trigger.dev itself: not complete, and not actually present in this repo.** Confirmed via `package.json` (no `@trigger.dev/*` dependency), a repo-wide glob (no `trigger/` directory, no `trigger.config.*` anywhere), and `.claude/skills/` (no Trigger.dev skill exists — only Prisma and Liveblocks skills are installed). See Open Questions #1 — this contradicts the spec's own "check the existing Trigger.dev setup ... reuse the existing setup" instruction.
- `TRIGGER_SECRET_KEY` (or whatever env var the installed SDK version requires) is not present in `.env.local` — same category of gap already logged for `LIVEBLOCKS_SECRET_KEY` (spec 10) and `BLOB_READ_WRITE_TOKEN` (spec 21); needs provisioning by a human before these routes can be exercised end-to-end against a real Trigger.dev project.
- `GEMINI_API_KEY` / any AI provider — **not a dependency of this spec.** Spec 23's own text claims "`GEMINI_API_KEY` is already in `.env.local`," but that file (read directly) contains no such variable today. Not this spec's problem to fix (no AI calls happen here), but flagged so it doesn't surprise spec 23's own Analyst pass.

### Open questions

1. **No Trigger.dev setup exists anywhere in this repo**, despite the spec's own instruction to "check the existing Trigger.dev setup and installed agent features first" and "reuse the existing setup instead of creating a new pattern." Verified directly: no `@trigger.dev/*` package in `package.json`, no `trigger/` directory, no `trigger.config.*` file, no Trigger.dev skill under `.claude/skills/`. Recommendation: this spec is the one that bootstraps Trigger.dev from scratch (SDK dependency + root `trigger.config.ts`) — there is nothing to "reuse" yet. This should follow the same "fail only when actually invoked, not at import/build time" posture `lib/liveblocks.ts`/`lib/canvas-blob.ts` already established, so `next build` doesn't break in this environment (no `TRIGGER_SECRET_KEY` set). Flagging for Senior Developer confirmation before build, same as spec 21's Open Questions #1 (a spec assuming pre-existing infrastructure that turned out not to exist).
2. **Response-shape mismatch with spec 26** (not in scope for this brief, read only for context): spec 26's own text assumes `POST /api/ai/design` returns `{ runId, publicToken }` in a single call, but spec 22's own text describes two separate routes — the design route returning only a run ID, and a distinct token route issuing the public token. This brief follows spec 22's literal text (two routes; the design route returns `{ runId }` only), since specs are implemented one at a time and rewriting spec 22 to satisfy a later spec's assumption would be scope creep. Recommendation: flag this in `progress-tracker.md`'s Open Questions so whoever picks up spec 26 knows to call the token route as an explicit second step (or revisit spec 26's own text) — not something to silently reconcile now.
3. **Auth/access model for `POST /api/ai/design`** isn't stated beyond "accept ... `projectId`." Recommendation: owner-or-collaborator via the existing `getProjectAccess(projectId)` helper — same precedent as the spec 21 canvas route — since `project-overview.md`'s Core User Flow step 5 ("user prompts the AI to generate or extend the system design") is a collaborative action available to any project member, not an owner-only one.
4. **`roomId` vs. `projectId` as two independently client-supplied fields**: the spec's own text asks the route to accept both. Every prior spec (10, 11, 21) establishes room ID = project ID as a fixed convention, so accepting both independently risks them disagreeing. Recommendation: treat `projectId` as the sole source of truth for the access check and Prisma write, and either require `roomId === projectId` or simply ignore a mismatched `roomId` in favor of `projectId` when calling the task — a Dev-level implementation detail, not a product decision, but worth a one-line code comment either way.
5. **Ownership check for `POST /api/ai/design/token`**: the spec says "verify ownership using the TaskRun record." Recommendation: check `TaskRun.userId === current authenticated caller's Clerk ID` specifically (not a broader project-membership re-check) — this is the literal mechanism the spec names, and it also correctly prevents any other project collaborator from grabbing a token for someone else's in-flight run, which a project-membership check alone would not catch.
6. **Exact Trigger.dev SDK call shapes** (task-triggering call, public-token-creation call and its scope/expiration options) aren't specified in the spec text beyond "trigger the design task," "generate a Trigger.dev public token scoped to that run," and "set token expiration to 1 hour." This is a Senior Developer implementation detail to resolve against whatever SDK version actually gets installed — flagged here only because it's the first spec touching this SDK at all, so there's no existing in-repo pattern to point to (unlike, say, `getLiveblocksClient()` for Liveblocks). `progress-tracker.md`'s Architecture Decisions already pins the 1-hour token expiration as consistent with spec 27's later, identical requirement.
7. **`TaskRun`'s relation to `Project`**: the spec's field list only asks for a plain `projectId String` column, not an explicit Prisma relation. Recommendation: add a real `@relation` back to `Project` with `onDelete: Cascade`, matching `ProjectCollaborator`'s existing pattern in this same schema — avoids orphaned `TaskRun` rows if a project is deleted. A minor, reasonable addition beyond the spec's literal field list, not scope creep, flagged as a recommendation rather than a unilateral decision.
8. **Input validation approach**: neither `zod` nor any other schema-validation library is currently installed (`package.json` confirmed). Spec 27 (a later spec) explicitly asks for Zod; spec 22 does not. Recommendation: follow this repo's existing manual-type-guard convention (e.g. `isValidCanvasBody` in the spec-21 canvas route) for this spec's two routes, and let spec 27 introduce the `zod` dependency when it explicitly asks for it — not this spec's job to add a new validation library unprompted.

### Out-of-scope callouts

- **Any AI provider call** (Gemini, `@ai-sdk/google`, or any other model) — explicitly spec 23's job ("use Gemini ... to interpret the user prompt"); this spec's own text says "don't call any AI providers."
- **Node/edge generation or any canvas mutation** — explicitly spec 23's job ("update the canvas using the existing collaborative flow utilities"); this spec's own Scope Limits say "don't generate nodes or edges yet" and "don't update the canvas."
- **AI presence (cursor + thinking state) and the `ai-status-feed` broadcast** — spec 23/24's job, not touched here.
- **`ai-chat` feed, sidebar wiring, `useRealtimeRun`, chat bubbles, status strip UI** — spec 25/26's job. No `components/editor/*` file is touched by this spec.
- **`POST /api/ai/spec` / `trigger/generate-spec.ts`** — spec 27's structurally similar but separate route/task pair for spec generation. Not bundled into this spec despite the near-identical shape (own trigger route, own token route, own `TaskRun` usage) — per `ai-workflow-rules.md`'s "do not combine multiple unrelated API routes" scoping rule.
- **Rate limiting on `/api/ai/design`** — already logged as a cross-cutting item in `progress-tracker.md`'s "Deferred — Production Hardening" section, explicitly not this spec's job.
- **Billing/subscriptions, enterprise permission tiers, versioned history, production object storage migration, mobile apps** — `project-overview.md`'s Out of Scope wall; none of this spec's work touches any of them.

Brief ready for Senior Developer at `context/spec-status/22-design-agent-api.md`.

## Dev Notes

### Files added

- `package.json`/`package-lock.json` — added `@trigger.dev/sdk@^4.5.12` (installed via `npm install --legacy-peer-deps`, consistent with this repo's existing peer-dep workaround; `npm view` confirmed `4.5.x` is current `latest`, not a v3-vs-v4 pin — the brief's "Trigger.dev v3's own required project configuration file" phrasing describes the concept generically, not a version requirement; the v4 SDK's own module path is still `@trigger.dev/sdk/v3` internally, so its own docs/types still say "v3" throughout).
- `trigger.config.ts` (new, project root) — `defineConfig({ project, dirs: ["./trigger"], maxDuration: 60, retries })`. `project` reads `TRIGGER_PROJECT_REF` with a placeholder fallback (no real Trigger.dev project provisioned in this environment — same category of gap as `LIVEBLOCKS_SECRET_KEY`/`BLOB_READ_WRITE_TOKEN`). This file is only read by the Trigger.dev CLI, never imported by the Next.js app, so the placeholder can't break `next build`. `maxDuration` is required by the installed SDK's `TriggerConfig` type (the SDK's own bundled docs example shows it as optional — the installed type disagrees; set to 60s, generous for this spec's task).
- `trigger/design-agent.ts` (new) — exports `DesignAgentPayload`, `DesignAgentResult`, `DESIGN_AGENT_TASK_ID = "design-agent"`, `runDesignAgent(payload)` (the task's actual run logic, exported separately so it's unit-testable without Trigger.dev's runtime — the SDK's public `Task` object has no way to invoke `run` locally), and `designAgentTask = task({ id: DESIGN_AGENT_TASK_ID, run: runDesignAgent })`. Logs via `logger` from `@trigger.dev/sdk` and echoes `{ received: true, prompt, roomId }`; no AI call, no node/edge generation, no Liveblocks/canvas touch.
- `lib/trigger.ts` (new) — `triggerDesignAgent(payload)` (calls `tasks.trigger<typeof designAgentTask>(DESIGN_AGENT_TASK_ID, payload)`, returns `{ runId: handle.id }`) and `createDesignRunToken(runId)` (calls `auth.createPublicToken({ scopes: { read: { runs: [runId] } }, expirationTime: "1h" })`). Both call a private `requireTriggerSecretKey()` first for a legible error message, mirroring `lib/canvas-blob.ts#requireBlobToken`. Verified directly against the installed SDK's `apiClientManager` source that `tasks.trigger`/`auth.createPublicToken` already resolve `TRIGGER_SECRET_KEY` lazily inside their own call bodies (not at import time) — so this module's own explicit check is a UX improvement on top of an already-safe underlying pattern, not the only thing preventing an import-time throw.
- `prisma/schema.prisma` (modified) — new `TaskRun` model (`id` cuid PK, `runId` unique, `projectId`, `userId`, `createdAt`, index on `runId`, compound index on `[userId, projectId]`, `@relation` to `Project` with `onDelete: Cascade` per Open Questions #7) plus a matching `taskRuns TaskRun[]` back-reference on `Project`, mirroring `ProjectCollaborator`'s existing pattern. Migration `prisma/migrations/20260821055559_add_task_run/` applied via `prisma migrate dev` against the real (already-provisioned) Prisma Postgres database.
- `app/api/ai/design/route.ts` (new) — `POST`: auth (`getCallerIdentity`) → parse/validate body → `roomId === projectId` check → `getProjectAccess(projectId)` (owner-or-collaborator) → `triggerDesignAgent` → `prisma.taskRun.create` → `{ runId }`.
- `app/api/ai/design/token/route.ts` (new) — `POST`: auth → parse/validate body → `prisma.taskRun.findUnique({ where: { runId } })` → `taskRun.userId === identity.userId` ownership check → `createDesignRunToken` → `{ token }`.
- Tests: `trigger/design-agent.test.ts`, `lib/trigger.test.ts` (added beyond the brief's three named test files — `lib/trigger.ts` is new non-trivial shared infra the routes mock away entirely, so its own logic needed direct coverage, matching `lib/canvas-blob.test.ts`'s precedent for the analogous spec-21 module), `app/api/ai/design/route.test.ts`, `app/api/ai/design/token/route.test.ts` (all new).

### Skills used

- `prisma-cli` — referenced for the `prisma migrate dev` workflow and to confirm `migrate dev` isn't in the destructive-command consent list (only `migrate reset`/`db push --force-reset`/`--accept-data-loss` are).
- No Trigger.dev skill exists under `.claude/skills/` (confirmed absent, per the brief's own dependency note) — the SDK's own bundled `node_modules/@trigger.dev/sdk/docs/` (config file docs) and its shipped `.d.ts` files (`tasks.d.ts`, `auth.d.ts`, `config.d.ts`, `shared.d.ts`) were read directly instead, since training data can't be trusted for an SDK with no in-repo precedent and versions move fast (installed `4.5.12`, published within the last day per `npm view`).

### Key decisions (brief's Open Questions)

1. **Bootstrapped Trigger.dev from scratch** — added `@trigger.dev/sdk`, `trigger.config.ts`, `trigger/design-agent.ts`; nothing to reuse, confirmed via `npm view` (SDK not installed), repo glob (no `trigger/`/`trigger.config.*`), and `.claude/skills/` (no Trigger.dev skill).
2. **Response-shape mismatch with spec 26** — left alone, per the brief. `POST /api/ai/design` returns `{ runId }` only; the token route is a separate call. Flagged again here for whoever picks up spec 26.
3. **Auth model for `POST /api/ai/design`** — owner-or-collaborator via `getProjectAccess`, same as the spec 21 canvas route.
4. **`roomId` vs `projectId`** — chose the stricter of the brief's two recommended options: `roomId` must equal `projectId` or the request is rejected as malformed (400), rather than silently ignoring a mismatch. `projectId` is what's used for the access check and the `TaskRun` write; the (now-verified-equal) `roomId` is what's passed to the triggered task's payload.
5. **Ownership check for the token route** — `TaskRun.userId === caller's Clerk ID` specifically, not a broader project-membership re-check, per the brief's recommendation.
6. **Trigger.dev SDK call shapes** — resolved by reading the installed SDK's own `.d.ts` files directly rather than guessing from training data: `tasks.trigger<typeof designAgentTask>(id, payload)` (typed via a type-only import of the task, the SDK's own documented pattern) returns a `RunHandle` with `.id`; `auth.createPublicToken({ scopes: { read: { runs: [runId] } }, expirationTime: "1h" })` issues a run-scoped token (`expirationTime` accepts a duration string per the SDK's own type).
7. **`TaskRun` → `Project` relation** — added the `@relation`/`onDelete: Cascade` pair (plus the `taskRuns TaskRun[]` back-reference required for Prisma to accept the relation), matching `ProjectCollaborator`.
8. **Input validation** — manual type guards (`isValidDesignRequestBody`/`isValidTokenRequestBody`), no `zod` added, per the brief.

### Additional implementation notes (not brief Open Questions)

- **Auth-before-body-parsing ordering in `POST /api/ai/design`**: unlike the spec 21 canvas route (which gets `projectId` from the URL and can gate on `getProjectAccess` before touching the body), this route's `projectId` only exists inside the JSON body. To still guarantee "401 for unauthenticated" regardless of body shape, auth is checked first via a standalone `getCallerIdentity()` call, then the body is parsed/validated, then `getProjectAccess(projectId)` runs (which re-derives identity internally — a small, deliberate redundancy, same pattern `app/api/liveblocks-auth/route.ts` already uses for its own post-access-check `currentUser()` call).
- **`maxDuration` in `trigger.config.ts`**: the installed SDK's `TriggerConfig` type marks this required, contradicting the SDK's own bundled docs example (which shows it as optional). Followed the type, not the docs prose, since `tsc --noEmit` is a hard gate.

### Test coverage

- `trigger/design-agent.test.ts` — `runDesignAgent` logs and echoes the payload verbatim (including an empty-string edge case, since validation is the route's job, not the task's); `designAgentTask` is registered with the expected `id`/`run` (captured from the mock's single import-time call, taken before any `beforeEach` clears mock history — a real gotcha this test file hit and fixed: asserting on the live mock inside a test body after `vi.clearAllMocks()` in `beforeEach` always saw zero calls, since `task(...)` only runs once at module load).
- `lib/trigger.test.ts` — both exported functions: throws a handled, `TRIGGER_SECRET_KEY`-mentioning error when the key is unset (and skips the SDK call entirely); calls the underlying SDK function with the exact expected shape (task id + payload; run-scoped `scopes`/`1h` `expirationTime`) on success; propagates a genuine upstream rejection rather than swallowing it.
- `app/api/ai/design/route.test.ts` — 401 before any downstream call; 400 for invalid JSON, missing fields, blank prompt, and `roomId`/`projectId` mismatch (each confirming `getProjectAccess` was never reached); 404/403 via `getProjectAccess`; success path (triggers with the exact `{ prompt, roomId }` shape, creates exactly one `TaskRun` row with the right fields, returns `{ runId }`); 502 when triggering fails (and the Prisma write is skipped); 500 when the Prisma write fails after a successful trigger.
- `app/api/ai/design/token/route.test.ts` — 401 before touching the body/Prisma/Trigger.dev; 400 for invalid JSON and a non-string `runId`; 404 for an unknown `runId`; 403 when the run belongs to a different caller; success path (returns `{ token }`, calls `createDesignRunToken` with the exact `runId`); 502 when token issuance fails upstream.
- Full suite: 389/389 tests passing across 49 files (up from 362/45 at the end of spec 21), via `npx vitest run --no-file-parallelism`. One transient `canvas.test.tsx` forked-worker timeout was observed on the first full run (environment-driven, consistent with this repo's documented flakiness under default parallelism — see spec 18/20's notes) and did not reproduce on immediate re-run; not related to this spec's diff (that file is untouched).
- `npx tsc --noEmit`, `npx eslint .` (0 errors; one pre-existing warning in an unrelated `.agents/skills/` template file, not touched by this diff), `npx vitest run --no-file-parallelism`, `npx next build` (with no `TRIGGER_SECRET_KEY` set in this environment — confirmed absent from both `.env` and `.env.local` before running) all pass. The build output lists `/api/ai/design` and `/api/ai/design/token` as dynamic (`ƒ`) routes, confirming they compiled and were included in page-data collection without needing a live Trigger.dev secret.

### Known limitations / deferrals

- No live Trigger.dev project is provisioned in this environment (`TRIGGER_PROJECT_REF`/`TRIGGER_SECRET_KEY` both absent) — same category of human-provisioning gap already logged for Liveblocks/Blob in specs 10/21. Neither route nor the task has been exercised against a real Trigger.dev backend; only the lazy-instantiation failure path (missing key → handled error, not a crash) and full request-handler logic (with the SDK mocked) are verified.
- Per this spec's explicit scope: no AI provider call, no node/edge generation, no canvas/Liveblocks mutation anywhere in this diff — confirmed via `git diff` that no `components/*` file is touched.

## QA Report

**Overall verdict: FAIL**

### Mechanical gate

- `npx tsc --noEmit` — pass (no output, no errors).
- `npx eslint .` — pass (0 errors; 1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/.../__root.tsx`, confirmed unrelated to this spec's diff).
- `npx next build` — pass, with no `TRIGGER_SECRET_KEY`/`TRIGGER_PROJECT_REF` set in the environment (confirmed absent from both `.env` and `.env.local` before running). Build output lists `/api/ai/design` and `/api/ai/design/token` as dynamic (f) routes, confirming `lib/trigger.ts`'s lazy-instantiation pattern genuinely holds - module import alone (during page-data collection) never throws.
- `npx vitest run --no-file-parallelism` — pass, 389/389 tests across 49 files.
- `npx prisma migrate status` — pass, "Database schema is up to date!" against the real Prisma Postgres database; the add_task_run migration is genuinely applied, not just generated.

All mechanical gate items pass.

### Acceptance criteria checklist

1. 401 unauthenticated / 404 missing project / 403 non-member, before any Trigger.dev call or Prisma write — Pass. `app/api/ai/design/route.ts` checks `getCallerIdentity()` first (401), then body validation, then `getProjectAccess`; `route.test.ts` explicitly asserts the trigger and Prisma create mocks were never called in the 401/404/403 cases.
2. Valid owner-or-collaborator request triggers the task and creates one TaskRun row — Pass, verified in code and in `route.test.ts`'s success-path test (collaborator case also covered, not just owner).
3. Returns `{ runId }`, not a token — Pass, `route.ts` returns `NextResponse.json({ runId: triggeredRun.runId })` only.
4. TaskRun schema shape (runId unique, projectId, userId, createdAt, index on runId, compound index on userId+projectId) — Pass, confirmed directly against `prisma/schema.prisma` and the generated migration.sql; a real relation/onDelete Cascade to Project was added beyond the literal field list, matching ProjectCollaborator's existing pattern (reasonable per the brief's Open Questions #7, not scope creep).
5. token route 401 for unauthenticated — Pass, tested first, before body/Prisma/Trigger.dev are touched.
6. Non-owned or nonexistent runId does not return a usable token — Pass, 404 for unknown runId, 403 for a runId owned by a different caller, both tested with the token-creation mock asserted never called.
7. Owned runId issues a run-scoped token with 1-hour expiration — Pass, `lib/trigger.ts` createDesignRunToken calls auth.createPublicToken with scopes read runs [runId] and expirationTime "1h", verified directly in `lib/trigger.test.ts`.
8. trigger/design-agent.ts exports a task callable with prompt/roomId that logs/echoes and does nothing else — Pass, runDesignAgent only logs and returns received/prompt/roomId; no AI/canvas/Liveblocks code path exists anywhere in the file.
9. No AI provider call anywhere in the diff — Pass, confirmed via the scoped diff against spec/21-canvas-autosave — no Gemini/ai-sdk reference outside of prose comments/spec-status doc text.
10. No canvas/node/edge/Liveblocks mutation anywhere in the diff — Pass, same diff check; no components file touched, no Liveblocks import anywhere in the new code.
11. Request handlers stay thin, task logic lives only in trigger/design-agent.ts — Pass. Both routes are auth, then parse/validate, then access/ownership check, then one lib/trigger.ts call, then one Prisma call, then response; no task logic inlined.
12. Full standard gate passes, including with no TRIGGER_SECRET_KEY set — Pass, reproduced independently above, not just trusting the Dev's report.

All 12 acceptance criteria independently re-verified and pass.

### Architecture invariants

- Invariant 1 (no long-running AI work in a request handler) — confirmed. Both routes only call `lib/trigger.ts`'s thin wrapper (a single SDK call each) and a single Prisma read/write; the actual task body lives solely in `trigger/design-agent.ts`, executed by Trigger.dev's own runtime, not inline in either route.
- Invariant 2 (metadata vs. blob storage kept separate) — n/a to this spec (no blob/artifact writes introduced); TaskRun correctly lives in Postgres via Prisma only.
- Invariant 3 (auth/ownership enforced at every mutation boundary) — confirmed. `POST /api/ai/design` gates via `getProjectAccess` before the Prisma write; `POST /api/ai/design/token` gates via a TaskRun.userId-specific check (not a broader project-membership check) before token issuance, correctly preventing a project collaborator from grabbing another collaborator's run token.
- Invariant 4/5 — not implicated by this spec (no client component or canvas-schema change introduced).

No invariant violations found.

### Standards compliance

- No raw Tailwind color classes (zinc-/slate-) or hex literals introduced — confirmed via grep across every changed file; this is a backend-only spec with zero styling surface.
- No `any` introduced anywhere in the diff — confirmed via grep across all new/changed .ts files (only prose-comment/test-description matches for the word "any").
- `components/ui/*` untouched — confirmed via `git diff --stat` against the spec/21-canvas-autosave base; no components file appears in the diff at all.
- Manual type guards (isValidDesignRequestBody/isValidTokenRequestBody) used for input validation, consistent with the brief's Open Questions #8 recommendation and this repo's existing convention (isValidCanvasBody from spec 21) — no new validation library added.
- `lib/trigger.ts` genuinely follows the lazy-instantiation-on-first-call pattern from `lib/liveblocks.ts`/`lib/canvas-blob.ts` — re-verified independently (not just trusting the Dev's claim) by running `npx next build` with TRIGGER_SECRET_KEY confirmed absent from both .env and .env.local; build succeeded and both new routes compiled as dynamic routes.

### Error handling

- Bad input on POST /api/ai/design: invalid JSON returns 400; missing/blank prompt/roomId/projectId returns 400; roomId not equal to projectId returns 400 (rejected as malformed per Open Questions #4's stricter option) — all tested.
- Unauthorized/missing/non-member project returns 401/404/403 on POST /api/ai/design, tested with downstream calls asserted never invoked.
- Upstream Trigger.dev trigger failure returns 502, Prisma write correctly skipped (tested); Prisma write failure after a successful trigger returns 500 (tested) — a real run now exists in Trigger.dev with no corresponding TaskRun row in this specific failure mode, an inherent two-phase-write gap rather than a defect in this diff (no compensating action is specified anywhere in the brief), so not logged as a bug.
- POST /api/ai/design/token: invalid JSON / non-string runId returns 400; unknown runId returns 404; runId owned by a different caller returns 403; upstream token-issuance failure returns 502 — all tested.

### Housekeeping

Fails. `context/progress-tracker.md` was not updated to reflect spec 22's actual implementation state:

- The Current Phase section still reads "Phase 22: Design Agent API - not yet started" (line 6).
- The In Progress section still reads "(none - spec 22 not yet started)" (line 276).
- The Next Up section still lists "Analyst pass for feature spec 22 (Design Agent API)" as the next action (line 280) - stale; both the Analyst brief and the Dev's implementation are already done.
- No entry for spec 22 exists under Completed at all.

This is a genuine regression from this repo's own established convention, not a stylistic nitpick: the commit history for context/progress-tracker.md shows spec 21's feat(21-canvas-autosave) commit did update the Phase/Current Goal/In Progress/Next Up sections as part of the same implementation commit (confirmed via git show 648a2bb --stat), with the full Completed write-up (including QA/PO notes) added later in a separate docs: mark spec 21 completed commit. Spec 22's feat(22-design-agent-api) commit (8358f04) touched no file under context/ except context/spec-status/22-design-agent-api.md - git show 8358f04 --stat confirms context/progress-tracker.md is absent from that commit's file list entirely. This also violates AGENTS.md's explicit, top-level instruction: "Update context/progress-tracker.md after each meaningful implementation change."

### Issues found

- [Bug -> Dev] context/progress-tracker.md not updated for spec 22's implementation. File: context/progress-tracker.md, lines 6, 276, 280. Expected: at minimum, the Current Phase / Current Goal / In Progress / Next Up sections updated to reflect "Senior Developer pass complete, awaiting QA" (mirroring exactly what spec 21's feat commit did in progress-tracker.md's equivalent sections at that point in its own pipeline), with the file list and gate results recorded. This is a coordination-critical document other agents (Product Owner, and the Analyst kicking off the next spec) read to determine pipeline state - leaving it stale is misleading, not cosmetic.

No other bugs and no spec gaps found. All 12 acceptance criteria pass on their own merits, all mechanical gates are genuinely green (independently reproduced, not just trusted from the Dev's report), and no architecture invariant or standards violation was found anywhere in the diff.

QA failed — see issues above. Routing to Dev only (no spec gap; the brief itself is clear and was followed correctly in every other respect).

## QA Report — re-review (round 2)

**Overall verdict: PASS**

### Scope of this re-review

Per instruction, this round verifies only the single outstanding item from the round-1 FAIL — `context/progress-tracker.md` staleness — plus a check that commit `4db643c` introduced no other regression. The full mechanical gate and all 12 acceptance criteria were independently re-verified in round 1 and are not re-run here, since nothing in the implementation changed.

### Diff scope

`git show 4db643c --stat` confirms exactly two files touched: `context/progress-tracker.md` (8 lines changed) and `context/spec-status/22-design-agent-api.md` (74 lines added — the round-1 QA Report itself, appended in the same commit). No `app/`, `lib/`, `trigger/`, `prisma/`, or `components/` file appears anywhere in this commit — confirmed directly, not assumed. This is a docs-only commit, consistent with the orchestrator's stated rationale (a doc correction, not a code defect, so it bypassed a Dev round).

### `context/progress-tracker.md` re-verification

Read the file directly (not trusting the diff alone):

- `## Current Phase` (line 6): "Phase 22: Design Agent API — Senior Developer pass complete, awaiting QA." — accurate; matches the actual state (Dev implementation complete, this is the QA re-review).
- `## Current Goal` (line 9): correctly names this as a QA re-review, correctly attributes the sole round-1 finding (progress-tracker staleness) and correctly notes it was fixed directly rather than routed through a full Dev bugfix round, with an accurate root-cause note (Dev was instructed to skip this file this round).
- `## In Progress` (line 276): full spec 22 entry present — branch name, file list (Trigger.dev bootstrap, `TaskRun` model, both routes with accurate one-line descriptions of their behavior), pointer to Dev Notes for detail, accurate gate results (389/389 tests, `tsc`/`eslint`/`build` all passing, build with no `TRIGGER_SECRET_KEY` set), and an accurate one-line summary of the round-1 QA outcome (FAIL on progress-tracker staleness only; all 12 criteria and the full gate independently passed).
- `## Next Up` (line 280): correctly lists "QA re-review of feature spec 22" as the next action — matches this review actually happening now.
- No stale "not yet started" language remains anywhere in the spec 22-related sections (confirmed via direct read of lines 1–20 and 265–283; the round-1 FAIL's specific complaint — line 6 still reading "not yet started", line 276 reading "(none — spec 22 not yet started)", line 280 still listing "Analyst pass for feature spec 22" — is fully resolved).

### Format/convention check against spec 21 and spec 20 precedent

- Structurally matches `git show 648a2bb -- context/progress-tracker.md` (spec 21's own feat-commit progress-tracker bump) line-for-line in shape: same four sections touched (Current Phase, Current Goal, In Progress, Next Up), same "Senior Developer pass complete, awaiting QA" phrasing convention, same level of file-list/gate-result detail in the In Progress entry, same "no full Completed entry yet — that lands after PO sign-off" convention (no premature `## Completed` entry for spec 22 was added, correctly deferring that to a later `docs: mark spec 22 completed` commit, matching spec 21's `13a7e8a` precedent).
- Matches spec 20's round-2 precedent (`context/spec-status/20-ai-sidebar-shell.md`'s own "QA re-review" section) in narrating the FAIL → fix → re-review PASS trail explicitly inside `progress-tracker.md`'s Current Goal, rather than silently overwriting the history.

### Regression check

- `git status --porcelain` — clean working tree, no uncommitted stray changes beyond this commit.
- No code, test, schema, or component file touched by `4db643c` — confirmed via `git show --stat` above. Round 1's mechanical gate and 12/12 acceptance criteria results stand unchanged since nothing they depend on was modified.
- The appended round-1 `## QA Report` content in this file (lines 120–193) is byte-identical to what I originally wrote in round 1 — confirmed via direct read; no unauthorized edits to my own prior findings.

### Issues found

None. The single outstanding item from round 1 is fully resolved, and no new issue was introduced by this commit.

QA re-review passed — no remaining issues. Routing to Product Owner.
