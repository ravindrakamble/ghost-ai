import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { getCallerIdentityMock, prismaMock, fetchTemplateJsonMock, deleteTemplateJsonMock } = vi.hoisted(() => ({
  getCallerIdentityMock: vi.fn(),
  prismaMock: {
    customTemplate: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
  fetchTemplateJsonMock: vi.fn(),
  deleteTemplateJsonMock: vi.fn(),
}))

vi.mock("@/lib/project-access", () => ({
  getCallerIdentity: getCallerIdentityMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

vi.mock("@/lib/template-blob", () => ({
  fetchTemplateJson: fetchTemplateJsonMock,
  deleteTemplateJson: deleteTemplateJsonMock,
}))

import { GET, DELETE } from "./route"

function ctx(templateId = "t1") {
  return { params: Promise.resolve({ templateId }) }
}

function getRequest() {
  return new NextRequest("http://localhost/api/templates/t1")
}

function deleteRequest() {
  return new NextRequest("http://localhost/api/templates/t1", { method: "DELETE" })
}

const ownedTemplate = {
  id: "t1",
  ownerId: "user_1",
  name: "My template",
  description: "desc",
  filePath: "https://blob.example/templates/user_1/t1.json",
  createdAt: new Date("2026-01-01T00:00:00Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/templates/[templateId]", () => {
  it("returns 401 when unauthenticated, before touching Prisma", async () => {
    getCallerIdentityMock.mockResolvedValue(null)

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(401)
    expect(prismaMock.customTemplate.findUnique).not.toHaveBeenCalled()
  })

  it("returns 404 when the template does not exist", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.customTemplate.findUnique.mockResolvedValue(null)

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(404)
    expect(fetchTemplateJsonMock).not.toHaveBeenCalled()
  })

  it("returns 403 when the caller does not own the template (404-then-403 precedence)", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_2", email: "b@example.com" })
    prismaMock.customTemplate.findUnique.mockResolvedValue(ownedTemplate)

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(403)
    expect(fetchTemplateJsonMock).not.toHaveBeenCalled()
  })

  it("returns 500 on a genuine upstream Blob failure", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.customTemplate.findUnique.mockResolvedValue(ownedTemplate)
    fetchTemplateJsonMock.mockRejectedValue(new Error("blob down"))

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(500)
  })

  it("returns 404 when the row exists but has no fetchable Blob content", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.customTemplate.findUnique.mockResolvedValue(ownedTemplate)
    fetchTemplateJsonMock.mockResolvedValue(null)

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(404)
  })

  it("returns the full importable shape matching CanvasTemplate's field set", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.customTemplate.findUnique.mockResolvedValue(ownedTemplate)
    fetchTemplateJsonMock.mockResolvedValue({ nodes: [{ id: "n1" }], edges: [{ id: "e1" }] })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      id: "t1",
      name: "My template",
      description: "desc",
      nodes: [{ id: "n1" }],
      edges: [{ id: "e1" }],
    })
    expect(JSON.stringify(body)).not.toContain("blob.example")
    expect(fetchTemplateJsonMock).toHaveBeenCalledWith(ownedTemplate.filePath)
  })
})

describe("DELETE /api/templates/[templateId]", () => {
  it("returns 401 when unauthenticated, before touching Prisma", async () => {
    getCallerIdentityMock.mockResolvedValue(null)

    const response = await DELETE(deleteRequest(), ctx())

    expect(response.status).toBe(401)
    expect(prismaMock.customTemplate.delete).not.toHaveBeenCalled()
  })

  it("returns 404 when the template does not exist", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.customTemplate.findUnique.mockResolvedValue(null)

    const response = await DELETE(deleteRequest(), ctx())

    expect(response.status).toBe(404)
    expect(prismaMock.customTemplate.delete).not.toHaveBeenCalled()
  })

  it("returns 403 when the caller does not own the template", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_2", email: "b@example.com" })
    prismaMock.customTemplate.findUnique.mockResolvedValue(ownedTemplate)

    const response = await DELETE(deleteRequest(), ctx())

    expect(response.status).toBe(403)
    expect(prismaMock.customTemplate.delete).not.toHaveBeenCalled()
  })

  it("deletes the Prisma row first, then best-effort deletes the Blob object", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.customTemplate.findUnique.mockResolvedValue(ownedTemplate)
    prismaMock.customTemplate.delete.mockResolvedValue(ownedTemplate)
    deleteTemplateJsonMock.mockResolvedValue(undefined)

    const callOrder: string[] = []
    prismaMock.customTemplate.delete.mockImplementation(async () => {
      callOrder.push("prisma-delete")
      return ownedTemplate
    })
    deleteTemplateJsonMock.mockImplementation(async () => {
      callOrder.push("blob-delete")
    })

    const response = await DELETE(deleteRequest(), ctx())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ success: true })
    expect(prismaMock.customTemplate.delete).toHaveBeenCalledWith({ where: { id: "t1" } })
    expect(deleteTemplateJsonMock).toHaveBeenCalledWith(ownedTemplate.filePath)
    expect(callOrder).toEqual(["prisma-delete", "blob-delete"])
  })

  it("still returns success when the Blob delete fails after the Prisma row is already gone", async () => {
    getCallerIdentityMock.mockResolvedValue({ userId: "user_1", email: "a@example.com" })
    prismaMock.customTemplate.findUnique.mockResolvedValue(ownedTemplate)
    prismaMock.customTemplate.delete.mockResolvedValue(ownedTemplate)
    deleteTemplateJsonMock.mockRejectedValue(new Error("blob down"))

    const response = await DELETE(deleteRequest(), ctx())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ success: true })
    expect(prismaMock.customTemplate.delete).toHaveBeenCalledWith({ where: { id: "t1" } })
  })
})
