import { describe, it, expect, vi, beforeEach } from "vitest"
import type { GenerateSpecPayload } from "@/trigger/generate-spec"

const { taskMock, loggerLogMock, loggerErrorMock, metadataSetMock } = vi.hoisted(() => ({
  taskMock: vi.fn((options: { id: string; run: unknown }) => options),
  loggerLogMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  metadataSetMock: vi.fn(),
}))

vi.mock("@trigger.dev/sdk", () => ({
  task: taskMock,
  logger: { log: loggerLogMock, error: loggerErrorMock },
  metadata: { set: metadataSetMock },
}))

const { generateSpecMarkdownMock, generateIacSkeletonMock } = vi.hoisted(() => ({
  generateSpecMarkdownMock: vi.fn(),
  generateIacSkeletonMock: vi.fn(),
}))

vi.mock("@/lib/generate-spec-ai", () => ({
  generateSpecMarkdown: generateSpecMarkdownMock,
  generateIacSkeleton: generateIacSkeletonMock,
}))

const { uploadSpecMarkdownMock, uploadSpecIacMock } = vi.hoisted(() => ({
  uploadSpecMarkdownMock: vi.fn(),
  uploadSpecIacMock: vi.fn(),
}))

vi.mock("@/lib/spec-blob", () => ({
  uploadSpecMarkdown: uploadSpecMarkdownMock,
  uploadSpecIac: uploadSpecIacMock,
}))

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    projectSpec: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

import { GENERATE_SPEC_TASK_ID, generateSpecTask, runGenerateSpec } from "./generate-spec"

// `task(...)` is only ever called once, at module import time (module-scope
// `const generateSpecTask = task({...})`) — captured here, before any test's
// `beforeEach` clears the mock's call history, so the registration itself
// stays assertable (mirrors `trigger/design-agent.test.ts`'s own precedent).
const taskRegistrationCall = taskMock.mock.calls[0]?.[0]

const VALID_PAYLOAD: GenerateSpecPayload = {
  projectId: "room-1",
  roomId: "room-1",
  chatHistory: [{ id: "m1", sender: "Alice", role: "user", content: "hello", timestamp: 1 }],
  nodes: [{ id: "n1", label: "API", shape: "rectangle", x: 0, y: 0 }],
  edges: [{ id: "e1", sourceNodeId: "n1", targetNodeId: "n1" }],
}

beforeEach(() => {
  vi.clearAllMocks()
  generateSpecMarkdownMock.mockResolvedValue("# Spec\n\nGenerated content.")
  generateIacSkeletonMock.mockResolvedValue('resource "null_resource" "api" {}')
  prismaMock.projectSpec.create.mockResolvedValue({ id: "spec_1", projectId: "room-1", filePath: "" })
  uploadSpecMarkdownMock.mockResolvedValue("https://blob.example/specs/room-1/spec_1.md")
  uploadSpecIacMock.mockResolvedValue("https://blob.example/specs/room-1/spec_1.tf")
  prismaMock.projectSpec.update.mockResolvedValue({
    id: "spec_1",
    projectId: "room-1",
    filePath: "https://blob.example/specs/room-1/spec_1.md",
    iacFilePath: "https://blob.example/specs/room-1/spec_1.tf",
  })
  prismaMock.projectSpec.delete.mockResolvedValue({ id: "spec_1" })
})

describe("runGenerateSpec", () => {
  it("validates the payload, calls Gemini with the chat history and graph, and returns the generated markdown and terraform", async () => {
    const result = await runGenerateSpec(VALID_PAYLOAD)

    expect(result).toEqual({
      roomId: "room-1",
      projectId: "room-1",
      specId: "spec_1",
      markdown: "# Spec\n\nGenerated content.",
      terraform: 'resource "null_resource" "api" {}',
    })
    expect(generateSpecMarkdownMock).toHaveBeenCalledWith({
      chatHistory: VALID_PAYLOAD.chatHistory,
      nodes: VALID_PAYLOAD.nodes,
      edges: VALID_PAYLOAD.edges,
    })
    expect(generateIacSkeletonMock).toHaveBeenCalledWith({
      nodes: VALID_PAYLOAD.nodes,
      edges: VALID_PAYLOAD.edges,
    })
  })

  it("calls generateIacSkeleton only after generateSpecMarkdown has already resolved", async () => {
    const callOrder: string[] = []
    generateSpecMarkdownMock.mockImplementation(async () => {
      callOrder.push("markdown")
      return "# Spec\n\nGenerated content."
    })
    generateIacSkeletonMock.mockImplementation(async () => {
      callOrder.push("terraform")
      return 'resource "null_resource" "api" {}'
    })

    await runGenerateSpec(VALID_PAYLOAD)

    expect(callOrder).toEqual(["markdown", "terraform"])
  })

  it("publishes start, processing (x3), and complete status via Trigger.dev run metadata, in order", async () => {
    await runGenerateSpec(VALID_PAYLOAD)

    const stages = metadataSetMock.mock.calls.map((call: unknown[]) => (call[1] as { stage: string }).stage)
    expect(stages).toEqual(["start", "processing", "processing", "processing", "complete"])
    expect(metadataSetMock.mock.calls[0][0]).toBe("status")
  })

  it("accepts an empty nodes/edges graph and empty chat history, passing them through as-is", async () => {
    const emptyPayload: GenerateSpecPayload = {
      projectId: "room-1",
      roomId: "room-1",
      chatHistory: [],
      nodes: [],
      edges: [],
    }

    const result = await runGenerateSpec(emptyPayload)

    expect(result.markdown).toBe("# Spec\n\nGenerated content.")
    expect(result.terraform).toBe('resource "null_resource" "api" {}')
    expect(generateSpecMarkdownMock).toHaveBeenCalledWith({ chatHistory: [], nodes: [], edges: [] })
    expect(generateIacSkeletonMock).toHaveBeenCalledWith({ nodes: [], edges: [] })
  })

  it("logs completion with the room/project ids, specId, and markdown length", async () => {
    await runGenerateSpec(VALID_PAYLOAD)

    expect(loggerLogMock).toHaveBeenCalledWith(
      "generate-spec task completed",
      expect.objectContaining({ roomId: "room-1", projectId: "room-1", specId: "spec_1" }),
    )
  })
})

describe("runGenerateSpec — persistence", () => {
  it("creates a placeholder ProjectSpec row, uploads markdown and terraform to Blob using the generated id, then updates filePath+iacFilePath in one call", async () => {
    await runGenerateSpec(VALID_PAYLOAD)

    expect(prismaMock.projectSpec.create).toHaveBeenCalledWith({
      data: { projectId: "room-1", filePath: "" },
    })
    expect(uploadSpecMarkdownMock).toHaveBeenCalledWith(
      "room-1",
      "spec_1",
      "# Spec\n\nGenerated content.",
    )
    expect(uploadSpecIacMock).toHaveBeenCalledWith(
      "room-1",
      "spec_1",
      'resource "null_resource" "api" {}',
    )
    expect(prismaMock.projectSpec.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.projectSpec.update).toHaveBeenCalledWith({
      where: { id: "spec_1" },
      data: {
        filePath: "https://blob.example/specs/room-1/spec_1.md",
        iacFilePath: "https://blob.example/specs/room-1/spec_1.tf",
      },
    })
  })

  it("never persists anything when Markdown generation fails, and never calls generateIacSkeleton", async () => {
    generateSpecMarkdownMock.mockRejectedValue(new Error("gemini down"))

    await expect(runGenerateSpec(VALID_PAYLOAD)).rejects.toThrow("gemini down")

    expect(generateIacSkeletonMock).not.toHaveBeenCalled()
    expect(prismaMock.projectSpec.create).not.toHaveBeenCalled()
    expect(uploadSpecMarkdownMock).not.toHaveBeenCalled()
    expect(uploadSpecIacMock).not.toHaveBeenCalled()
  })

  it("never persists anything when Terraform generation fails, after Markdown already succeeded", async () => {
    generateIacSkeletonMock.mockRejectedValue(new Error("gemini iac down"))

    await expect(runGenerateSpec(VALID_PAYLOAD)).rejects.toThrow("gemini iac down")

    expect(generateSpecMarkdownMock).toHaveBeenCalled()
    expect(prismaMock.projectSpec.create).not.toHaveBeenCalled()
    expect(uploadSpecMarkdownMock).not.toHaveBeenCalled()
    expect(uploadSpecIacMock).not.toHaveBeenCalled()

    const errorCall = metadataSetMock.mock.calls.find(
      (call: unknown[]) => (call[1] as { stage: string }).stage === "error",
    )
    expect(errorCall).toBeDefined()
  })

  it("deletes the placeholder row and rethrows when the Markdown Blob upload fails, without ever calling uploadSpecIac", async () => {
    uploadSpecMarkdownMock.mockRejectedValue(new Error("blob down"))

    await expect(runGenerateSpec(VALID_PAYLOAD)).rejects.toThrow("blob down")

    expect(prismaMock.projectSpec.delete).toHaveBeenCalledWith({ where: { id: "spec_1" } })
    expect(uploadSpecIacMock).not.toHaveBeenCalled()
    expect(prismaMock.projectSpec.update).not.toHaveBeenCalled()

    const errorCall = metadataSetMock.mock.calls.find(
      (call: unknown[]) => (call[1] as { stage: string }).stage === "error",
    )
    expect(errorCall).toBeDefined()
  })

  it("deletes the placeholder row and rethrows when the Terraform Blob upload fails", async () => {
    uploadSpecIacMock.mockRejectedValue(new Error("iac blob down"))

    await expect(runGenerateSpec(VALID_PAYLOAD)).rejects.toThrow("iac blob down")

    expect(uploadSpecMarkdownMock).toHaveBeenCalled()
    expect(prismaMock.projectSpec.delete).toHaveBeenCalledWith({ where: { id: "spec_1" } })
    expect(prismaMock.projectSpec.update).not.toHaveBeenCalled()
  })

  it("deletes the placeholder row and rethrows when the combined filePath+iacFilePath update fails", async () => {
    prismaMock.projectSpec.update.mockRejectedValue(new Error("db down"))

    await expect(runGenerateSpec(VALID_PAYLOAD)).rejects.toThrow("db down")

    expect(prismaMock.projectSpec.delete).toHaveBeenCalledWith({ where: { id: "spec_1" } })
  })

  it("logs (but does not rethrow) a secondary failure while cleaning up the placeholder row", async () => {
    uploadSpecMarkdownMock.mockRejectedValue(new Error("blob down"))
    prismaMock.projectSpec.delete.mockRejectedValue(new Error("cleanup also failed"))

    await expect(runGenerateSpec(VALID_PAYLOAD)).rejects.toThrow("blob down")

    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Failed to clean up an orphaned ProjectSpec row after a persistence failure",
      expect.objectContaining({ projectId: "room-1", specId: "spec_1" }),
    )
  })
})

describe("runGenerateSpec — payload validation", () => {
  it("rejects a payload with non-array nodes before ever calling Gemini", async () => {
    const invalidPayload = { ...VALID_PAYLOAD, nodes: "not-an-array" } as unknown as GenerateSpecPayload

    await expect(runGenerateSpec(invalidPayload)).rejects.toThrow()
    expect(generateSpecMarkdownMock).not.toHaveBeenCalled()
    expect(metadataSetMock).not.toHaveBeenCalled()
  })

  it("rejects a payload with non-array edges before ever calling Gemini", async () => {
    const invalidPayload = { ...VALID_PAYLOAD, edges: "not-an-array" } as unknown as GenerateSpecPayload

    await expect(runGenerateSpec(invalidPayload)).rejects.toThrow()
    expect(generateSpecMarkdownMock).not.toHaveBeenCalled()
  })

  it("rejects a payload whose chatHistory entry is missing required fields", async () => {
    const invalidPayload = {
      ...VALID_PAYLOAD,
      chatHistory: [{ id: "m1" }],
    } as unknown as GenerateSpecPayload

    await expect(runGenerateSpec(invalidPayload)).rejects.toThrow()
    expect(generateSpecMarkdownMock).not.toHaveBeenCalled()
  })

  it("rejects a payload with a malformed node (missing x/y)", async () => {
    const invalidPayload = {
      ...VALID_PAYLOAD,
      nodes: [{ id: "n1", label: "API", shape: "rectangle" }],
    } as unknown as GenerateSpecPayload

    await expect(runGenerateSpec(invalidPayload)).rejects.toThrow()
    expect(generateSpecMarkdownMock).not.toHaveBeenCalled()
  })

  it("rejects a payload missing roomId or projectId", async () => {
    const invalidPayload = { ...VALID_PAYLOAD, roomId: "" } as unknown as GenerateSpecPayload

    await expect(runGenerateSpec(invalidPayload)).rejects.toThrow()
    expect(generateSpecMarkdownMock).not.toHaveBeenCalled()
  })
})

describe("runGenerateSpec — failure handling", () => {
  it("publishes an error status and rethrows when Gemini generation fails", async () => {
    generateSpecMarkdownMock.mockRejectedValue(new Error("gemini down"))

    await expect(runGenerateSpec(VALID_PAYLOAD)).rejects.toThrow("gemini down")

    const errorCall = metadataSetMock.mock.calls.find(
      (call: unknown[]) => (call[1] as { stage: string }).stage === "error",
    )
    expect(errorCall).toBeDefined()
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "generate-spec task failed",
      expect.objectContaining({ roomId: "room-1", projectId: "room-1", error: "gemini down" }),
    )
  })

  it("does not let a failure while setting the error status itself mask the original error", async () => {
    generateSpecMarkdownMock.mockRejectedValue(new Error("original failure"))
    metadataSetMock.mockImplementation((key: string, value: { stage: string }) => {
      if (key === "status" && value.stage === "error") {
        throw new Error("metadata set also failed")
      }
    })

    await expect(runGenerateSpec(VALID_PAYLOAD)).rejects.toThrow("original failure")
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "generate-spec failed to set its own error status",
      expect.objectContaining({ roomId: "room-1", projectId: "room-1" }),
    )
  })
})

describe("generateSpecTask", () => {
  it("is registered with the expected task id and the exported run function", () => {
    expect(taskRegistrationCall).toEqual({ id: GENERATE_SPEC_TASK_ID, run: runGenerateSpec })
    expect(generateSpecTask.id).toBe(GENERATE_SPEC_TASK_ID)
  })

  it("exports a callable task with a stable, human-readable id", () => {
    expect(GENERATE_SPEC_TASK_ID).toBe("generate-spec")
  })
})
