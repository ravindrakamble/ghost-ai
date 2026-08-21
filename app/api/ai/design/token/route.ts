import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-response"
import { getCallerIdentity } from "@/lib/project-access"
import { createDesignRunToken } from "@/lib/trigger"

interface TokenRequestBody {
  runId?: unknown
}

interface ValidTokenRequestBody {
  runId: string
}

function isValidTokenRequestBody(body: TokenRequestBody): body is ValidTokenRequestBody {
  return typeof body.runId === "string" && body.runId.trim().length > 0
}

/**
 * POST /api/ai/design/token — issues a Trigger.dev public token scoped to a
 * single run, given its `runId`.
 *
 * Ownership check is against `TaskRun.userId` specifically (spec 22's
 * Analyst Brief, Open Questions #5) — not a broader project-membership
 * re-check — so another collaborator on the same project cannot grab a
 * token for someone else's in-flight run.
 *
 * Failure precedence: 401 unauthenticated -> 400 malformed body -> 404
 * unknown `runId` -> 403 `runId` exists but belongs to a different caller ->
 * 502 upstream Trigger.dev failure.
 */
export async function POST(request: NextRequest) {
  const identity = await getCallerIdentity()
  if (!identity) {
    return errorResponse("Unauthorized", 401)
  }

  let body: TokenRequestBody
  try {
    body = (await request.json()) as TokenRequestBody
  } catch {
    return errorResponse("Invalid JSON body", 400)
  }

  if (!isValidTokenRequestBody(body)) {
    return errorResponse("A `runId` is required", 400)
  }

  const taskRun = await prisma.taskRun.findUnique({ where: { runId: body.runId } })
  if (!taskRun) {
    return errorResponse("Run not found", 404)
  }

  if (taskRun.userId !== identity.userId) {
    return errorResponse("Forbidden", 403)
  }

  let token: string
  try {
    token = await createDesignRunToken(taskRun.runId)
  } catch (error) {
    console.error(`Failed to create a design run token for run ${taskRun.runId}`, error)
    return errorResponse("Failed to issue a run token", 502)
  }

  return NextResponse.json({ token })
}
