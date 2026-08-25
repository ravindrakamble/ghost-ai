import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { putMock, getMock, delMock } = vi.hoisted(() => ({
  putMock: vi.fn(),
  getMock: vi.fn(),
  delMock: vi.fn(),
}))

vi.mock("@vercel/blob", () => ({
  put: putMock,
  get: getMock,
  del: delMock,
}))

import { deleteTemplateJson, fetchTemplateJson, templateBlobPathname, uploadTemplateJson } from "./template-blob"

function makeStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

describe("templateBlobPathname", () => {
  it("returns the deterministic templates/{ownerId}/{templateId}.json path", () => {
    expect(templateBlobPathname("u1", "t1")).toBe("templates/u1/t1.json")
  })
})

describe("uploadTemplateJson / fetchTemplateJson / deleteTemplateJson", () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BLOB_READ_WRITE_TOKEN = "test-token"
  })

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.BLOB_READ_WRITE_TOKEN
    } else {
      process.env.BLOB_READ_WRITE_TOKEN = originalToken
    }
  })

  describe("uploadTemplateJson", () => {
    it("throws a handled error when BLOB_READ_WRITE_TOKEN is not set", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN

      await expect(uploadTemplateJson("u1", "t1", { nodes: [], edges: [] })).rejects.toThrow(
        /BLOB_READ_WRITE_TOKEN/,
      )
      expect(putMock).not.toHaveBeenCalled()
    })

    it("uploads the node/edge JSON to templates/{ownerId}/{templateId}.json with private access", async () => {
      putMock.mockResolvedValue({ url: "https://blob.example/templates/u1/t1.json" })

      const snapshot = { nodes: [{ id: "n1" }], edges: [] }
      const url = await uploadTemplateJson("u1", "t1", snapshot)

      expect(url).toBe("https://blob.example/templates/u1/t1.json")
      expect(putMock).toHaveBeenCalledWith(
        "templates/u1/t1.json",
        JSON.stringify(snapshot),
        expect.objectContaining({
          access: "private",
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: true,
          token: "test-token",
        }),
      )
    })
  })

  describe("fetchTemplateJson", () => {
    it("throws a handled error when BLOB_READ_WRITE_TOKEN is not set", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN

      await expect(fetchTemplateJson("https://blob.example/templates/u1/t1.json")).rejects.toThrow(
        /BLOB_READ_WRITE_TOKEN/,
      )
    })

    it("returns null when the blob is not found (get resolves null)", async () => {
      getMock.mockResolvedValue(null)

      const result = await fetchTemplateJson("https://blob.example/templates/u1/t1.json")

      expect(result).toBeNull()
    })

    it("returns null for a non-200 status", async () => {
      getMock.mockResolvedValue({ statusCode: 304, stream: null })

      const result = await fetchTemplateJson("https://blob.example/templates/u1/t1.json")

      expect(result).toBeNull()
    })

    it("returns null for content that isn't valid JSON", async () => {
      getMock.mockResolvedValue({ statusCode: 200, stream: makeStream("not json") })

      const result = await fetchTemplateJson("https://blob.example/templates/u1/t1.json")

      expect(result).toBeNull()
    })

    it("returns null for valid JSON that doesn't match the snapshot shape", async () => {
      getMock.mockResolvedValue({ statusCode: 200, stream: makeStream(JSON.stringify({ foo: "bar" })) })

      const result = await fetchTemplateJson("https://blob.example/templates/u1/t1.json")

      expect(result).toBeNull()
    })

    it("returns the parsed snapshot for valid content", async () => {
      const snapshot = { nodes: [{ id: "n1" }], edges: [{ id: "e1" }] }
      getMock.mockResolvedValue({ statusCode: 200, stream: makeStream(JSON.stringify(snapshot)) })

      const result = await fetchTemplateJson("https://blob.example/templates/u1/t1.json")

      expect(result).toEqual(snapshot)
      expect(getMock).toHaveBeenCalledWith("https://blob.example/templates/u1/t1.json", {
        access: "private",
        token: "test-token",
      })
    })

    it("propagates a genuine upstream error rather than swallowing it as 'no content'", async () => {
      getMock.mockRejectedValue(new Error("network down"))

      await expect(fetchTemplateJson("https://blob.example/templates/u1/t1.json")).rejects.toThrow(
        "network down",
      )
    })
  })

  describe("deleteTemplateJson", () => {
    it("throws a handled error when BLOB_READ_WRITE_TOKEN is not set", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN

      await expect(deleteTemplateJson("https://blob.example/templates/u1/t1.json")).rejects.toThrow(
        /BLOB_READ_WRITE_TOKEN/,
      )
      expect(delMock).not.toHaveBeenCalled()
    })

    it("calls del with the blob URL and token", async () => {
      delMock.mockResolvedValue(undefined)

      await deleteTemplateJson("https://blob.example/templates/u1/t1.json")

      expect(delMock).toHaveBeenCalledWith("https://blob.example/templates/u1/t1.json", {
        token: "test-token",
      })
    })

    it("propagates a genuine upstream delete failure", async () => {
      delMock.mockRejectedValue(new Error("network down"))

      await expect(deleteTemplateJson("https://blob.example/templates/u1/t1.json")).rejects.toThrow(
        "network down",
      )
    })
  })
})
