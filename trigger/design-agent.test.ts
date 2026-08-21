import { describe, it, expect, vi, beforeEach } from "vitest"

const { taskMock, loggerLogMock } = vi.hoisted(() => ({
  taskMock: vi.fn((options: { id: string; run: unknown }) => options),
  loggerLogMock: vi.fn(),
}))

vi.mock("@trigger.dev/sdk", () => ({
  task: taskMock,
  logger: { log: loggerLogMock },
}))

import { DESIGN_AGENT_TASK_ID, designAgentTask, runDesignAgent } from "./design-agent"

// `task(...)` is only ever called once, at module import time (module-scope
// `const designAgentTask = task({...})`) — captured here, before any test's
// `beforeEach` clears the mock's call history, so the registration itself
// stays assertable.
const taskRegistrationCall = taskMock.mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
})

describe("runDesignAgent", () => {
  it("logs the payload and echoes it back, performing no AI/canvas/Liveblocks work", async () => {
    const payload = { prompt: "design a checkout flow", roomId: "room-1" }

    const result = await runDesignAgent(payload)

    expect(result).toEqual({ received: true, prompt: payload.prompt, roomId: payload.roomId })
    expect(loggerLogMock).toHaveBeenCalledWith(
      "design-agent task received payload",
      expect.objectContaining({ prompt: payload.prompt, roomId: payload.roomId }),
    )
  })

  it("echoes an empty-string prompt/roomId as-is (no validation performed here — that is the route's job)", async () => {
    const payload = { prompt: "", roomId: "" }

    const result = await runDesignAgent(payload)

    expect(result).toEqual({ received: true, prompt: "", roomId: "" })
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
