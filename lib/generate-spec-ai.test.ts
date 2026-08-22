import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { GenerateSpecInput } from "@/lib/generate-spec-ai"
import { generateSpecMarkdown } from "@/lib/generate-spec-ai"
import type { AiChatMessage } from "@/types/tasks"

type GlobalWithGemini = typeof globalThis & { specGenGoogleProvider?: unknown }
function clearCachedProvider() {
  delete (globalThis as GlobalWithGemini).specGenGoogleProvider
}

interface MockGenerateTextArgs {
  model: unknown
  prompt: string
  maxOutputTokens?: number
}

const { createGoogleGenerativeAIMock, generateTextMock, providerFnMock } = vi.hoisted(() => {
  const providerFnMock = vi.fn((modelId: string) => ({ modelId }))
  return {
    createGoogleGenerativeAIMock: vi.fn(() => providerFnMock),
    generateTextMock: vi.fn(),
    providerFnMock,
  }
})

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: createGoogleGenerativeAIMock,
}))

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return { ...actual, generateText: generateTextMock }
})

const EMPTY_INPUT: GenerateSpecInput = { chatHistory: [], nodes: [], edges: [] }

describe("generateSpecMarkdown", () => {
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

    await expect(generateSpecMarkdown(EMPTY_INPUT)).rejects.toThrow(/GEMINI_API_KEY/)
    expect(createGoogleGenerativeAIMock).not.toHaveBeenCalled()
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it("instantiates the Google provider once (lazily, cached) and calls generateText with the model/prompt", async () => {
    generateTextMock.mockResolvedValue({ text: "# Spec\n\nSome content." })

    await generateSpecMarkdown(EMPTY_INPUT)
    await generateSpecMarkdown(EMPTY_INPUT)

    expect(createGoogleGenerativeAIMock).toHaveBeenCalledTimes(1)
    expect(createGoogleGenerativeAIMock).toHaveBeenCalledWith({ apiKey: "test-gemini-key" })
    expect(providerFnMock).toHaveBeenCalledWith("gemini-3.6-flash")

    const call = generateTextMock.mock.calls[0][0] as MockGenerateTextArgs
    expect(call.model).toEqual({ modelId: "gemini-3.6-flash" })
    expect(call.maxOutputTokens).toBe(8192)
  })

  it("returns Gemini's raw text output unmodified", async () => {
    generateTextMock.mockResolvedValue({ text: "# Checkout Service Spec\n\nDetails here." })

    const result = await generateSpecMarkdown(EMPTY_INPUT)

    expect(result).toBe("# Checkout Service Spec\n\nDetails here.")
  })

  it("includes the node/edge graph summary in the prompt", async () => {
    generateTextMock.mockResolvedValue({ text: "spec" })

    const input: GenerateSpecInput = {
      chatHistory: [],
      nodes: [{ id: "n1", label: "API Gateway", shape: "hexagon", x: 0, y: 0 }],
      edges: [{ id: "e1", sourceNodeId: "n1", targetNodeId: "n1", label: "self" }],
    }

    await generateSpecMarkdown(input)

    const call = generateTextMock.mock.calls[0][0] as MockGenerateTextArgs
    expect(call.prompt).toContain("API Gateway")
    expect(call.prompt).toContain("hexagon")
    expect(call.prompt).toContain("e1")
  })

  it("includes the chat history, formatted per sender/role/content, in the prompt", async () => {
    generateTextMock.mockResolvedValue({ text: "spec" })

    const chatHistory: AiChatMessage[] = [
      { id: "m1", sender: "Alice", role: "user", content: "Add a queue between the two services", timestamp: 1 },
    ]

    await generateSpecMarkdown({ chatHistory, nodes: [], edges: [] })

    const call = generateTextMock.mock.calls[0][0] as MockGenerateTextArgs
    expect(call.prompt).toContain("Alice")
    expect(call.prompt).toContain("Add a queue between the two services")
  })

  it("notes an empty chat history distinctly in the prompt rather than omitting the section", async () => {
    generateTextMock.mockResolvedValue({ text: "spec" })

    await generateSpecMarkdown(EMPTY_INPUT)

    const call = generateTextMock.mock.calls[0][0] as MockGenerateTextArgs
    expect(call.prompt).toContain("no chat history yet")
  })

  it("propagates a genuine upstream Gemini failure rather than swallowing it", async () => {
    generateTextMock.mockRejectedValue(new Error("gemini down"))

    await expect(generateSpecMarkdown(EMPTY_INPUT)).rejects.toThrow("gemini down")
  })
})
