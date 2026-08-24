import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    taskRun: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  checkAiRateLimit,
  rateLimitErrorResponse,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
} from "./rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX_REQUESTS", () => {
  it("is a 10-minute window with a max of 5 requests", () => {
    expect(RATE_LIMIT_WINDOW_MS).toBe(10 * 60 * 1000);
    expect(RATE_LIMIT_MAX_REQUESTS).toBe(5);
  });
});

describe("checkAiRateLimit", () => {
  it("allows a user with no recent TaskRun rows (empty-window case)", async () => {
    prismaMock.taskRun.findMany.mockResolvedValue([]);

    const result = await checkAiRateLimit("user_1");

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("allows a user under the limit", async () => {
    prismaMock.taskRun.findMany.mockResolvedValue([
      { createdAt: new Date() },
      { createdAt: new Date() },
    ]);

    const result = await checkAiRateLimit("user_1");

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("blocks a user at exactly RATE_LIMIT_MAX_REQUESTS existing rows (boundary case)", async () => {
    const now = new Date("2026-01-01T00:05:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const oldestCreatedAt = new Date(now.getTime() - 4 * 60 * 1000);
    prismaMock.taskRun.findMany.mockResolvedValue(
      Array.from({ length: RATE_LIMIT_MAX_REQUESTS }, (_, index) => ({
        createdAt: index === 0 ? oldestCreatedAt : new Date(now.getTime() - 1000),
      })),
    );

    const result = await checkAiRateLimit("user_1");

    expect(result.allowed).toBe(false);
    // 4 minutes elapsed of a 10-minute window -> 6 minutes (360s) remain.
    expect(result.retryAfterSeconds).toBe(360);
  });

  it("blocks a user over the limit", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    prismaMock.taskRun.findMany.mockResolvedValue(
      Array.from({ length: RATE_LIMIT_MAX_REQUESTS + 3 }, () => ({ createdAt: now })),
    );

    const result = await checkAiRateLimit("user_1");

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(RATE_LIMIT_WINDOW_MS / 1000);
  });

  it("computes retryAfterSeconds from the oldest row in the window, rounded up", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    // Oldest row is 9 minutes 59.5 seconds old -> 0.5s remain -> ceil to 1.
    const oldestCreatedAt = new Date(now.getTime() - (RATE_LIMIT_WINDOW_MS - 500));
    prismaMock.taskRun.findMany.mockResolvedValue(
      Array.from({ length: RATE_LIMIT_MAX_REQUESTS }, (_, index) => ({
        createdAt: index === 0 ? oldestCreatedAt : now,
      })),
    );

    const result = await checkAiRateLimit("user_1");

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(1);
  });

  it("clamps retryAfterSeconds to a minimum of 1 even if the oldest row is already outside the window (race window)", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    // Oldest row's window has technically already elapsed (stale mock data);
    // the computed remainder would be negative/zero without clamping.
    const oldestCreatedAt = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS - 5000);
    prismaMock.taskRun.findMany.mockResolvedValue(
      Array.from({ length: RATE_LIMIT_MAX_REQUESTS }, (_, index) => ({
        createdAt: index === 0 ? oldestCreatedAt : now,
      })),
    );

    const result = await checkAiRateLimit("user_1");

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(1);
  });

  it("queries only by userId and the rolling window, ordered ascending by createdAt", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prismaMock.taskRun.findMany.mockResolvedValue([]);

    await checkAiRateLimit("user_42");

    expect(prismaMock.taskRun.findMany).toHaveBeenCalledWith({
      where: { userId: "user_42", createdAt: { gte: new Date(now.getTime() - RATE_LIMIT_WINDOW_MS) } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
  });
});

describe("rateLimitErrorResponse", () => {
  it("returns a 429 with the standard error envelope and a Retry-After header", async () => {
    const response = rateLimitErrorResponse(42);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    const body = await response.json();
    expect(body).toEqual({ error: "Too many AI requests, try again shortly" });
  });
});
