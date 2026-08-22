import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { triggerMock, createPublicTokenMock } = vi.hoisted(() => ({
  triggerMock: vi.fn(),
  createPublicTokenMock: vi.fn(),
}))

vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: triggerMock },
  auth: { createPublicToken: createPublicTokenMock },
}))

vi.mock("@/trigger/design-agent", () => ({
  DESIGN_AGENT_TASK_ID: "design-agent",
}))

vi.mock("@/trigger/generate-spec", () => ({
  GENERATE_SPEC_TASK_ID: "generate-spec",
}))

import { createRunToken, triggerDesignAgent, triggerGenerateSpec } from "./trigger"

describe("triggerDesignAgent / triggerGenerateSpec / createRunToken", () => {
  const originalKey = process.env.TRIGGER_SECRET_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TRIGGER_SECRET_KEY = "test-secret"
  })

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.TRIGGER_SECRET_KEY
    } else {
      process.env.TRIGGER_SECRET_KEY = originalKey
    }
  })

  describe("triggerDesignAgent", () => {
    it("throws a handled error when TRIGGER_SECRET_KEY is not set", async () => {
      delete process.env.TRIGGER_SECRET_KEY

      await expect(triggerDesignAgent({ prompt: "p", roomId: "r1" })).rejects.toThrow(
        /TRIGGER_SECRET_KEY/,
      )
      expect(triggerMock).not.toHaveBeenCalled()
    })

    it("triggers the design-agent task by id and returns the run's id", async () => {
      triggerMock.mockResolvedValue({ id: "run_123" })

      const result = await triggerDesignAgent({ prompt: "design it", roomId: "room-1" })

      expect(result).toEqual({ runId: "run_123" })
      expect(triggerMock).toHaveBeenCalledWith("design-agent", {
        prompt: "design it",
        roomId: "room-1",
      })
    })

    it("propagates a genuine upstream trigger failure rather than swallowing it", async () => {
      triggerMock.mockRejectedValue(new Error("trigger.dev down"))

      await expect(triggerDesignAgent({ prompt: "p", roomId: "r1" })).rejects.toThrow(
        "trigger.dev down",
      )
    })
  })

  describe("triggerGenerateSpec", () => {
    const payload = {
      projectId: "room-1",
      roomId: "room-1",
      chatHistory: [],
      nodes: [],
      edges: [],
    }

    it("throws a handled error when TRIGGER_SECRET_KEY is not set", async () => {
      delete process.env.TRIGGER_SECRET_KEY

      await expect(triggerGenerateSpec(payload)).rejects.toThrow(/TRIGGER_SECRET_KEY/)
      expect(triggerMock).not.toHaveBeenCalled()
    })

    it("triggers the generate-spec task by id and returns the run's id", async () => {
      triggerMock.mockResolvedValue({ id: "run_456" })

      const result = await triggerGenerateSpec(payload)

      expect(result).toEqual({ runId: "run_456" })
      expect(triggerMock).toHaveBeenCalledWith("generate-spec", payload)
    })

    it("propagates a genuine upstream trigger failure rather than swallowing it", async () => {
      triggerMock.mockRejectedValue(new Error("trigger.dev down"))

      await expect(triggerGenerateSpec(payload)).rejects.toThrow("trigger.dev down")
    })
  })

  describe("createRunToken", () => {
    it("throws a handled error when TRIGGER_SECRET_KEY is not set", async () => {
      delete process.env.TRIGGER_SECRET_KEY

      await expect(createRunToken("run_123")).rejects.toThrow(/TRIGGER_SECRET_KEY/)
      expect(createPublicTokenMock).not.toHaveBeenCalled()
    })

    it("issues a public token scoped to only the given run, with a 1-hour expiration", async () => {
      createPublicTokenMock.mockResolvedValue("pk_run_scoped_token")

      const token = await createRunToken("run_123")

      expect(token).toBe("pk_run_scoped_token")
      expect(createPublicTokenMock).toHaveBeenCalledWith({
        scopes: { read: { runs: ["run_123"] } },
        expirationTime: "1h",
      })
    })

    it("issues an equally-scoped token for a generate-spec run's runId (task-agnostic)", async () => {
      createPublicTokenMock.mockResolvedValue("pk_spec_run_token")

      const token = await createRunToken("run_spec_456")

      expect(token).toBe("pk_spec_run_token")
      expect(createPublicTokenMock).toHaveBeenCalledWith({
        scopes: { read: { runs: ["run_spec_456"] } },
        expirationTime: "1h",
      })
    })

    it("propagates a genuine upstream token-creation failure rather than swallowing it", async () => {
      createPublicTokenMock.mockRejectedValue(new Error("trigger.dev down"))

      await expect(createRunToken("run_123")).rejects.toThrow("trigger.dev down")
    })
  })
})
