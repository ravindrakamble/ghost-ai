import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-response"
import { getCallerIdentity } from "@/lib/project-access"
import { createRunToken } from "@/lib/trigger"

const TokenRequestBodySchema = z.object({
  runId: z.string().min(1),
})

/**
 * POST /api/ai/spec/token — issues a Trigger.dev public token scoped to a
 * single `generate-spec` run, given its `runId`. Structurally identical to
 * `app/api/ai/design/token/route.ts` (spec 22), per spec 27's Analyst Brief —
 * both now share `lib/trigger.ts#createRunToken`.
 *
 * Ownership check is against `TaskRun.userId` specifically — not a broader
 * project-membership re-check — so another collaborator on the same project
 * cannot grab a token for someone else's in-flight run (identical precedence
 * to `/api/ai/design/token`).
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

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return errorResponse("Invalid JSON body", 400)
  }

  const parseResult = TokenRequestBodySchema.safeParse(json)
  if (!parseResult.success) {
    return errorResponse("A `runId` is required", 400)
  }

  const taskRun = await prisma.taskRun.findUnique({ where: { runId: parseResult.data.runId } })
  if (!taskRun) {
    return errorResponse("Run not found", 404)
  }

  if (taskRun.userId !== identity.userId) {
    return errorResponse("Forbidden", 403)
  }

  let token: string
  try {
    token = await createRunToken(taskRun.runId)
  } catch (error) {
    console.error(`Failed to create a spec run token for run ${taskRun.runId}`, error)
    return errorResponse("Failed to issue a run token", 502)
  }

  return NextResponse.json({ token })
}
