import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-response"
import { getCallerIdentity, getProjectAccess, type ProjectAccessResult } from "@/lib/project-access"
import { triggerGenerateSpec } from "@/lib/trigger"
import { checkAiRateLimit, rateLimitErrorResponse } from "@/lib/rate-limit"
import { AiChatMessageSchema } from "@/types/tasks"
import { GenerateSpecGraphNodeSchema, GenerateSpecGraphEdgeSchema } from "@/trigger/generate-spec"

/**
 * Maps a failed `getProjectAccess` result to this repo's standard error
 * envelope, preserving the 401/404/403 precedence every other project route
 * already follows (identical to `app/api/ai/design/route.ts`).
 */
function accessErrorResponse(access: Extract<ProjectAccessResult, { ok: false }>) {
  if (access.reason === "unauthenticated") {
    return errorResponse("Unauthorized", 401)
  }
  if (access.reason === "not-found") {
    return errorResponse("Project not found", 404)
  }
  return errorResponse("Forbidden", 403)
}

/**
 * Request body shape: `{ roomId, chatHistory, nodes, edges }` only — no
 * `projectId` field is accepted from the client anywhere in this route
 * (acceptance criterion 1). Reuses the exact same `nodes`/`edges` Zod
 * schemas the `generate-spec` task itself validates against
 * (`trigger/generate-spec.ts`), so the request-body contract and the task's
 * own payload contract can never silently drift apart.
 */
const SpecRequestBodySchema = z.object({
  roomId: z.string().min(1),
  chatHistory: z.array(AiChatMessageSchema),
  nodes: z.array(GenerateSpecGraphNodeSchema),
  edges: z.array(GenerateSpecGraphEdgeSchema),
})

/**
 * POST /api/ai/spec — triggers the `generate-spec` background task
 * (`trigger/generate-spec.ts`) and records the run in Prisma. Structurally
 * parallel to `app/api/ai/design/route.ts` (spec 22), per spec 27's Analyst
 * Brief.
 *
 * Owner-or-collaborator access (`getProjectAccess`), same gate as
 * `/api/ai/design`.
 *
 * `roomId` is the only project-identifying field ever read from the request
 * body. The task's own `projectId` field is populated from this same
 * already-access-checked `roomId` — never from anything a client separately
 * claims (this spec's explicit Scope Limit: "Do not derive access from
 * client-provided project IDs", acceptance criterion 1).
 *
 * Failure precedence: 401 unauthenticated -> 400 malformed body -> 404/403
 * via `getProjectAccess` -> 429 rate limited (spec 31) -> 502 upstream
 * Trigger.dev failure -> 500 Prisma write failure. Auth is checked before
 * body parsing, matching `/api/ai/design`'s own precedent.
 */
export async function POST(request: NextRequest) {
  const identity = await getCallerIdentity()
  if (!identity) {
    return errorResponse("Unauthorized", 401)
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return errorResponse("Invalid JSON body", 400)
  }

  const parseResult = SpecRequestBodySchema.safeParse(json)
  if (!parseResult.success) {
    return errorResponse("roomId, chatHistory, nodes, and edges are required", 400)
  }
  const body = parseResult.data

  const access = await getProjectAccess(body.roomId)
  if (!access.ok) {
    return accessErrorResponse(access)
  }

  const rateLimit = await checkAiRateLimit(identity.userId)
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit.retryAfterSeconds)
  }

  let triggeredRun
  try {
    triggeredRun = await triggerGenerateSpec({
      projectId: body.roomId,
      roomId: body.roomId,
      chatHistory: body.chatHistory,
      nodes: body.nodes,
      edges: body.edges,
    })
  } catch (error) {
    console.error("Failed to trigger the generate-spec task", error)
    return errorResponse("Failed to start spec generation", 502)
  }

  try {
    await prisma.taskRun.create({
      data: {
        runId: triggeredRun.runId,
        projectId: body.roomId,
        userId: identity.userId,
      },
    })
  } catch (error) {
    console.error(`Failed to record TaskRun ${triggeredRun.runId}`, error)
    return errorResponse("Failed to record the spec generation run", 500)
  }

  return NextResponse.json({ runId: triggeredRun.runId })
}
