import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { getCallerIdentityMock, getProjectAccessMock, prismaMock, triggerDesignAgentMock } = vi.hoisted(
  () => ({
    getCallerIdentityMock: vi.fn(),
    getProjectAccessMock: vi.fn(),
    prismaMock: {
      taskRun: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    },
    triggerDesignAgentMock: vi.fn(),
  }),
)

vi.mock("@/lib/project-access", () => ({
  getCallerIdentity: getCallerIdentityMock,
  getProjectAccess: getProjectAccessMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

vi.mock("@/lib/trigger", () => ({
  triggerDesignAgent: triggerDesignAgentMock,
}))

import { POST } from "./route"

function postRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/ai/design", {
    method: "POST",
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default "under the limit" stub so every pre-existing test below keeps
  // passing unmodified in behavior — spec 31's `checkAiRateLimit` runs for
  // real in these route tests (Analyst Brief, Open Questions #4), backed by
  // a mocked `prisma.taskRun.findMany` rather than a mocked helper module.
  prismaMock.taskRun.findMany.mockResolvedValue([])
})

describe("POST /api/ai/design", () => {
  it("returns 401 when unauthenticated, before parsing the body or calling Trigger.dev/Prisma", async () => {
    getCallerIdentityMock.mockResolvedValue(null)

    const response = await POST(postRequest({ prompt: "p", roomId: "r1", projectId: "r1" }))

    expect(response.status).toBe(401)
    expect(getProjectAccessMock).not.toHaveBeenCalled()
    expect(triggerDesignAgentMock).not.toHaveBeenCalled()
    expect(prismaMock.taskRun.create).not.toHaveBeenCalled()
  })

  it("returns 400 for an invalid JSON body", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(postRequest())

    expect(response.status).toBe(400)
    expect(triggerDesignAgentMock).not.toHaveBeenCalled()
  })

  it("returns 400 when prompt, roomId, or projectId is missing", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(postRequest({ prompt: "p", roomId: "r1" }))

    expect(response.status).toBe(400)
    expect(getProjectAccessMock).not.toHaveBeenCalled()
  })

  it("returns 400 when prompt is an empty/whitespace-only string", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(postRequest({ prompt: "   ", roomId: "r1", projectId: "r1" }))

    expect(response.status).toBe(400)
  })

  it("returns 400 when roomId and projectId disagree", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(postRequest({ prompt: "p", roomId: "room-a", projectId: "room-b" }))

    expect(response.status).toBe(400)
    expect(getProjectAccessMock).not.toHaveBeenCalled()
  })

  it("returns 404 when the project does not exist", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "not-found" })

    const response = await POST(postRequest({ prompt: "p", roomId: "p1", projectId: "p1" }))

    expect(response.status).toBe(404)
    expect(triggerDesignAgentMock).not.toHaveBeenCalled()
    expect(prismaMock.taskRun.create).not.toHaveBeenCalled()
  })

  it("returns 403 when the caller is neither owner nor collaborator", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "forbidden" })

    const response = await POST(postRequest({ prompt: "p", roomId: "p1", projectId: "p1" }))

    expect(response.status).toBe(403)
    expect(triggerDesignAgentMock).not.toHaveBeenCalled()
    expect(prismaMock.taskRun.create).not.toHaveBeenCalled()
  })

  it("returns 429 with a Retry-After header when the caller is rate limited, without triggering the task or writing a TaskRun row", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: true,
    })
    const now = new Date("2026-01-01T00:05:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)
    prismaMock.taskRun.findMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({ createdAt: now })),
    )

    const response = await POST(postRequest({ prompt: "p", roomId: "p1", projectId: "p1" }))

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("600")
    const body = await response.json()
    expect(body).toEqual({ error: "Too many AI requests, try again shortly" })
    expect(triggerDesignAgentMock).not.toHaveBeenCalled()
    expect(prismaMock.taskRun.create).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it("triggers the design-agent task and creates one TaskRun row for an owner or collaborator", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: false,
    })
    triggerDesignAgentMock.mockResolvedValue({ runId: "run_123" })
    prismaMock.taskRun.create.mockResolvedValue({
      id: "tr_1",
      runId: "run_123",
      projectId: "p1",
      userId: "user_1",
      createdAt: new Date(),
    })

    const response = await POST(postRequest({ prompt: "design it", roomId: "p1", projectId: "p1" }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ runId: "run_123" })
    expect(triggerDesignAgentMock).toHaveBeenCalledWith({ prompt: "design it", roomId: "p1" })
    expect(prismaMock.taskRun.create).toHaveBeenCalledWith({
      data: { runId: "run_123", projectId: "p1", userId: "user_1" },
    })
  })

  it("returns 502 and skips the Prisma write when triggering the task fails", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: true,
    })
    triggerDesignAgentMock.mockRejectedValue(new Error("trigger.dev down"))

    const response = await POST(postRequest({ prompt: "p", roomId: "p1", projectId: "p1" }))

    expect(response.status).toBe(502)
    expect(prismaMock.taskRun.create).not.toHaveBeenCalled()
  })

  it("returns 500 when recording the TaskRun fails", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: true,
    })
    triggerDesignAgentMock.mockResolvedValue({ runId: "run_123" })
    prismaMock.taskRun.create.mockRejectedValue(new Error("db down"))

    const response = await POST(postRequest({ prompt: "p", roomId: "p1", projectId: "p1" }))

    expect(response.status).toBe(500)
  })
})
