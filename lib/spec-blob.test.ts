import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { putMock, getMock } = vi.hoisted(() => ({
  putMock: vi.fn(),
  getMock: vi.fn(),
}))

vi.mock("@vercel/blob", () => ({
  put: putMock,
  get: getMock,
}))

import {
  fetchSpecMarkdown,
  specBlobPathname,
  uploadSpecMarkdown,
  fetchSpecIac,
  iacBlobPathname,
  uploadSpecIac,
} from "./spec-blob"

function makeStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

describe("specBlobPathname", () => {
  it("returns the deterministic specs/{projectId}/{specId}.md path", () => {
    expect(specBlobPathname("p1", "s1")).toBe("specs/p1/s1.md")
  })
})

describe("uploadSpecMarkdown / fetchSpecMarkdown", () => {
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

  describe("uploadSpecMarkdown", () => {
    it("throws a handled error when BLOB_READ_WRITE_TOKEN is not set", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN

      await expect(uploadSpecMarkdown("p1", "s1", "# Spec")).rejects.toThrow(
        /BLOB_READ_WRITE_TOKEN/,
      )
      expect(putMock).not.toHaveBeenCalled()
    })

    it("uploads the raw markdown to specs/{projectId}/{specId}.md with private access", async () => {
      putMock.mockResolvedValue({ url: "https://blob.example/specs/p1/s1.md" })

      const url = await uploadSpecMarkdown("p1", "s1", "# Spec\n\nBody.")

      expect(url).toBe("https://blob.example/specs/p1/s1.md")
      expect(putMock).toHaveBeenCalledWith(
        "specs/p1/s1.md",
        "# Spec\n\nBody.",
        expect.objectContaining({
          access: "private",
          contentType: "text/markdown",
          addRandomSuffix: false,
          allowOverwrite: true,
          token: "test-token",
        }),
      )
    })
  })

  describe("fetchSpecMarkdown", () => {
    it("throws a handled error when BLOB_READ_WRITE_TOKEN is not set", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN

      await expect(fetchSpecMarkdown("https://blob.example/specs/p1/s1.md")).rejects.toThrow(
        /BLOB_READ_WRITE_TOKEN/,
      )
    })

    it("returns null when the blob is not found (get resolves null)", async () => {
      getMock.mockResolvedValue(null)

      const result = await fetchSpecMarkdown("https://blob.example/specs/p1/s1.md")

      expect(result).toBeNull()
    })

    it("returns null for a non-200 status", async () => {
      getMock.mockResolvedValue({ statusCode: 304, stream: null })

      const result = await fetchSpecMarkdown("https://blob.example/specs/p1/s1.md")

      expect(result).toBeNull()
    })

    it("returns the raw markdown content for a valid blob", async () => {
      getMock.mockResolvedValue({ statusCode: 200, stream: makeStream("# Spec\n\nBody.") })

      const result = await fetchSpecMarkdown("https://blob.example/specs/p1/s1.md")

      expect(result).toBe("# Spec\n\nBody.")
      expect(getMock).toHaveBeenCalledWith("https://blob.example/specs/p1/s1.md", {
        access: "private",
        token: "test-token",
      })
    })

    it("propagates a genuine upstream error rather than swallowing it as 'no content'", async () => {
      getMock.mockRejectedValue(new Error("network down"))

      await expect(fetchSpecMarkdown("https://blob.example/specs/p1/s1.md")).rejects.toThrow(
        "network down",
      )
    })
  })
})

describe("iacBlobPathname", () => {
  it("returns the deterministic specs/{projectId}/{specId}.tf path", () => {
    expect(iacBlobPathname("p1", "s1")).toBe("specs/p1/s1.tf")
  })
})

describe("uploadSpecIac / fetchSpecIac", () => {
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

  describe("uploadSpecIac", () => {
    it("throws a handled error when BLOB_READ_WRITE_TOKEN is not set", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN

      await expect(uploadSpecIac("p1", "s1", "resource \"x\" \"y\" {}")).rejects.toThrow(
        /BLOB_READ_WRITE_TOKEN/,
      )
      expect(putMock).not.toHaveBeenCalled()
    })

    it("uploads the raw terraform to specs/{projectId}/{specId}.tf with private access and text/plain content type", async () => {
      putMock.mockResolvedValue({ url: "https://blob.example/specs/p1/s1.tf" })

      const url = await uploadSpecIac("p1", "s1", "resource \"aws_db_instance\" \"db\" {}")

      expect(url).toBe("https://blob.example/specs/p1/s1.tf")
      expect(putMock).toHaveBeenCalledWith(
        "specs/p1/s1.tf",
        "resource \"aws_db_instance\" \"db\" {}",
        expect.objectContaining({
          access: "private",
          contentType: "text/plain",
          addRandomSuffix: false,
          allowOverwrite: true,
          token: "test-token",
        }),
      )
    })
  })

  describe("fetchSpecIac", () => {
    it("throws a handled error when BLOB_READ_WRITE_TOKEN is not set", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN

      await expect(fetchSpecIac("https://blob.example/specs/p1/s1.tf")).rejects.toThrow(
        /BLOB_READ_WRITE_TOKEN/,
      )
    })

    it("returns null when the blob is not found (get resolves null)", async () => {
      getMock.mockResolvedValue(null)

      const result = await fetchSpecIac("https://blob.example/specs/p1/s1.tf")

      expect(result).toBeNull()
    })

    it("returns null for a non-200 status", async () => {
      getMock.mockResolvedValue({ statusCode: 304, stream: null })

      const result = await fetchSpecIac("https://blob.example/specs/p1/s1.tf")

      expect(result).toBeNull()
    })

    it("returns the raw terraform content for a valid blob", async () => {
      getMock.mockResolvedValue({ statusCode: 200, stream: makeStream("resource \"x\" \"y\" {}") })

      const result = await fetchSpecIac("https://blob.example/specs/p1/s1.tf")

      expect(result).toBe("resource \"x\" \"y\" {}")
      expect(getMock).toHaveBeenCalledWith("https://blob.example/specs/p1/s1.tf", {
        access: "private",
        token: "test-token",
      })
    })

    it("propagates a genuine upstream error rather than swallowing it as 'no content'", async () => {
      getMock.mockRejectedValue(new Error("network down"))

      await expect(fetchSpecIac("https://blob.example/specs/p1/s1.tf")).rejects.toThrow(
        "network down",
      )
    })
  })
})
