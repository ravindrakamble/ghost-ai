import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { getCallerIdentityMock, getProjectAccessMock, prismaMock, triggerGenerateSpecMock } = vi.hoisted(
  () => ({
    getCallerIdentityMock: vi.fn(),
    getProjectAccessMock: vi.fn(),
    prismaMock: {
      taskRun: {
        create: vi.fn(),
      },
    },
    triggerGenerateSpecMock: vi.fn(),
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
  triggerGenerateSpec: triggerGenerateSpecMock,
}))

// `trigger/generate-spec.ts` is intentionally left unmocked here — this
// route imports its real, exported `GenerateSpecGraphNodeSchema`/
// `GenerateSpecGraphEdgeSchema` Zod objects for its own body validation (a
// single source of truth shared with the task's own payload contract, per
// `code-standards.md`'s "fix root causes — do not layer workarounds"), so
// the route's validation behavior below is genuinely exercised against the
// real schemas, not a re-implemented stub. Loading that module at import
// time is safe with no `TRIGGER_SECRET_KEY`/`GEMINI_API_KEY` set — same
// "lazy, only reads env vars when actually called" posture already proven
// safe for `lib/trigger.ts`/`trigger/design-agent.ts` (`next build`'s
// page-data collection already exercises this in production).
import { POST } from "./route"

function postRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/ai/spec", {
    method: "POST",
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  })
}

const VALID_BODY = {
  roomId: "room-1",
  chatHistory: [{ id: "m1", sender: "Alice", role: "user", content: "hi", timestamp: 1 }],
  nodes: [{ id: "n1", label: "API", shape: "rectangle", x: 0, y: 0 }],
  edges: [{ id: "e1", sourceNodeId: "n1", targetNodeId: "n1" }],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/ai/spec", () => {
  it("returns 401 when unauthenticated, before parsing the body or calling Trigger.dev/Prisma", async () => {
    getCallerIdentityMock.mockResolvedValue(null)

    const response = await POST(postRequest(VALID_BODY))

    expect(response.status).toBe(401)
    expect(getProjectAccessMock).not.toHaveBeenCalled()
    expect(triggerGenerateSpecMock).not.toHaveBeenCalled()
    expect(prismaMock.taskRun.create).not.toHaveBeenCalled()
  })

  it("returns 400 for an invalid JSON body", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(postRequest())

    expect(response.status).toBe(400)
    expect(triggerGenerateSpecMock).not.toHaveBeenCalled()
  })

  it("returns 400 when roomId is missing", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const { chatHistory, nodes, edges } = VALID_BODY
    const response = await POST(postRequest({ chatHistory, nodes, edges }))

    expect(response.status).toBe(400)
    expect(getProjectAccessMock).not.toHaveBeenCalled()
  })

  it("returns 400 when a client-supplied projectId is present but roomId is missing", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const { chatHistory, nodes, edges } = VALID_BODY
    const response = await POST(postRequest({ chatHistory, nodes, edges, projectId: "some-other-id" }))

    expect(response.status).toBe(400)
    expect(getProjectAccessMock).not.toHaveBeenCalled()
  })

  it("returns 400 when nodes is not an array", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(postRequest({ ...VALID_BODY, nodes: "not-an-array" }))

    expect(response.status).toBe(400)
    expect(getProjectAccessMock).not.toHaveBeenCalled()
  })

  it("returns 400 when edges is not an array", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(postRequest({ ...VALID_BODY, edges: "not-an-array" }))

    expect(response.status).toBe(400)
    expect(getProjectAccessMock).not.toHaveBeenCalled()
  })

  it("returns 400 when a chatHistory entry is wrong-shaped", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(postRequest({ ...VALID_BODY, chatHistory: [{ id: "m1" }] }))

    expect(response.status).toBe(400)
    expect(getProjectAccessMock).not.toHaveBeenCalled()
  })

  it("returns 400 when a node is missing required fields", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(
      postRequest({ ...VALID_BODY, nodes: [{ id: "n1", label: "API" }] }),
    )

    expect(response.status).toBe(400)
    expect(getProjectAccessMock).not.toHaveBeenCalled()
  })

  it("accepts an empty nodes/edges/chatHistory graph", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({ ok: true, project: { id: "p1", name: "P" }, isOwner: true })
    triggerGenerateSpecMock.mockResolvedValue({ runId: "run_789" })
    prismaMock.taskRun.create.mockResolvedValue({
      id: "tr_1",
      runId: "run_789",
      projectId: "p1",
      userId: "user_1",
      createdAt: new Date(),
    })

    const response = await POST(
      postRequest({ roomId: "p1", chatHistory: [], nodes: [], edges: [] }),
    )

    expect(response.status).toBe(200)
    expect(triggerGenerateSpecMock).toHaveBeenCalledWith({
      projectId: "p1",
      roomId: "p1",
      chatHistory: [],
      nodes: [],
      edges: [],
    })
  })

  it("returns 404 when the project does not exist", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "not-found" })

    const response = await POST(postRequest({ ...VALID_BODY, roomId: "p1" }))

    expect(response.status).toBe(404)
    expect(triggerGenerateSpecMock).not.toHaveBeenCalled()
    expect(prismaMock.taskRun.create).not.toHaveBeenCalled()
  })

  it("returns 403 when the caller is neither owner nor collaborator", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "forbidden" })

    const response = await POST(postRequest({ ...VALID_BODY, roomId: "p1" }))

    expect(response.status).toBe(403)
    expect(triggerGenerateSpecMock).not.toHaveBeenCalled()
    expect(prismaMock.taskRun.create).not.toHaveBeenCalled()
  })

  it("derives both project access and the triggered task's projectId from roomId only, never a client-supplied projectId", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({ ok: true, project: { id: "p1", name: "P" }, isOwner: false })
    triggerGenerateSpecMock.mockResolvedValue({ runId: "run_123" })
    prismaMock.taskRun.create.mockResolvedValue({
      id: "tr_1",
      runId: "run_123",
      projectId: "p1",
      userId: "user_1",
      createdAt: new Date(),
    })

    // A client-attempted `projectId` in the body is not part of the accepted
    // schema and is silently ignored (`.safeParse` strips unknown keys by
    // default) — the route never reads it.
    const response = await POST(
      postRequest({ ...VALID_BODY, roomId: "p1", projectId: "attacker-controlled-id" }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ runId: "run_123" })
    expect(getProjectAccessMock).toHaveBeenCalledWith("p1")
    expect(triggerGenerateSpecMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1", roomId: "p1" }),
    )
    expect(prismaMock.taskRun.create).toHaveBeenCalledWith({
      data: { runId: "run_123", projectId: "p1", userId: "user_1" },
    })
  })

  it("triggers the generate-spec task and creates one TaskRun row for an owner or collaborator", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({ ok: true, project: { id: "p1", name: "P" }, isOwner: true })
    triggerGenerateSpecMock.mockResolvedValue({ runId: "run_456" })
    prismaMock.taskRun.create.mockResolvedValue({
      id: "tr_2",
      runId: "run_456",
      projectId: "p1",
      userId: "user_1",
      createdAt: new Date(),
    })

    const response = await POST(postRequest({ ...VALID_BODY, roomId: "p1" }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ runId: "run_456" })
    expect(triggerGenerateSpecMock).toHaveBeenCalledWith({
      projectId: "p1",
      roomId: "p1",
      chatHistory: VALID_BODY.chatHistory,
      nodes: VALID_BODY.nodes,
      edges: VALID_BODY.edges,
    })
    expect(prismaMock.taskRun.create).toHaveBeenCalledWith({
      data: { runId: "run_456", projectId: "p1", userId: "user_1" },
    })
  })

  it("returns 502 and skips the Prisma write when triggering the task fails", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({ ok: true, project: { id: "p1", name: "P" }, isOwner: true })
    triggerGenerateSpecMock.mockRejectedValue(new Error("trigger.dev down"))

    const response = await POST(postRequest({ ...VALID_BODY, roomId: "p1" }))

    expect(response.status).toBe(502)
    expect(prismaMock.taskRun.create).not.toHaveBeenCalled()
  })

  it("returns 500 when recording the TaskRun fails", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    getProjectAccessMock.mockResolvedValue({ ok: true, project: { id: "p1", name: "P" }, isOwner: true })
    triggerGenerateSpecMock.mockResolvedValue({ runId: "run_789" })
    prismaMock.taskRun.create.mockRejectedValue(new Error("db down"))

    const response = await POST(postRequest({ ...VALID_BODY, roomId: "p1" }))

    expect(response.status).toBe(500)
  })
})
