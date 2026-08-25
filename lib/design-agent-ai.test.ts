import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { DesignAgentGraphSummary } from "@/lib/design-agent-ai"
import { interpretDesignPrompt } from "@/lib/design-agent-ai"

type GlobalWithGemini = typeof globalThis & { googleProvider?: unknown }
function clearCachedProvider() {
  delete (globalThis as GlobalWithGemini).googleProvider
}

type ValidateResult = { success: true; value: unknown } | { success: false; error: Error }
interface MockSchema {
  validate: (value: unknown) => Promise<ValidateResult> | ValidateResult
}
interface MockGenerateObjectArgs {
  model: unknown
  schema: MockSchema
  prompt: string
}

const { createGoogleGenerativeAIMock, generateObjectMock, providerFnMock } = vi.hoisted(() => {
  const providerFnMock = vi.fn((modelId: string) => ({ modelId }))
  return {
    createGoogleGenerativeAIMock: vi.fn(() => providerFnMock),
    generateObjectMock: vi.fn(),
    providerFnMock,
  }
})

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: createGoogleGenerativeAIMock,
}))

// Only `generateObject` is mocked — `jsonSchema` stays the real
// implementation from `ai`, so the `validate` callback wired into it in
// `lib/design-agent-ai.ts` (the module's actual authoritative per-kind
// validation gate) is genuinely exercised by tests below that call
// `schema.validate(...)` from inside their `generateObjectMock`
// implementation, not bypassed by a stub. This is a single, top-level
// (not per-test) mock of a real, moderately heavy package — re-importing
// it fresh via `vi.resetModules()` on every single test proved slow enough
// to intermittently exceed vitest's default per-test timeout and let one
// test's still-in-flight dynamic import leak into a later test; a single
// shared module instance plus resetting only the mutable state the module
// itself caches (`globalThis.googleProvider`, below) avoids that entirely.
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return { ...actual, generateObject: generateObjectMock }
})

async function runValidate(raw: unknown): Promise<{ object: unknown }> {
  return { object: raw }
}

/** Wires `generateObjectMock` to run the given raw value through the real schema's `validate`, throwing if it fails — mirroring the real `ai` package's own contract. */
function mockGenerateObjectWith(raw: unknown) {
  generateObjectMock.mockImplementation(async (args: unknown) => {
    const { schema } = args as MockGenerateObjectArgs
    const result = await schema.validate(raw)
    if (!result.success) throw result.error
    return runValidate(result.value)
  })
}

const EMPTY_GRAPH: DesignAgentGraphSummary = { nodes: [], edges: [] }

describe("interpretDesignPrompt", () => {
  const originalKey = process.env.GEMINI_API_KEY

  beforeEach(() => {
    clearCachedProvider()
    vi.clearAllMocks()
    process.env.GEMINI_API_KEY = "test-gemini-key"
  })

  afterEach(() => {
    clearCachedProvider()
    if (originalKey === undefined) {
      delete process.env.GEMINI_API_KEY
    } else {
      process.env.GEMINI_API_KEY = originalKey
    }
  })

  it("throws a handled error when GEMINI_API_KEY is not set, without calling the provider", async () => {
    delete process.env.GEMINI_API_KEY

    await expect(interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })).rejects.toThrow(
      /GEMINI_API_KEY/,
    )
    expect(createGoogleGenerativeAIMock).not.toHaveBeenCalled()
    expect(generateObjectMock).not.toHaveBeenCalled()
  })

  it("instantiates the Google provider once (lazily, cached) and calls generateObject with the model/schema/prompt", async () => {
    generateObjectMock.mockResolvedValue({ object: { actions: [], summary: "No changes made." } })

    await interpretDesignPrompt({ prompt: "design a checkout flow", currentGraph: EMPTY_GRAPH })
    await interpretDesignPrompt({ prompt: "add a database", currentGraph: EMPTY_GRAPH })

    expect(createGoogleGenerativeAIMock).toHaveBeenCalledTimes(1)
    expect(createGoogleGenerativeAIMock).toHaveBeenCalledWith({ apiKey: "test-gemini-key" })
    expect(providerFnMock).toHaveBeenCalledWith("gemini-3.6-flash")

    const call = generateObjectMock.mock.calls[0][0] as MockGenerateObjectArgs
    expect(call.model).toEqual({ modelId: "gemini-3.6-flash" })
    expect(call.prompt).toContain("design a checkout flow")
    expect(typeof call.schema.validate).toBe("function")
  })

  it("includes the summary instruction (asking for a grounded summary and a critique-mode instruction) in the prompt text", async () => {
    generateObjectMock.mockResolvedValue({ object: { actions: [], summary: "No changes made." } })

    await interpretDesignPrompt({ prompt: "review this design", currentGraph: EMPTY_GRAPH })

    const call = generateObjectMock.mock.calls[0][0] as MockGenerateObjectArgs
    expect(call.prompt).toMatch(/summary/i)
    expect(call.prompt).toMatch(/critique/i)
  })

  it("returns an empty action list plus the model's summary when Gemini produces no actions", async () => {
    mockGenerateObjectWith({ actions: [], summary: "No changes were needed." })

    const result = await interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })
    expect(result).toEqual({ actions: [], summary: "No changes were needed." })
  })

  it("rejects a response missing the summary field", async () => {
    mockGenerateObjectWith({ actions: [] })

    await expect(interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })).rejects.toThrow()
  })

  it("rejects a response with an empty-string summary", async () => {
    mockGenerateObjectWith({ actions: [], summary: "" })

    await expect(interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })).rejects.toThrow()
  })

  it("rejects a response with a non-string summary", async () => {
    mockGenerateObjectWith({ actions: [], summary: 42 })

    await expect(interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })).rejects.toThrow()
  })

  it("propagates a real validation failure (a nearly-empty raw action) as a thrown error", async () => {
    mockGenerateObjectWith({ actions: [{ kind: "addNode" }] })

    await expect(interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })).rejects.toThrow()
  })

  it("rejects a response whose action kind is not one of the 7 recognized kinds", async () => {
    mockGenerateObjectWith({ actions: [{ kind: "clearCanvas" }] })

    await expect(interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })).rejects.toThrow()
  })

  it("rejects an addNode action with a shape or colorName outside the real vocabularies", async () => {
    mockGenerateObjectWith({
      actions: [{ kind: "addNode", nodeId: "n1", shape: "triangle", colorName: "neutral", label: "X", x: 0, y: 0 }],
    })

    await expect(interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })).rejects.toThrow()
  })

  it("normalizes a valid addNode action: real generated ID, SHAPE_DEFAULT_SIZES size, and the exact NODE_COLORS pair for the chosen color name", async () => {
    mockGenerateObjectWith({
      actions: [{ kind: "addNode", nodeId: "local-1", shape: "circle", colorName: "blue", label: "Cache", x: 50, y: 60 }],
      summary: "Added a cache node.",
    })

    const { actions, summary } = await interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })
    const [action] = actions

    expect(summary).toBe("Added a cache node.")
    expect(action).toMatchObject({
      kind: "addNode",
      shape: "circle",
      label: "Cache",
      color: "#10233D",
      textColor: "#52A8FF",
      width: 80,
      height: 80,
      x: 50,
      y: 60,
    })
    expect(action).toHaveProperty("nodeId")
    expect((action as { nodeId: string }).nodeId).not.toBe("local-1")
  })

  it("resolves an addEdge action's local source/target IDs to the real IDs generated by earlier addNode actions in the same batch", async () => {
    mockGenerateObjectWith({
      actions: [
        { kind: "addNode", nodeId: "local-a", shape: "rectangle", colorName: "neutral", label: "A", x: 0, y: 0 },
        { kind: "addNode", nodeId: "local-b", shape: "rectangle", colorName: "neutral", label: "B", x: 300, y: 0 },
        { kind: "addEdge", edgeId: "local-edge", sourceNodeId: "local-a", targetNodeId: "local-b", label: "calls" },
      ],
      summary: "Connected A to B.",
    })

    const { actions } = await interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })
    const [nodeA, nodeB, edge] = actions as Array<
      { kind: string; nodeId?: string; sourceNodeId?: string; targetNodeId?: string; label?: string }
    >

    expect(edge.sourceNodeId).toBe(nodeA.nodeId)
    expect(edge.targetNodeId).toBe(nodeB.nodeId)
    expect(edge.label).toBe("calls")
  })

  it("drops an addEdge action referencing a node ID that doesn't exist in the current graph and wasn't added this batch", async () => {
    mockGenerateObjectWith({
      actions: [{ kind: "addEdge", edgeId: "e1", sourceNodeId: "ghost-node", targetNodeId: "also-ghost" }],
      summary: "No valid edge to add.",
    })

    const { actions } = await interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })
    expect(actions).toEqual([])
  })

  it("resolves moveNode/resizeNode/deleteNode/deleteEdge against real IDs already present in the current graph", async () => {
    const currentGraph: DesignAgentGraphSummary = {
      nodes: [{ id: "existing-node", label: "Existing", shape: "rectangle", x: 0, y: 0 }],
      edges: [{ id: "existing-edge", sourceNodeId: "existing-node", targetNodeId: "existing-node" }],
    }
    mockGenerateObjectWith({
      actions: [
        { kind: "moveNode", nodeId: "existing-node", x: 10, y: 20 },
        { kind: "resizeNode", nodeId: "existing-node", width: 200, height: 100 },
        { kind: "deleteEdge", edgeId: "existing-edge" },
        { kind: "deleteNode", nodeId: "existing-node" },
      ],
      summary: "Moved, resized, and then removed the existing node and edge.",
    })

    const { actions } = await interpretDesignPrompt({ prompt: "p", currentGraph })

    expect(actions).toEqual([
      { kind: "moveNode", nodeId: "existing-node", x: 10, y: 20 },
      { kind: "resizeNode", nodeId: "existing-node", width: 200, height: 100 },
      { kind: "deleteEdge", edgeId: "existing-edge" },
      { kind: "deleteNode", nodeId: "existing-node" },
    ])
  })

  it("drops a moveNode/resizeNode/deleteNode action referencing an ID unknown to both the current graph and this batch", async () => {
    mockGenerateObjectWith({
      actions: [
        { kind: "moveNode", nodeId: "ghost", x: 1, y: 2 },
        { kind: "resizeNode", nodeId: "ghost", width: 100, height: 100 },
        { kind: "deleteNode", nodeId: "ghost" },
      ],
      summary: "No valid targets found.",
    })

    const { actions } = await interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })
    expect(actions).toEqual([])
  })

  it("clamps a resizeNode action's dimensions to at least NODE_MIN_SIZE", async () => {
    const currentGraph: DesignAgentGraphSummary = {
      nodes: [{ id: "n1", label: "N1", shape: "rectangle", x: 0, y: 0 }],
      edges: [],
    }
    mockGenerateObjectWith({
      actions: [{ kind: "resizeNode", nodeId: "n1", width: 5, height: 5 }],
      summary: "Resized the node.",
    })

    const { actions } = await interpretDesignPrompt({ prompt: "p", currentGraph })
    const [action] = actions
    expect(action).toEqual({ kind: "resizeNode", nodeId: "n1", width: 40, height: 40 })
  })

  it("normalizes an updateNodeData action with only a label, and separately one with only a colorName", async () => {
    const currentGraph: DesignAgentGraphSummary = {
      nodes: [{ id: "n1", label: "N1", shape: "rectangle", x: 0, y: 0 }],
      edges: [],
    }
    mockGenerateObjectWith({
      actions: [
        { kind: "updateNodeData", nodeId: "n1", label: "Renamed" },
        { kind: "updateNodeData", nodeId: "n1", colorName: "red" },
      ],
      summary: "Updated the node's label and color.",
    })

    const { actions } = await interpretDesignPrompt({ prompt: "p", currentGraph })

    expect(actions[0]).toEqual({ kind: "updateNodeData", nodeId: "n1", label: "Renamed" })
    expect(actions[1]).toEqual({ kind: "updateNodeData", nodeId: "n1", color: "#3C1618", textColor: "#FF6166" })
  })

  it("rejects an updateNodeData action with neither a label nor a colorName", async () => {
    mockGenerateObjectWith({ actions: [{ kind: "updateNodeData", nodeId: "n1" }] })

    await expect(interpretDesignPrompt({ prompt: "p", currentGraph: EMPTY_GRAPH })).rejects.toThrow()
  })
})
