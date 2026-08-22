import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { getCallerIdentityMock, prismaMock, createRunTokenMock } = vi.hoisted(() => ({
  getCallerIdentityMock: vi.fn(),
  prismaMock: {
    taskRun: {
      findUnique: vi.fn(),
    },
  },
  createRunTokenMock: vi.fn(),
}))

vi.mock("@/lib/project-access", () => ({
  getCallerIdentity: getCallerIdentityMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

vi.mock("@/lib/trigger", () => ({
  createRunToken: createRunTokenMock,
}))

import { POST } from "./route"

function postRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/ai/spec/token", {
    method: "POST",
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/ai/spec/token", () => {
  it("returns 401 when unauthenticated, before touching the body, Prisma, or Trigger.dev", async () => {
    getCallerIdentityMock.mockResolvedValue(null)

    const response = await POST(postRequest({ runId: "run_123" }))

    expect(response.status).toBe(401)
    expect(prismaMock.taskRun.findUnique).not.toHaveBeenCalled()
    expect(createRunTokenMock).not.toHaveBeenCalled()
  })

  it("returns 400 for an invalid JSON body", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(postRequest())

    expect(response.status).toBe(400)
    expect(prismaMock.taskRun.findUnique).not.toHaveBeenCalled()
  })

  it("returns 400 when runId is missing or not a string", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(postRequest({ runId: 123 }))

    expect(response.status).toBe(400)
    expect(prismaMock.taskRun.findUnique).not.toHaveBeenCalled()
  })

  it("returns 404 when the runId does not match any TaskRun", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.taskRun.findUnique.mockResolvedValue(null)

    const response = await POST(postRequest({ runId: "run_unknown" }))

    expect(response.status).toBe(404)
    expect(createRunTokenMock).not.toHaveBeenCalled()
  })

  it("returns 403 when the run belongs to a different caller", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.taskRun.findUnique.mockResolvedValue({
      id: "tr_1",
      runId: "run_123",
      projectId: "p1",
      userId: "someone_else",
      createdAt: new Date(),
    })

    const response = await POST(postRequest({ runId: "run_123" }))

    expect(response.status).toBe(403)
    expect(createRunTokenMock).not.toHaveBeenCalled()
  })

  it("issues a run-scoped token for the run's owner", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.taskRun.findUnique.mockResolvedValue({
      id: "tr_1",
      runId: "run_123",
      projectId: "p1",
      userId: "user_1",
      createdAt: new Date(),
    })
    createRunTokenMock.mockResolvedValue("pk_run_scoped_token")

    const response = await POST(postRequest({ runId: "run_123" }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ token: "pk_run_scoped_token" })
    expect(createRunTokenMock).toHaveBeenCalledWith("run_123")
  })

  it("returns 502 when issuing the token fails upstream", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.taskRun.findUnique.mockResolvedValue({
      id: "tr_1",
      runId: "run_123",
      projectId: "p1",
      userId: "user_1",
      createdAt: new Date(),
    })
    createRunTokenMock.mockRejectedValue(new Error("trigger.dev down"))

    const response = await POST(postRequest({ runId: "run_123" }))

    expect(response.status).toBe(502)
  })
})
