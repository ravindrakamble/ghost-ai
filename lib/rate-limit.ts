import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-response";

/**
 * Rolling window, in milliseconds, over which AI-triggering requests are
 * counted for a single user. 10 minutes.
 */
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Maximum number of `TaskRun` rows a single user may accumulate within
 * `RATE_LIMIT_WINDOW_MS` before further requests are rejected. Shared across
 * `/api/ai/design` and `/api/ai/spec` — `TaskRun` has no `type`/`taskId`
 * discriminator, so a mix of design and spec runs from the same user counts
 * toward the same limit (spec 31's Analyst Brief, acceptance criterion 2).
 */
export const RATE_LIMIT_MAX_REQUESTS = 5;

export interface RateLimitResult {
  allowed: boolean;
  /**
   * Whole seconds the caller should wait before retrying, suitable for a
   * `Retry-After` header. `0` when `allowed` is `true`; otherwise
   * `Math.ceil(...)` of the time remaining until the oldest run in the
   * current window ages out, clamped to a minimum of `1` (spec 31's Analyst
   * Brief, Open Questions #2 — a `Retry-After: 0` would be ambiguous).
   */
  retryAfterSeconds: number;
}

/**
 * Checks whether `userId` is currently under the combined design+spec AI
 * rate limit, based on existing `TaskRun` rows — no new table, no external
 * rate-limiting service (spec 31's explicit Scope Limits).
 *
 * Per-user only, never scoped by `projectId` — a user is limited the same
 * way across every project they can access (acceptance criterion 3).
 *
 * Uses a single `findMany` (ordered ascending by `createdAt`) rather than a
 * plain `count`, because a rejected response also needs the oldest
 * in-window row's timestamp to compute `retryAfterSeconds` — a `count()`
 * alone can't provide that, and a second `findFirst` call would mean two
 * round trips that could disagree with each other under concurrent writes
 * (spec 31's Analyst Brief, Open Questions #1). Still uses only the leading
 * column of the existing `[userId, projectId]` index — no schema/index
 * change required.
 *
 * Known limitation (spec 31's Analyst Brief, Open Questions #3): this is a
 * plain read-then-write check with no atomic increment or row lock, so a
 * burst of near-simultaneous requests from the same user — before their
 * earlier `TaskRun` rows exist yet — could momentarily pass this check more
 * than `RATE_LIMIT_MAX_REQUESTS` times. Accepted as a documented,
 * best-effort limitation of the count-based approach for this pass; closing
 * it would require an atomic counter or external service, which this spec's
 * Scope Limits explicitly forbid.
 */
export async function checkAiRateLimit(userId: string): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

  const recentRuns = await prisma.taskRun.findMany({
    where: { userId, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (recentRuns.length < RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const oldestRun = recentRuns[0];
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((oldestRun.createdAt.getTime() + RATE_LIMIT_WINDOW_MS - Date.now()) / 1000),
  );

  return { allowed: false, retryAfterSeconds };
}

/**
 * Standard 429 response for a rejected AI-triggering request: the same
 * `{ error }` envelope every other route error uses (`lib/api-response.ts`),
 * plus a `Retry-After` header set to `retryAfterSeconds`. Shared between
 * `/api/ai/design` and `/api/ai/spec` so the identical envelope-plus-header
 * logic isn't duplicated in both route files (spec 31's Analyst Brief, Open
 * Questions #5).
 */
export function rateLimitErrorResponse(retryAfterSeconds: number): NextResponse {
  const response = errorResponse("Too many AI requests, try again shortly", 429);
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}
