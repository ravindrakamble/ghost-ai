import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { generateText } from "ai"
import type { AiChatMessage } from "@/types/tasks"

/**
 * Gemini-backed generation of a Markdown technical spec from the current
 * canvas graph plus chat history, per spec 27's Analyst Brief.
 *
 * Uses the `ai` package's `generateText` — not `generateObject` +
 * `jsonSchema()` like `lib/design-agent-ai.ts` — because this module's output
 * is free-form Markdown, not a bounded, structured action list (the raw spec
 * text's own "keep the task output as plain Markdown" instruction; brief's
 * Open Questions #3). No schema is enforced on the model's response shape;
 * the model's raw text is returned as-is.
 *
 * Otherwise mirrors `lib/design-agent-ai.ts`'s lazy-provider-instantiation
 * pattern exactly (same `GEMINI_MODEL_ID`, a `globalThis`-cached
 * `createGoogleGenerativeAI` provider, `requireGeminiApiKey`) — per this
 * spec's own explicit Scope Limit against introducing a new AI provider
 * abstraction (acceptance criterion 9). Uses a distinct `globalThis` cache
 * key from `lib/design-agent-ai.ts` (`specGenGoogleProvider`, not
 * `googleProvider`) so the two modules' lazily-instantiated providers stay
 * independently testable/resettable, even though both would resolve to an
 * equivalent provider instance in a real process sharing one
 * `GEMINI_API_KEY`.
 */

const GEMINI_MODEL_ID = "gemini-3.6-flash"

const globalForGemini = globalThis as unknown as {
  specGenGoogleProvider?: ReturnType<typeof createGoogleGenerativeAI>
}

function requireGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to the environment to generate a spec with Gemini.",
    )
  }
  return key
}

/**
 * Lazily instantiated, cached per process — same posture as
 * `lib/design-agent-ai.ts#getGoogleProvider`/`lib/liveblocks.ts`, so a
 * missing `GEMINI_API_KEY` only ever surfaces as a handled error from the one
 * task that actually calls Gemini, not at module import time (`next build`'s
 * page-data collection merely imports route modules, it never invokes this).
 */
function getGoogleProvider(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!globalForGemini.specGenGoogleProvider) {
    globalForGemini.specGenGoogleProvider = createGoogleGenerativeAI({ apiKey: requireGeminiApiKey() })
  }
  return globalForGemini.specGenGoogleProvider
}

/**
 * Narrow, structural summary of a canvas node/edge sufficient for prompting
 * the model to write a spec — not a 1:1 Zod/TypeScript replica of
 * `types/canvas.ts`'s full `CanvasNode`/`CanvasEdge` (`@xyflow/react` `Node`/
 * `Edge` generics carry several fields, e.g. `width`/`height`/`selected`,
 * irrelevant to summarizing a graph for Markdown generation). Mirrors
 * `lib/design-agent-ai.ts`'s own `DesignAgentGraphNode`/`DesignAgentGraphEdge`
 * summary types, which already take exactly this approach against the same
 * underlying shapes. See spec 27's Analyst Brief, Open Questions #2.
 */
export interface GenerateSpecGraphNode {
  id: string
  label: string
  shape: string
  x: number
  y: number
}

export interface GenerateSpecGraphEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  label?: string
}

/**
 * Input to `generateSpecMarkdown`: the room's chat history (reusing
 * `AiChatMessage[]` unmodified, per Open Questions #7 — this spec does not
 * change `types/tasks.ts`) plus the narrow node/edge graph summary above.
 */
export interface GenerateSpecInput {
  chatHistory: AiChatMessage[]
  nodes: GenerateSpecGraphNode[]
  edges: GenerateSpecGraphEdge[]
}

function formatChatHistory(chatHistory: AiChatMessage[]): string {
  if (chatHistory.length === 0) {
    return "(no chat history yet)"
  }
  return chatHistory.map((message) => `${message.sender} (${message.role}): ${message.content}`).join("\n")
}

function buildPrompt(input: GenerateSpecInput): string {
  return [
    "You are Ghost AI, a system-design assistant. Write a Markdown technical specification for the software architecture diagram described below, informed by the team's chat discussion.",
    `The diagram has these nodes/components: ${JSON.stringify(input.nodes)}`,
    `and these edges/connections between them: ${JSON.stringify(input.edges)}`,
    `The project's chat history so far:\n${formatChatHistory(input.chatHistory)}`,
    "Produce a complete Markdown technical spec covering: an overview, the components shown in the diagram, how they connect and interact, and any relevant implementation notes drawn from the chat discussion.",
    "If the diagram has no nodes and there is no meaningful chat history, still produce a short Markdown document noting that the canvas is currently empty and inviting the team to add content before regenerating.",
    "Respond with the Markdown document only — no commentary before or after it, and do not wrap the whole response in a code fence.",
  ].join("\n\n")
}

/**
 * Calls Gemini to turn the current chat history and canvas graph into a
 * Markdown technical spec (acceptance criteria 6, 9). Returns the model's
 * raw text — no persistence, no parsing into a structured shape; this
 * module's only job is turning context into Markdown (this spec's own Scope
 * Limit: "Do not store the final spec in this unit").
 */
export async function generateSpecMarkdown(input: GenerateSpecInput): Promise<string> {
  const provider = getGoogleProvider()

  const { text } = await generateText({
    model: provider(GEMINI_MODEL_ID),
    prompt: buildPrompt(input),
    // Same lesson learned live-verified in spec 23 (`context/spec-status/23-
    // design-agent-logic.md`'s Post-PASS section): gemini-3.6-flash reasons
    // before producing its response, and a low/zero token budget truncates
    // the output before it completes. A generous budget here matters even
    // more than for spec 23's bounded JSON action list, since a full
    // Markdown technical spec is comparatively long-form output.
    maxOutputTokens: 8192,
  })

  return text
}

/**
 * Input to `generateIacSkeleton`: just the graph, per spec 35's Analyst
 * Brief — no chat history is involved in Terraform generation, unlike
 * `generateSpecMarkdown`'s `GenerateSpecInput`.
 */
export interface GenerateIacInput {
  nodes: GenerateSpecGraphNode[]
  edges: GenerateSpecGraphEdge[]
}

/**
 * Mirrors `buildPrompt` above, but instructs the model to emit a Terraform
 * skeleton instead of a Markdown spec — per spec 35's Analyst Brief, Concrete
 * deliverables. Plain text only (no code fence wrapper, no explanatory
 * prose), since the download route serves this as `text/plain`, not
 * Markdown. No real provider credentials or apply-ready state — an inferred,
 * plausible resource type per node, a starting skeleton only.
 */
function buildIacPrompt(input: GenerateIacInput): string {
  return [
    "You are Ghost AI, a system-design assistant. Write a Terraform (HCL) skeleton that represents the infrastructure implied by the software architecture diagram described below.",
    `The diagram has these nodes/components: ${JSON.stringify(input.nodes)}`,
    `and these edges/connections between them: ${JSON.stringify(input.edges)}`,
    "For each node, infer a plausible Terraform resource type from its label and shape (e.g. a node labeled \"API Gateway\" might become an API gateway resource, a node labeled \"Database\" might become a database resource) and emit a corresponding resource block with a reasonable name and a few representative arguments.",
    "This is a starting skeleton only, not production-ready infrastructure-as-code: do not include real provider credentials, do not assume any specific cloud provider unless a node's label makes one obvious, and do not produce apply-ready state.",
    "If the diagram has no nodes, still produce a short Terraform comment (using # or //) noting that the canvas is currently empty and inviting the team to add content before regenerating.",
    "Respond with the Terraform (HCL) content only — no commentary before or after it, and do not wrap the response in a Markdown code fence.",
  ].join("\n\n")
}

/**
 * Calls Gemini to turn the current canvas graph into a Terraform skeleton
 * (spec 35's Analyst Brief). Mirrors `generateSpecMarkdown` exactly: the
 * same cached lazy Gemini provider, the same single `generateText` call, the
 * same `maxOutputTokens: 8192` budget, no retry logic — a failure is a
 * thrown error, propagated as-is. Returns the model's raw text, no parsing.
 */
export async function generateIacSkeleton(input: GenerateIacInput): Promise<string> {
  const provider = getGoogleProvider()

  const { text } = await generateText({
    model: provider(GEMINI_MODEL_ID),
    prompt: buildIacPrompt(input),
    maxOutputTokens: 8192,
  })

  return text
}
