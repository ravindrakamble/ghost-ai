Source spec: `context/feature-specs/31-ai-rate-limiting.md`

## Analyst Brief

### Scope statement

Add per-user rate limiting (5 combined `design`+`spec` runs per rolling 10-minute window) to `POST /api/ai/design` and `POST /api/ai/spec` only, implemented as a new `lib/rate-limit.ts` helper that counts existing `TaskRun` rows — no new external service, no schema change, no other route touched.

### Concrete deliverables

- `lib/rate-limit.ts` (new) — exports `RATE_LIMIT_WINDOW_MS` (10 * 60 * 1000), `RATE_LIMIT_MAX_REQUESTS` (5), and `checkAiRateLimit(userId: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>`.
- `lib/rate-limit.test.ts` (new) — unit tests for the helper in isolation (mocking `@/lib/prisma`'s `taskRun` methods): under-limit allowed, at/over-limit blocked, `retryAfterSeconds` computed correctly, boundary case (exactly `RATE_LIMIT_MAX_REQUESTS` existing rows), empty-window case.
- `app/api/ai/design/route.ts` (modified) — insert the rate-limit check + 429 response between the existing `getProjectAccess` success branch and the `triggerDesignAgent` call.
- `app/api/ai/design/route.test.ts` (modified) — new tests for the 429 case (status, body, `Retry-After` header, no `triggerDesignAgent`/`prisma.taskRun.create` call), plus a default "allowed" stub for `prisma.taskRun.count` so all pre-existing tests keep passing unmodified in behavior.
- `app/api/ai/spec/route.ts` (modified) — same wiring, same position relative to `getProjectAccess`/`triggerGenerateSpec`.
- `app/api/ai/spec/route.test.ts` (modified) — same additions as the design route's test file.
- No `prisma/schema.prisma`, `trigger/design-agent.ts`, or `trigger/generate-spec.ts` change — explicit Scope Limits in the raw spec text.

### Acceptance criteria

1. `checkAiRateLimit(userId)` counts `TaskRun` rows where `userId` matches and `createdAt >= windowStart` (`windowStart = now - RATE_LIMIT_WINDOW_MS`), and returns `allowed: count < RATE_LIMIT_MAX_REQUESTS` — i.e. exactly 5 runs are allowed per rolling window, the 6th is blocked (verified math: on the Nth request, the count reflects only the N-1 prior *successfully recorded* runs, since the current request's own `TaskRun` row is written after this check and only if `triggerDesignAgent`/`triggerGenerateSpec` also succeeds).
2. The limit is shared across `/api/ai/design` and `/api/ai/spec` — one counter per `userId`, with no `type`/`taskId` discriminator on the query (the `TaskRun` model has none, and none is being added), so a mix of design and spec runs from the same user counts toward the same 5.
3. The limit is per-`userId` only, never scoped by `projectId` — a user is limited the same way across every project they can access.
4. When not allowed, `retryAfterSeconds` reflects the time remaining until the oldest run inside the current window ages out of it (i.e. roughly `oldestRun.createdAt + RATE_LIMIT_WINDOW_MS - now`, in whole seconds, rounded up, clamped to a minimum of 1 — see Open Questions #1 for the exact recommended computation). When allowed, `retryAfterSeconds` is `0`.
5. `POST /api/ai/design`: the rate-limit check runs strictly after `getProjectAccess` succeeds and strictly before `triggerDesignAgent` is called. On `allowed: false`, the route returns HTTP 429 with body `{ "error": "Too many AI requests, try again shortly" }` (via `lib/api-response.ts`'s `errorResponse`) and a `Retry-After` header set to `retryAfterSeconds` (as a string). `triggerDesignAgent` is not called and no `TaskRun` row is written for that request.
6. `POST /api/ai/spec` behaves identically to #5, in the same position relative to `getProjectAccess`/`triggerGenerateSpec`.
7. Existing failure precedence is preserved and the rate-limit check slots in at exactly one point: 401 unauthenticated → 400 malformed/inconsistent body → 404/403 via `getProjectAccess` → **429 rate limited** → 502 upstream Trigger.dev failure → 500 Prisma write failure. An unauthorized, malformed, or forbidden request must never surface as 429 — the earlier checks always run first and short-circuit before the rate limit is ever evaluated.
8. A user under the limit sees no behavior change at all versus today — same request/response shape, same status codes, same `TaskRun` write, for both routes.
9. No route other than `/api/ai/design` and `/api/ai/spec` is touched or gains rate limiting.
10. No change to `prisma/schema.prisma`, `trigger/design-agent.ts`, or `trigger/generate-spec.ts`.
11. No UI change anywhere — no quota display, no countdown, no client-side awareness of the limit beyond whatever the existing generic error-handling path in each caller already does with a non-2xx response.
12. `npx tsc --noEmit`, `npx eslint .` (scoped to changed files, consistent with prior specs' mechanical gate), `npx vitest run`, and `npx next build` all pass.

### Dependencies

- **`TaskRun` model** (spec 22, `prisma/schema.prisma`) — `id`, `runId`, `projectId`, `userId`, `createdAt`, indexed on `[userId, projectId]`. **Complete.** The spec's own Notes section confirms a `userId`-only count query can still use `[userId, projectId]`'s leading column, so no index migration is needed — consistent with the Scope Limit against schema changes.
- **`POST /api/ai/design`** (spec 22) and **`POST /api/ai/spec`** (spec 27) — both already write exactly one `TaskRun` row per successfully-triggered run, which is what makes counting existing rows a valid proxy for "runs in the last N minutes" with no new table. **Complete.**
- **`getProjectAccess`/`getCallerIdentity`** (`lib/project-access.ts`) and **`errorResponse`** (`lib/api-response.ts`) — both routes' existing auth/access/error-envelope machinery, unmodified and reused as-is. **Complete.**
- **`lib/trigger.ts`**'s `triggerDesignAgent`/`triggerGenerateSpec` — unmodified; the rate-limit check is inserted before these calls, not inside them. **Complete.**

All dependencies are already implemented per `progress-tracker.md`'s Completed section; this spec has no blocking prerequisite.

### Open questions

1. **How should `retryAfterSeconds` actually be computed, given the raw spec's own pseudocode only shows `prisma.taskRun.count(...)`?** A pure count query returns a number, not a timestamp — but the return contract requires "the seconds remaining until the oldest run in the window ages out," which needs the oldest matching row's `createdAt`. The spec text names the count query as *the* mechanism but doesn't reconcile this with the timing requirement.
   **Recommendation:** replace the plain `count()` with a single `prisma.taskRun.findMany({ where: { userId, createdAt: { gte: windowStart } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } })`. Derive `allowed` from `results.length < RATE_LIMIT_MAX_REQUESTS`, and when not allowed, `retryAfterSeconds = Math.max(1, Math.ceil((results[0].createdAt.getTime() + RATE_LIMIT_WINDOW_MS - Date.now()) / 1000))`. One round trip instead of two separate queries (a `count` plus a second `findFirst` for the oldest row), and avoids a race between two calls disagreeing with each other. Still uses only the existing `[userId, projectId]` index's leading column, same as a plain count would.

2. **Rounding/clamping of `retryAfterSeconds`.** Not specified by the raw spec text.
   **Recommendation:** `Math.ceil(...)` (round up, so the client never retries a fraction of a second too early), clamped to a minimum of `1` when `allowed: false` (so `Retry-After: 0`, which is ambiguous/effectively meaningless as an HTTP header value, is never sent for a genuinely rate-limited response). `0` exactly when `allowed: true`.

3. **Concurrent/burst requests from the same user.** Because this is a plain read-then-write count check with no atomic increment or row lock, a user firing several requests near-simultaneously (before earlier ones' `TaskRun` rows exist) could momentarily have more than 5 in flight past the check. The raw spec's own Scope Limits explicitly forbid a new external service (Redis/Upstash) or schema change that would be needed to close this race properly (e.g. an atomic counter).
   **Recommendation:** accept this as a known, documented best-effort limitation of the count-based approach — not something to work around in this pass (doing so would mean violating an explicit Scope Limit). Should be recorded as a disclosed limitation in Dev Notes, not silently left undocumented.

4. **Should route-level tests mock `@/lib/rate-limit` directly, or mock `prisma.taskRun.count`/`findMany` and let the real `checkAiRateLimit` run?** The raw spec's Notes section says "Mock `prisma.taskRun.count` in route tests the same way existing tests mock `prisma.taskRun.create`" — implying the real helper runs in route tests, backed by a mocked Prisma call, rather than mocking the helper module itself.
   **Recommendation:** follow the spec text literally — route tests mock `@/lib/prisma`'s `taskRun.count`/`taskRun.findMany` (whichever the Open Questions #1 implementation ends up using) and `taskRun.create`, and do not mock `@/lib/rate-limit` at all. This keeps the route tests exercising the real integration between the route and the real helper, consistent with how `trigger/generate-spec.ts`'s real Zod schemas are already left unmocked in `app/api/ai/spec/route.test.ts` for the same "exercise the real thing" reason.

5. **Should a shared response-building helper (e.g. `rateLimitErrorResponse(retryAfterSeconds)`) live in `lib/rate-limit.ts` to avoid duplicating the identical 429-envelope-plus-header logic in both route files?** Not mandated by the raw spec text, which just says "wire into `/api/ai/design`" and "modify `app/api/ai/spec/route.ts` the same way" as two separate steps.
   **Recommendation:** a small shared helper is reasonable given `code-standards.md`'s "fix root causes — do not layer workarounds" and the fact the exact same three lines (status, body, header) would otherwise be copy-pasted into two files — but this is a minor style choice, not a correctness requirement. Leave the final call to the Senior Developer; either a shared helper in `lib/rate-limit.ts` or two identical inline blocks satisfies every acceptance criterion above.

If any of the above resolve differently than recommended, that should be recorded explicitly in Dev Notes rather than left implicit.

### Out-of-scope callouts

- **Redis, Upstash, or any other external rate-limiting service** — explicit Scope Limit in the raw spec text; `lib/rate-limit.ts` must use only the existing `TaskRun` table via Prisma.
- **Any `prisma/schema.prisma` change** (new columns, new table, new index) — explicit Scope Limit; the existing `[userId, projectId]` index is sufficient for a `userId`-only query.
- **Rate limiting any route other than `/api/ai/design` and `/api/ai/spec`** — explicit Scope Limit. No other `app/api/**` route is touched.
- **A per-project limit, or any limit dimension other than per-user** — explicit Scope Limit.
- **Any UI surfacing remaining quota, a countdown, or a rate-limit-specific toast/banner** — explicit Scope Limit; server-side enforcement only, and per `ai-workflow-rules.md` this pipeline doesn't invent UI the spec never asked for.
- **Any change to `trigger/design-agent.ts` or `trigger/generate-spec.ts`** — explicit Scope Limit; the check happens entirely in the route handler, before the task is ever triggered.
- **Fixing the concurrent-burst race window described in Open Questions #3** via locking, atomic increments, or an external service — would require exactly the kind of new infrastructure the Scope Limits forbid; documented as a known limitation instead.
- **Billing/subscriptions, enterprise permission tiers, versioned spec history/review workflows, production object storage migration, mobile apps** — `project-overview.md`'s Out of Scope wall; none of this spec's work touches any of them.

Brief ready for Senior Developer at `context/spec-status/31-ai-rate-limiting.md`.

## Dev Notes

### Files added/changed

- `lib/rate-limit.ts` (new) — `RATE_LIMIT_WINDOW_MS` (10 min), `RATE_LIMIT_MAX_REQUESTS` (5), `RateLimitResult` interface, `checkAiRateLimit(userId)`, and `rateLimitErrorResponse(retryAfterSeconds)`. The helper runs a single `prisma.taskRun.findMany({ where: { userId, createdAt: { gte: windowStart } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } })` per the brief's Open Questions #1 recommendation, deriving `allowed` from `recentRuns.length < RATE_LIMIT_MAX_REQUESTS` and, when blocked, `retryAfterSeconds` from the oldest row's `createdAt` (`Math.ceil`, clamped to a minimum of `1`).
- `lib/rate-limit.test.ts` (new) — unit tests for `checkAiRateLimit` (empty window, under limit, exact boundary at `RATE_LIMIT_MAX_REQUESTS`, over limit, rounding-up of a sub-second remainder, clamping to `1` for an already-expired oldest row, and the exact `findMany` call shape) and for `rateLimitErrorResponse` (status, header, body). Mocks `@/lib/prisma`'s `taskRun.findMany` directly; `@/lib/rate-limit` itself is never mocked anywhere in this diff.
- `app/api/ai/design/route.ts` (modified) — `checkAiRateLimit(identity.userId)` called immediately after the `getProjectAccess` success branch and before `triggerDesignAgent`; on `allowed: false`, returns `rateLimitErrorResponse(rateLimit.retryAfterSeconds)` (429 + `Retry-After` header) without calling `triggerDesignAgent` or `prisma.taskRun.create`. Docblock's failure-precedence comment updated to insert "429 rate limited" between 404/403 and 502.
- `app/api/ai/design/route.test.ts` (modified) — added a default `prismaMock.taskRun.findMany.mockResolvedValue([])` ("under the limit") stub in `beforeEach` so every pre-existing test keeps passing unmodified in behavior, plus a new test asserting the 429 status, `Retry-After` header value, error body, and that neither `triggerDesignAgent` nor `prisma.taskRun.create` is called when the limit is hit.
- `app/api/ai/spec/route.ts` (modified) — identical wiring, same position relative to `getProjectAccess`/`triggerGenerateSpec`, same docblock update.
- `app/api/ai/spec/route.test.ts` (modified) — identical additions to the design route's test file.
- No `prisma/schema.prisma`, `trigger/design-agent.ts`, or `trigger/generate-spec.ts` touched, per the brief's Scope Limits.

### Skills used

- None of the installed `.claude/skills/` entries applied directly — this is a plain Prisma `findMany` query following the exact pattern already established by `lib/project-access.ts`'s `prisma.project.findUnique` usage, and no Trigger.dev task/agent code, Clerk code, or Liveblocks code was touched. Checked `.claude/skills/` first per the standing instruction; `prisma-client-api` was considered but not needed since the query shape was already fully specified by the brief's Open Questions #1 and matches existing codebase conventions.

### Key decisions (where the brief left a recommendation rather than a firm answer)

1. **Open Questions #1 (count vs. findMany)** — followed the brief's recommendation literally: a single `findMany` ordered ascending by `createdAt`, not a `count()` plus a second lookup.
2. **Open Questions #2 (rounding/clamping)** — followed the brief's recommendation: `Math.ceil(...)`, clamped to a minimum of `1` when `allowed: false`; exactly `0` when `allowed: true`.
3. **Open Questions #3 (concurrent-burst race window)** — accepted as a documented, deliberate limitation, not worked around. Recorded directly in `lib/rate-limit.ts`'s own docblock (not just here) so it stays visible to anyone reading the helper later, per the brief's instruction that this be "recorded as a disclosed limitation in Dev Notes, not silently left undocumented." No locking, atomic increment, or external service was added — would have crossed the brief's explicit Scope Limits.
4. **Open Questions #4 (test mocking strategy)** — followed the brief literally: route tests mock `@/lib/prisma`'s `taskRun.findMany`/`taskRun.create` and never mock `@/lib/rate-limit`, so the real `checkAiRateLimit` runs inside every route test, including the new 429 tests.
5. **Open Questions #5 (shared response helper)** — added `rateLimitErrorResponse(retryAfterSeconds)` to `lib/rate-limit.ts` rather than duplicating the three-line status/body/header block in both route files, per `code-standards.md`'s "fix root causes — do not layer workarounds." It builds on the existing `errorResponse` (`lib/api-response.ts`) for the body/status and adds the `Retry-After` header separately, exactly as the raw spec's Notes section describes.

### Test coverage added

- `lib/rate-limit.test.ts`: 9 new tests covering the constants, the empty-window/under-limit/boundary/over-limit/rounding/clamping cases for `checkAiRateLimit`, the exact Prisma call shape, and `rateLimitErrorResponse`'s status/header/body.
- `app/api/ai/design/route.test.ts`: 1 new test (429 status, `Retry-After: "600"` header, error body, `triggerDesignAgent`/`prisma.taskRun.create` not called) plus the default rate-limit-allowed stub applied to every existing test.
- `app/api/ai/spec/route.test.ts`: identical addition.

### Commands run (all pass)

- `npx tsc --noEmit` — clean, no errors.
- `npx eslint lib/rate-limit.ts lib/rate-limit.test.ts app/api/ai/design/route.ts app/api/ai/design/route.test.ts app/api/ai/spec/route.ts app/api/ai/spec/route.test.ts` — clean, no warnings or errors.
- `npx vitest run --no-file-parallelism` — 643/644 tests passing across 66 files (66 total test files; `progress-tracker.md`'s most recent prior count from the "Bugfix: Maximum update depth exceeded" entry was 619 tests, before this branch's own new `lib/rate-limit.test.ts` (9 tests) and the 2 new route tests, plus whatever pre-existing uncommitted work this session already had staged for the next spec). The 1 failure — `components/editor/ai-sidebar.test.tsx`'s "switches to the Specs tab content on click" — is a pre-existing jsdom `Not implemented: navigation to another Document` timing flake, confirmed unrelated to this diff: `ai-sidebar.tsx`/`ai-sidebar.test.tsx` are not touched anywhere in this change, and re-running that single file in isolation (`npx vitest run components/editor/ai-sidebar.test.tsx --no-file-parallelism`) passes 13/13 cleanly.
- `npx next build` — succeeds; `/api/ai/design` and `/api/ai/spec` both still compile as dynamic routes, no new route added, no build error.

### Known limitations / deliberate deferrals

- The concurrent-burst race window from Open Questions #3 is real and undisclosed-fixed: a user firing several requests within milliseconds of each other, before any of their prior `TaskRun` rows are written, could momentarily exceed `RATE_LIMIT_MAX_REQUESTS` past this check. This is accepted per the brief as an explicit tradeoff of the no-new-infrastructure constraint, not a bug to route back on.
- No UI surfaces the limit, remaining quota, or a countdown anywhere — server-side enforcement only, per the brief's explicit Scope Limit.

Implementation ready for QA at `context/spec-status/31-ai-rate-limiting.md`.
