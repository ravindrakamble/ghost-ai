import { describe, it, expect, vi, beforeEach } from "vitest"
import type { DesignAgentAction } from "@/lib/design-agent-ai"

const { taskMock, loggerLogMock, loggerErrorMock } = vi.hoisted(() => ({
  taskMock: vi.fn((options: { id: string; run: unknown }) => options),
  loggerLogMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}))

vi.mock("@trigger.dev/sdk", () => ({
  task: taskMock,
  logger: { log: loggerLogMock, error: loggerErrorMock },
}))

const {
  interpretDesignPromptMock,
  applyDesignAgentActionsMock,
  broadcastDesignAgentStatusMock,
  clearDesignAgentPresenceMock,
  getCurrentDesignGraphMock,
  setDesignAgentPresenceMock,
} = vi.hoisted(() => ({
  interpretDesignPromptMock: vi.fn(),
  applyDesignAgentActionsMock: vi.fn(),
  broadcastDesignAgentStatusMock: vi.fn(),
  clearDesignAgentPresenceMock: vi.fn(),
  getCurrentDesignGraphMock: vi.fn(),
  setDesignAgentPresenceMock: vi.fn(),
}))

vi.mock("@/lib/design-agent-ai", () => ({
  interpretDesignPrompt: interpretDesignPromptMock,
}))

vi.mock("@/lib/design-agent-room", () => ({
  applyDesignAgentActions: applyDesignAgentActionsMock,
  broadcastDesignAgentStatus: broadcastDesignAgentStatusMock,
  clearDesignAgentPresence: clearDesignAgentPresenceMock,
  getCurrentDesignGraph: getCurrentDesignGraphMock,
  setDesignAgentPresence: setDesignAgentPresenceMock,
}))

import { DESIGN_AGENT_TASK_ID, designAgentTask, runDesignAgent } from "./design-agent"

// `task(...)` is only ever called once, at module import time (module-scope
// `const designAgentTask = task({...})`) — captured here, before any test's
// `beforeEach` clears the mock's call history, so the registration itself
// stays assertable.
const taskRegistrationCall = taskMock.mock.calls[0]?.[0]

const EMPTY_GRAPH = { nodes: [], edges: [] }

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentDesignGraphMock.mockResolvedValue(EMPTY_GRAPH)
  interpretDesignPromptMock.mockResolvedValue([])
  applyDesignAgentActionsMock.mockResolvedValue(undefined)
  broadcastDesignAgentStatusMock.mockResolvedValue(undefined)
  setDesignAgentPresenceMock.mockResolvedValue(undefined)
  clearDesignAgentPresenceMock.mockResolvedValue(undefined)
})

describe("runDesignAgent", () => {
  it("reads the current graph, interprets the prompt, applies the actions, and reports success", async () => {
    const actions: DesignAgentAction[] = [
      {
        kind: "addNode",
        nodeId: "rectangle-1",
        shape: "rectangle",
        label: "API Gateway",
        color: "#1F1F1F",
        textColor: "#EDEDED",
        width: 160,
        height: 80,
        x: 100,
        y: 200,
      },
    ]
    interpretDesignPromptMock.mockResolvedValue(actions)

    const result = await runDesignAgent({ prompt: "design a checkout flow", roomId: "room-1" })

    expect(result).toEqual({ roomId: "room-1", actionCount: 1 })

    expect(getCurrentDesignGraphMock).toHaveBeenCalledWith("room-1")
    expect(interpretDesignPromptMock).toHaveBeenCalledWith({
      prompt: "design a checkout flow",
      currentGraph: EMPTY_GRAPH,
    })
    expect(applyDesignAgentActionsMock).toHaveBeenCalledWith("room-1", actions)
  })

  it("broadcasts start, processing, and complete status messages in order", async () => {
    await runDesignAgent({ prompt: "design it", roomId: "room-1" })

    const stages = broadcastDesignAgentStatusMock.mock.calls.map(
      (call: unknown[]) => (call[1] as { stage: string }).stage,
    )
    expect(stages).toEqual(["start", "processing", "complete"])
    expect(broadcastDesignAgentStatusMock.mock.calls[0][0]).toBe("room-1")
  })

  it("sets AI presence to thinking at the start and updates the cursor to the last added/moved node before applying", async () => {
    const actions: DesignAgentAction[] = [
      { kind: "moveNode", nodeId: "n1", x: 10, y: 20 },
      { kind: "deleteEdge", edgeId: "e1" },
      { kind: "addNode", nodeId: "n2", shape: "circle", label: "", color: "#1F1F1F", textColor: "#EDEDED", width: 80, height: 80, x: 300, y: 400 },
    ]
    interpretDesignPromptMock.mockResolvedValue(actions)

    await runDesignAgent({ prompt: "p", roomId: "room-1" })

    expect(setDesignAgentPresenceMock).toHaveBeenNthCalledWith(1, "room-1", { thinking: true, cursor: null })
    expect(setDesignAgentPresenceMock).toHaveBeenNthCalledWith(2, "room-1", {
      thinking: true,
      cursor: { x: 300, y: 400 },
    })
  })

  it("sets the cursor to null when the batch has no addNode/moveNode action", async () => {
    interpretDesignPromptMock.mockResolvedValue([{ kind: "deleteNode", nodeId: "n1" }])

    await runDesignAgent({ prompt: "p", roomId: "room-1" })

    expect(setDesignAgentPresenceMock).toHaveBeenNthCalledWith(2, "room-1", { thinking: true, cursor: null })
  })

  it("always clears AI presence on success", async () => {
    await runDesignAgent({ prompt: "p", roomId: "room-1" })

    expect(clearDesignAgentPresenceMock).toHaveBeenCalledWith("room-1")
  })

  it("reports an empty-batch completion message distinctly from a non-empty one", async () => {
    interpretDesignPromptMock.mockResolvedValue([])

    await runDesignAgent({ prompt: "p", roomId: "room-1" })

    const completeCall = broadcastDesignAgentStatusMock.mock.calls.find(
      (call: unknown[]) => (call[1] as { stage: string }).stage === "complete",
    )
    expect((completeCall?.[1] as { text: string }).text).toMatch(/didn't find any changes/i)
  })
})

describe("runDesignAgent — failure handling", () => {
  it("broadcasts an error status, clears presence, and rethrows when Gemini interpretation fails", async () => {
    interpretDesignPromptMock.mockRejectedValue(new Error("gemini down"))

    await expect(runDesignAgent({ prompt: "p", roomId: "room-1" })).rejects.toThrow("gemini down")

    expect(applyDesignAgentActionsMock).not.toHaveBeenCalled()
    const errorCall = broadcastDesignAgentStatusMock.mock.calls.find(
      (call: unknown[]) => (call[1] as { stage: string }).stage === "error",
    )
    expect(errorCall).toBeDefined()
    expect(clearDesignAgentPresenceMock).toHaveBeenCalledWith("room-1")
  })

  it("broadcasts an error status, clears presence, and rethrows when reading current Storage fails", async () => {
    getCurrentDesignGraphMock.mockRejectedValue(new Error("liveblocks down"))

    await expect(runDesignAgent({ prompt: "p", roomId: "room-1" })).rejects.toThrow("liveblocks down")

    expect(interpretDesignPromptMock).not.toHaveBeenCalled()
    expect(clearDesignAgentPresenceMock).toHaveBeenCalledWith("room-1")
  })

  it("broadcasts an error status, clears presence, and rethrows when applying actions fails", async () => {
    interpretDesignPromptMock.mockResolvedValue([{ kind: "deleteNode", nodeId: "n1" }])
    applyDesignAgentActionsMock.mockRejectedValue(new Error("mutateStorage failed"))

    await expect(runDesignAgent({ prompt: "p", roomId: "room-1" })).rejects.toThrow("mutateStorage failed")

    expect(clearDesignAgentPresenceMock).toHaveBeenCalledWith("room-1")
    const errorCall = broadcastDesignAgentStatusMock.mock.calls.find(
      (call: unknown[]) => (call[1] as { stage: string }).stage === "error",
    )
    expect(errorCall).toBeDefined()
  })

  it("does not let a failure while broadcasting the error status itself mask the original error", async () => {
    interpretDesignPromptMock.mockRejectedValue(new Error("original failure"))
    broadcastDesignAgentStatusMock.mockImplementation(async (_roomId: string, message: { stage: string }) => {
      if (message.stage === "error") {
        throw new Error("broadcast also failed")
      }
    })

    await expect(runDesignAgent({ prompt: "p", roomId: "room-1" })).rejects.toThrow("original failure")
    expect(clearDesignAgentPresenceMock).toHaveBeenCalledWith("room-1")
  })

  it("does not let a failure while clearing presence itself mask the original error", async () => {
    interpretDesignPromptMock.mockRejectedValue(new Error("original failure"))
    clearDesignAgentPresenceMock.mockRejectedValue(new Error("presence clear also failed"))

    await expect(runDesignAgent({ prompt: "p", roomId: "room-1" })).rejects.toThrow("original failure")
  })

  it("still clears presence when the run succeeds with zero actions", async () => {
    interpretDesignPromptMock.mockResolvedValue([])

    await runDesignAgent({ prompt: "p", roomId: "room-1" })

    expect(applyDesignAgentActionsMock).toHaveBeenCalledWith("room-1", [])
    expect(clearDesignAgentPresenceMock).toHaveBeenCalledWith("room-1")
  })
})

describe("designAgentTask", () => {
  it("is registered with the expected task id and the exported run function", () => {
    expect(taskRegistrationCall).toEqual({ id: DESIGN_AGENT_TASK_ID, run: runDesignAgent })
    expect(designAgentTask.id).toBe(DESIGN_AGENT_TASK_ID)
  })

  it("exports a callable task with a stable, human-readable id", () => {
    expect(DESIGN_AGENT_TASK_ID).toBe("design-agent")
  })
})
