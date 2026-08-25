import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { getProjectAccessMock, prismaMock, fetchSpecIacMock } = vi.hoisted(() => ({
  getProjectAccessMock: vi.fn(),
  prismaMock: {
    projectSpec: {
      findUnique: vi.fn(),
    },
  },
  fetchSpecIacMock: vi.fn(),
}))

vi.mock("@/lib/project-access", () => ({
  getProjectAccess: getProjectAccessMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

vi.mock("@/lib/spec-blob", () => ({
  fetchSpecIac: fetchSpecIacMock,
}))

import { GET } from "./route"

function ctx(projectId = "p1", specId = "spec_1") {
  return { params: Promise.resolve({ projectId, specId }) }
}

function getRequest() {
  return new NextRequest("http://localhost/api/projects/p1/specs/spec_1/download-iac")
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/projects/[projectId]/specs/[specId]/download-iac", () => {
  it("returns 401 when unauthenticated, before any Prisma read or Blob fetch", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "unauthenticated" })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(401)
    expect(prismaMock.projectSpec.findUnique).not.toHaveBeenCalled()
    expect(fetchSpecIacMock).not.toHaveBeenCalled()
  })

  it("returns 404 when the project does not exist", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "not-found" })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(404)
    expect(prismaMock.projectSpec.findUnique).not.toHaveBeenCalled()
  })

  it("returns 403 when the caller is neither owner nor collaborator", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "forbidden" })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(403)
    expect(prismaMock.projectSpec.findUnique).not.toHaveBeenCalled()
  })

  it("returns 404 when the spec does not exist", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: true, project: { id: "p1", name: "P" }, isOwner: true })
    prismaMock.projectSpec.findUnique.mockResolvedValue(null)

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(404)
    expect(fetchSpecIacMock).not.toHaveBeenCalled()
  })

  it("returns 404 when the spec exists but belongs to a different project", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: true, project: { id: "p1", name: "P" }, isOwner: true })
    prismaMock.projectSpec.findUnique.mockResolvedValue({
      projectId: "some-other-project",
      iacFilePath: "https://blob.example/specs/some-other-project/spec_1.tf",
    })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(404)
    expect(fetchSpecIacMock).not.toHaveBeenCalled()
  })

  it("returns 404 (not 500, not an empty 200) when iacFilePath is null (a spec generated before this feature shipped)", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: true, project: { id: "p1", name: "P" }, isOwner: true })
    prismaMock.projectSpec.findUnique.mockResolvedValue({
      projectId: "p1",
      iacFilePath: null,
    })

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(404)
    expect(fetchSpecIacMock).not.toHaveBeenCalled()
  })

  it("returns 404 when the referenced Blob content is missing", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: true, project: { id: "p1", name: "P" }, isOwner: true })
    prismaMock.projectSpec.findUnique.mockResolvedValue({
      projectId: "p1",
      iacFilePath: "https://blob.example/specs/p1/spec_1.tf",
    })
    fetchSpecIacMock.mockResolvedValue(null)

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(404)
  })

  it("returns 500 when fetching from Blob throws a genuine upstream error", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: true, project: { id: "p1", name: "P" }, isOwner: true })
    prismaMock.projectSpec.findUnique.mockResolvedValue({
      projectId: "p1",
      iacFilePath: "https://blob.example/specs/p1/spec_1.tf",
    })
    fetchSpecIacMock.mockRejectedValue(new Error("network down"))

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(500)
  })

  it("returns the terraform content as a downloadable attachment for an owner or collaborator, never the raw Blob URL", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "P" },
      isOwner: false,
    })
    prismaMock.projectSpec.findUnique.mockResolvedValue({
      projectId: "p1",
      iacFilePath: "https://blob.example/specs/p1/spec_1.tf",
    })
    fetchSpecIacMock.mockResolvedValue('resource "aws_db_instance" "db" {}')

    const response = await GET(getRequest(), ctx())

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="spec-spec_1.tf"',
    )
    const body = await response.text()
    expect(body).toBe('resource "aws_db_instance" "db" {}')
    expect(body).not.toContain("blob.example")
    expect(fetchSpecIacMock).toHaveBeenCalledWith("https://blob.example/specs/p1/spec_1.tf")
  })
})
