import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { getProjectAccessMock, prismaMock, uploadCanvasSnapshotMock, fetchCanvasSnapshotMock } = vi.hoisted(
  () => ({
    getProjectAccessMock: vi.fn(),
    prismaMock: {
      project: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
    uploadCanvasSnapshotMock: vi.fn(),
    fetchCanvasSnapshotMock: vi.fn(),
  }),
)

vi.mock("@/lib/project-access", () => ({
  getProjectAccess: getProjectAccessMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

vi.mock("@/lib/canvas-blob", () => ({
  uploadCanvasSnapshot: uploadCanvasSnapshotMock,
  fetchCanvasSnapshot: fetchCanvasSnapshotMock,
}))

import { GET, PUT } from "./route"

function ctx(projectId = "p1") {
  return { params: Promise.resolve({ projectId }) }
}

function putRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/projects/p1/canvas", {
    method: "PUT",
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  })
}

function getRequest() {
  return new NextRequest("http://localhost/api/projects/p1/canvas")
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PUT /api/projects/[projectId]/canvas", () => {
  it("returns 401 when unauthenticated", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "unauthenticated" })

    const response = await PUT(putRequest({ nodes: [], edges: [] }), ctx())

    expect(response.status).toBe(401)
    expect(uploadCanvasSnapshotMock).not.toHaveBeenCalled()
  })

  it("returns 404 when the project does not exist", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "not-found" })

    const response = await PUT(putRequest({ nodes: [], edges: [] }), ctx())

    expect(response.status).toBe(404)
    expect(uploadCanvasSnapshotMock).not.toHaveBeenCalled()
  })

  it("returns 403 when the caller is neither owner nor collaborator", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "forbidden" })

    const response = await PUT(putRequest({ nodes: [], edges: [] }), ctx())

    expect(response.status).toBe(403)
    expect(uploadCanvasSnapshotMock).not.toHaveBeenCalled()
  })

  it("returns 400 for an invalid JSON body", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: true,
    })

    const response = await PUT(putRequest(), ctx())

    expect(response.status).toBe(400)
    expect(uploadCanvasSnapshotMock).not.toHaveBeenCalled()
  })

  it("returns 400 when nodes/edges are missing or not arrays", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: true,
    })

    const response = await PUT(putRequest({ nodes: "not-an-array", edges: [] }), ctx())

    expect(response.status).toBe(400)
    expect(uploadCanvasSnapshotMock).not.toHaveBeenCalled()
  })

  it("uploads the snapshot and updates canvasJsonPath for a collaborator (not just the owner)", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: false,
    })
    uploadCanvasSnapshotMock.mockResolvedValue("https://blob.example/canvas/p1.json")
    prismaMock.project.update.mockResolvedValue({
      id: "p1",
      canvasJsonPath: "https://blob.example/canvas/p1.json",
    })

    const nodes = [{ id: "n1" }]
    const edges = [{ id: "e1" }]

    const response = await PUT(putRequest({ nodes, edges }), ctx())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ canvasJsonPath: "https://blob.example/canvas/p1.json" })
    expect(uploadCanvasSnapshotMock).toHaveBeenCalledWith("p1", { nodes, edges })
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { canvasJsonPath: "https://blob.example/canvas/p1.json" },
    })
  })

  it("returns 500 and skips the Prisma update when the Blob upload fails", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: true,
    })
    uploadCanvasSnapshotMock.mockRejectedValue(new Error("blob down"))

    const response = await PUT(putRequest({ nodes: [], edges: [] }), ctx())

    expect(response.status).toBe(500)
    expect(prismaMock.project.update).not.toHaveBeenCalled()
  })
})

describe("GET /api/projects/[projectId]/canvas", () => {
  it("returns 401 when unauthenticated", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "unauthenticated" })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(401)
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled()
  })

  it("returns 404 when the project does not exist", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "not-found" })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(404)
  })

  it("returns 403 when the caller is neither owner nor collaborator", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "forbidden" })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(403)
  })

  it("returns 404 when the project has no saved canvas yet", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: true,
    })
    prismaMock.project.findUnique.mockResolvedValue({ canvasJsonPath: null })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(404)
    expect(fetchCanvasSnapshotMock).not.toHaveBeenCalled()
  })

  it("returns 404 when the referenced blob is missing or corrupt", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: true,
    })
    prismaMock.project.findUnique.mockResolvedValue({
      canvasJsonPath: "https://blob.example/canvas/p1.json",
    })
    fetchCanvasSnapshotMock.mockResolvedValue(null)

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(404)
  })

  it("returns the canvas snapshot JSON body (never the raw blob URL) for an owner or collaborator", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: false,
    })
    prismaMock.project.findUnique.mockResolvedValue({
      canvasJsonPath: "https://blob.example/canvas/p1.json",
    })
    const snapshot = { nodes: [{ id: "n1" }], edges: [] }
    fetchCanvasSnapshotMock.mockResolvedValue(snapshot)

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual(snapshot)
    expect(JSON.stringify(body)).not.toContain("blob.example")
    expect(fetchCanvasSnapshotMock).toHaveBeenCalledWith("https://blob.example/canvas/p1.json")
  })

  it("returns 500 when fetching from Blob throws", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: true,
    })
    prismaMock.project.findUnique.mockResolvedValue({
      canvasJsonPath: "https://blob.example/canvas/p1.json",
    })
    fetchCanvasSnapshotMock.mockRejectedValue(new Error("network down"))

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(500)
  })
})
