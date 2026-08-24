import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { getCallerIdentityMock, prismaMock, uploadTemplateJsonMock } = vi.hoisted(() => ({
  getCallerIdentityMock: vi.fn(),
  prismaMock: {
    customTemplate: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  uploadTemplateJsonMock: vi.fn(),
}))

vi.mock("@/lib/project-access", () => ({
  getCallerIdentity: getCallerIdentityMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

vi.mock("@/lib/template-blob", () => ({
  uploadTemplateJson: uploadTemplateJsonMock,
}))

import { GET, POST } from "./route"

function postRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/templates", {
    method: "POST",
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  })
}

const validNode = {
  id: "n1",
  type: "canvasNode",
  position: { x: 0, y: 0 },
  width: 160,
  height: 80,
  data: { label: "Service", color: "#1F1F1F", textColor: "#EDEDED", shape: "rectangle" },
}

const validEdge = {
  id: "e1",
  type: "canvasEdge",
  source: "n1",
  target: "n1",
  data: { label: "calls" },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/templates", () => {
  it("returns 401 when unauthenticated, before touching Prisma", async () => {
    getCallerIdentityMock.mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(401)
    expect(prismaMock.customTemplate.findMany).not.toHaveBeenCalled()
  })

  it("lists only the caller's own templates, newest first, as metadata only — never filePath", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    const createdAt = new Date("2026-01-01T00:00:00Z")
    prismaMock.customTemplate.findMany.mockResolvedValue([
      { id: "t1", name: "My template", description: null, createdAt },
    ])

    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      templates: [{ id: "t1", name: "My template", description: null, createdAt: createdAt.toISOString() }],
    })
    expect(JSON.stringify(body)).not.toContain("blob")
    expect(prismaMock.customTemplate.findMany).toHaveBeenCalledWith({
      where: { ownerId: "user_1" },
      select: { id: true, name: true, description: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    })
  })
})

describe("POST /api/templates", () => {
  it("returns 401 when unauthenticated, before parsing the body", async () => {
    getCallerIdentityMock.mockResolvedValue(null)

    const response = await POST(postRequest({ name: "My template", nodes: [], edges: [] }))

    expect(response.status).toBe(401)
    expect(prismaMock.customTemplate.create).not.toHaveBeenCalled()
  })

  it("returns 400 for an invalid JSON body", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(postRequest())

    expect(response.status).toBe(400)
    expect(prismaMock.customTemplate.create).not.toHaveBeenCalled()
  })

  it("returns 400 when name is missing/empty", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(postRequest({ name: "   ", nodes: [], edges: [] }))

    expect(response.status).toBe(400)
    expect(prismaMock.customTemplate.create).not.toHaveBeenCalled()
  })

  it("returns 400 when a node is missing required color/textColor/shape fidelity fields", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })

    const response = await POST(
      postRequest({
        name: "My template",
        nodes: [{ id: "n1", type: "canvasNode", position: { x: 0, y: 0 }, data: { label: "x" } }],
        edges: [],
      }),
    )

    expect(response.status).toBe(400)
    expect(uploadTemplateJsonMock).not.toHaveBeenCalled()
  })

  it("uploads to Blob and creates a CustomTemplate row scoped to the caller", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    const createdAt = new Date("2026-01-01T00:00:00Z")
    prismaMock.customTemplate.create.mockResolvedValue({
      id: "t1",
      ownerId: "user_1",
      name: "My template",
      description: "desc",
      filePath: "",
      createdAt,
    })
    uploadTemplateJsonMock.mockResolvedValue("https://blob.example/templates/user_1/t1.json")
    prismaMock.customTemplate.update.mockResolvedValue({
      id: "t1",
      name: "My template",
      description: "desc",
      createdAt,
    })

    const response = await POST(
      postRequest({ name: "  My template  ", description: "  desc  ", nodes: [validNode], edges: [validEdge] }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      template: { id: "t1", name: "My template", description: "desc", createdAt: createdAt.toISOString() },
    })

    expect(prismaMock.customTemplate.create).toHaveBeenCalledWith({
      data: { ownerId: "user_1", name: "My template", description: "desc", filePath: "" },
    })
    expect(uploadTemplateJsonMock).toHaveBeenCalledWith("user_1", "t1", {
      nodes: [validNode],
      edges: [validEdge],
    })
    expect(prismaMock.customTemplate.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { filePath: "https://blob.example/templates/user_1/t1.json" },
      select: { id: true, name: true, description: true, createdAt: true },
    })
  })

  it("stores a null description when none is given", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.customTemplate.create.mockResolvedValue({
      id: "t1",
      ownerId: "user_1",
      name: "My template",
      description: null,
      filePath: "",
      createdAt: new Date(),
    })
    uploadTemplateJsonMock.mockResolvedValue("https://blob.example/templates/user_1/t1.json")
    prismaMock.customTemplate.update.mockResolvedValue({
      id: "t1",
      name: "My template",
      description: null,
      createdAt: new Date(),
    })

    await POST(postRequest({ name: "My template", nodes: [], edges: [] }))

    expect(prismaMock.customTemplate.create).toHaveBeenCalledWith({
      data: { ownerId: "user_1", name: "My template", description: null, filePath: "" },
    })
  })

  it("cleans up the placeholder row and returns 500 when the Blob upload fails", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.customTemplate.create.mockResolvedValue({
      id: "t1",
      ownerId: "user_1",
      name: "My template",
      description: null,
      filePath: "",
      createdAt: new Date(),
    })
    uploadTemplateJsonMock.mockRejectedValue(new Error("blob down"))
    prismaMock.customTemplate.delete.mockResolvedValue({})

    const response = await POST(postRequest({ name: "My template", nodes: [], edges: [] }))

    expect(response.status).toBe(500)
    expect(prismaMock.customTemplate.delete).toHaveBeenCalledWith({ where: { id: "t1" } })
    expect(prismaMock.customTemplate.update).not.toHaveBeenCalled()
  })

  it("returns 500 (without throwing) when the placeholder cleanup delete itself fails", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.customTemplate.create.mockResolvedValue({
      id: "t1",
      ownerId: "user_1",
      name: "My template",
      description: null,
      filePath: "",
      createdAt: new Date(),
    })
    uploadTemplateJsonMock.mockRejectedValue(new Error("blob down"))
    prismaMock.customTemplate.delete.mockRejectedValue(new Error("db down"))

    const response = await POST(postRequest({ name: "My template", nodes: [], edges: [] }))

    expect(response.status).toBe(500)
  })
})
