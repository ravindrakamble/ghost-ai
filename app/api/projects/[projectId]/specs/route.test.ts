import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { getProjectAccessMock, prismaMock } = vi.hoisted(() => ({
  getProjectAccessMock: vi.fn(),
  prismaMock: {
    projectSpec: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock("@/lib/project-access", () => ({
  getProjectAccess: getProjectAccessMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

import { GET } from "./route"

function ctx(projectId = "p1") {
  return { params: Promise.resolve({ projectId }) }
}

function getRequest() {
  return new NextRequest("http://localhost/api/projects/p1/specs")
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/projects/[projectId]/specs", () => {
  it("returns 401 when unauthenticated, before touching Prisma", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "unauthenticated" })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(401)
    expect(prismaMock.projectSpec.findMany).not.toHaveBeenCalled()
  })

  it("returns 404 when the project does not exist", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "not-found" })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(404)
    expect(prismaMock.projectSpec.findMany).not.toHaveBeenCalled()
  })

  it("returns 403 when the caller is neither owner nor collaborator", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "forbidden" })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(403)
    expect(prismaMock.projectSpec.findMany).not.toHaveBeenCalled()
  })

  it("returns an empty list when the project has no generated specs", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: true, project: { id: "p1", name: "P" }, isOwner: true })
    prismaMock.projectSpec.findMany.mockResolvedValue([])

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ specs: [] })
  })

  it("lists specs newest first, as metadata only — never the raw Blob URL, with a derived hasIac flag", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: false,
    })
    const createdAt1 = new Date("2026-01-01T00:00:00Z")
    const createdAt2 = new Date("2026-01-02T00:00:00Z")
    prismaMock.projectSpec.findMany.mockResolvedValue([
      { id: "spec_2", createdAt: createdAt2, iacFilePath: "https://blob.example/specs/p1/spec_2.tf" },
      { id: "spec_1", createdAt: createdAt1, iacFilePath: null },
    ])

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      specs: [
        { id: "spec_2", filename: "spec-spec_2.md", createdAt: createdAt2.toISOString(), hasIac: true },
        { id: "spec_1", filename: "spec-spec_1.md", createdAt: createdAt1.toISOString(), hasIac: false },
      ],
    })
    expect(JSON.stringify(body)).not.toContain("blob")
    expect(prismaMock.projectSpec.findMany).toHaveBeenCalledWith({
      where: { projectId: "p1" },
      select: { id: true, createdAt: true, iacFilePath: true },
      orderBy: { createdAt: "desc" },
    })
  })
})
