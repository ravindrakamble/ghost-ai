Add per-user rate limiting to the two routes that trigger paid AI work, so no project collaborator can spam Gemini + Trigger.dev runs.

### Implementation

1. Rate limit helper

Create `lib/rate-limit.ts`.

Export `checkAiRateLimit(userId: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>`.

It should:

- count `TaskRun` rows for that `userId` created within a rolling window (`prisma.taskRun.count({ where: { userId, createdAt: { gte: windowStart } } })`)
- compare the count against a fixed max
- return `allowed: false` with the seconds remaining until the oldest run in the window ages out when the max is met or exceeded
- return `allowed: true` otherwise

Define the window and max as named constants in this file (e.g. `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`) so they're easy to tune later. Start with 5 runs per 10-minute window per user.

The limit is per user across all their projects and covers both design and spec generation combined — `TaskRun` already records both (`app/api/ai/design/route.ts` and `app/api/ai/spec/route.ts` both write to it), so one counter query covers both endpoints with no new table.

2. Wire into `/api/ai/design`

Modify `app/api/ai/design/route.ts`.

After the existing `getProjectAccess` check and before calling `triggerDesignAgent`, call `checkAiRateLimit(identity.userId)`. If not allowed, return a 429 JSON error (`{ error: "Too many AI requests, try again shortly" }`) with a `Retry-After` header set to the returned `retryAfterSeconds`, and do not call `triggerDesignAgent` or write a `TaskRun` row.

3. Wire into `/api/ai/spec`

Modify `app/api/ai/spec/route.ts` the same way, in the same position relative to `getProjectAccess` and `triggerGenerateSpec`.

### Scope Limits

- Do not add a new external service (Redis, Upstash, etc.) — reuse the existing `TaskRun` table and Postgres.
- Do not change `prisma/schema.prisma` — no new columns or tables.
- Do not rate limit any route other than `/api/ai/design` and `/api/ai/spec`.
- Do not add a per-project limit, only per-user.
- Do not build any UI showing remaining quota or a countdown — server-side enforcement only.
- Do not change `trigger/design-agent.ts` or `trigger/generate-spec.ts`.

### Notes

- Check the rate limit after `getProjectAccess` succeeds, before the Trigger.dev call — an unauthorized or invalid request should still fail with its existing 401/400/404/403 first, and a rate-limited request should never reach the paid Gemini/Trigger.dev call.
- `TaskRun` has an index on `[userId, projectId]`; a `userId`-only count query can still use it as the leading column, so no index change is required.
- Follow the existing `errorResponse` (`lib/api-response.ts`) envelope shape for the error body; add the `Retry-After` header separately on the returned response since `errorResponse` doesn't currently support custom headers.
- Mock `prisma.taskRun.count` in route tests the same way existing tests mock `prisma.taskRun.create`.

### Check When Done

- A user who has hit the limit gets a 429 from `/api/ai/design` and from `/api/ai/spec`, with a `Retry-After` header, and no `TaskRun` row is created for that request.
- A user under the limit is unaffected — same behavior as today.
- The limit is shared between the two routes (5 combined runs per 10 minutes, not 5 each).
- TypeScript and build pass.
