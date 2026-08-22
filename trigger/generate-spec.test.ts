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

const { generateSpecMarkdownMock } = vi.hoisted(() => ({
  generateSpecMarkdownMock: vi.fn(),
}))

vi.mock("@/lib/generate-spec-ai", () => ({
  generateSpecMarkdown: generateSpecMarkdownMock,
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
})

describe("runGenerateSpec", () => {
  it("validates the payload, calls Gemini with the chat history and graph, and returns the generated markdown", async () => {
    const result = await runGenerateSpec(VALID_PAYLOAD)

    expect(result).toEqual({
      roomId: "room-1",
      projectId: "room-1",
      markdown: "# Spec\n\nGenerated content.",
    })
    expect(generateSpecMarkdownMock).toHaveBeenCalledWith({
      chatHistory: VALID_PAYLOAD.chatHistory,
      nodes: VALID_PAYLOAD.nodes,
      edges: VALID_PAYLOAD.edges,
    })
  })

  it("publishes start, processing, and complete status via Trigger.dev run metadata, in order", async () => {
    await runGenerateSpec(VALID_PAYLOAD)

    const stages = metadataSetMock.mock.calls.map((call: unknown[]) => (call[1] as { stage: string }).stage)
    expect(stages).toEqual(["start", "processing", "complete"])
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
    expect(generateSpecMarkdownMock).toHaveBeenCalledWith({ chatHistory: [], nodes: [], edges: [] })
  })

  it("logs completion with the room/project ids and markdown length", async () => {
    await runGenerateSpec(VALID_PAYLOAD)

    expect(loggerLogMock).toHaveBeenCalledWith(
      "generate-spec task completed",
      expect.objectContaining({ roomId: "room-1", projectId: "room-1" }),
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
