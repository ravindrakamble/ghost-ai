import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { putMock, getMock } = vi.hoisted(() => ({
  putMock: vi.fn(),
  getMock: vi.fn(),
}))

vi.mock("@vercel/blob", () => ({
  put: putMock,
  get: getMock,
}))

import { canvasBlobPathname, fetchCanvasSnapshot, uploadCanvasSnapshot } from "./canvas-blob"

function makeStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

describe("canvasBlobPathname", () => {
  it("returns the deterministic canvas/{projectId}.json path", () => {
    expect(canvasBlobPathname("p1")).toBe("canvas/p1.json")
  })
})

describe("uploadCanvasSnapshot / fetchCanvasSnapshot", () => {
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

  describe("uploadCanvasSnapshot", () => {
    it("throws a handled error when BLOB_READ_WRITE_TOKEN is not set", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN

      await expect(uploadCanvasSnapshot("p1", { nodes: [], edges: [] })).rejects.toThrow(
        /BLOB_READ_WRITE_TOKEN/,
      )
      expect(putMock).not.toHaveBeenCalled()
    })

    it("uploads the JSON-stringified snapshot to canvas/{projectId}.json, overwriting any previous snapshot", async () => {
      putMock.mockResolvedValue({ url: "https://blob.example/canvas/p1.json" })
      const snapshot = { nodes: [{ id: "n1" }], edges: [] }

      const url = await uploadCanvasSnapshot("p1", snapshot)

      expect(url).toBe("https://blob.example/canvas/p1.json")
      expect(putMock).toHaveBeenCalledWith(
        "canvas/p1.json",
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

  describe("fetchCanvasSnapshot", () => {
    it("throws a handled error when BLOB_READ_WRITE_TOKEN is not set", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN

      await expect(fetchCanvasSnapshot("https://blob.example/canvas/p1.json")).rejects.toThrow(
        /BLOB_READ_WRITE_TOKEN/,
      )
    })

    it("returns null when the blob is not found (get resolves null)", async () => {
      getMock.mockResolvedValue(null)

      const result = await fetchCanvasSnapshot("https://blob.example/canvas/p1.json")

      expect(result).toBeNull()
    })

    it("returns null for a non-200 status", async () => {
      getMock.mockResolvedValue({ statusCode: 304, stream: null })

      const result = await fetchCanvasSnapshot("https://blob.example/canvas/p1.json")

      expect(result).toBeNull()
    })

    it("returns null when the blob content isn't valid JSON", async () => {
      getMock.mockResolvedValue({ statusCode: 200, stream: makeStream("not json") })

      const result = await fetchCanvasSnapshot("https://blob.example/canvas/p1.json")

      expect(result).toBeNull()
    })

    it("returns null when the parsed JSON doesn't match the CanvasSnapshot shape", async () => {
      getMock.mockResolvedValue({
        statusCode: 200,
        stream: makeStream(JSON.stringify({ foo: "bar" })),
      })

      const result = await fetchCanvasSnapshot("https://blob.example/canvas/p1.json")

      expect(result).toBeNull()
    })

    it("parses and returns a valid canvas snapshot", async () => {
      const snapshot = { nodes: [{ id: "n1" }], edges: [{ id: "e1" }] }
      getMock.mockResolvedValue({ statusCode: 200, stream: makeStream(JSON.stringify(snapshot)) })

      const result = await fetchCanvasSnapshot("https://blob.example/canvas/p1.json")

      expect(result).toEqual(snapshot)
      expect(getMock).toHaveBeenCalledWith("https://blob.example/canvas/p1.json", {
        access: "private",
        token: "test-token",
      })
    })

    it("propagates a genuine upstream error rather than swallowing it as 'no canvas'", async () => {
      getMock.mockRejectedValue(new Error("network down"))

      await expect(fetchCanvasSnapshot("https://blob.example/canvas/p1.json")).rejects.toThrow(
        "network down",
      )
    })
  })
})
