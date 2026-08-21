import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-response"
import { getCallerIdentity, getProjectAccess, type ProjectAccessResult } from "@/lib/project-access"
import { triggerDesignAgent } from "@/lib/trigger"

/**
 * Maps a failed `getProjectAccess` result to this repo's standard error
 * envelope, preserving the 401/404/403 precedence every other project route
 * already follows.
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

interface DesignRequestBody {
  prompt?: unknown
  roomId?: unknown
  projectId?: unknown
}

interface ValidDesignRequestBody {
  prompt: string
  roomId: string
  projectId: string
}

function isValidDesignRequestBody(body: DesignRequestBody): body is ValidDesignRequestBody {
  return (
    typeof body.prompt === "string" &&
    body.prompt.trim().length > 0 &&
    typeof body.roomId === "string" &&
    body.roomId.trim().length > 0 &&
    typeof body.projectId === "string" &&
    body.projectId.trim().length > 0
  )
}

/**
 * POST /api/ai/design — triggers the `design-agent` background task
 * (`trigger/design-agent.ts`) and records the run in Prisma.
 *
 * Owner-or-collaborator access (`getProjectAccess`), same gate as the spec 21
 * canvas route — per spec 22's Analyst Brief, Open Questions #3, prompting
 * the AI is a collaborative action available to any project member.
 *
 * Failure precedence: 401 unauthenticated -> 400 malformed/inconsistent body
 * -> 404/403 via `getProjectAccess` -> 502 upstream Trigger.dev failure -> 500
 * Prisma write failure. Auth is checked before body parsing (unlike the
 * canvas route, which gets `projectId` from the URL) since this route's
 * `projectId` only exists inside the body — an unauthenticated caller should
 * never learn whether their body was well-formed.
 *
 * `roomId` and `projectId` are two independently client-supplied fields per
 * this spec's own text; every prior spec (10, 11, 21) treats room ID and
 * project ID as the same value, so a mismatch between them is rejected as a
 * malformed request rather than silently preferring one (spec 22's Analyst
 * Brief, Open Questions #4).
 */
export async function POST(request: NextRequest) {
  const identity = await getCallerIdentity()
  if (!identity) {
    return errorResponse("Unauthorized", 401)
  }

  let body: DesignRequestBody
  try {
    body = (await request.json()) as DesignRequestBody
  } catch {
    return errorResponse("Invalid JSON body", 400)
  }

  if (!isValidDesignRequestBody(body)) {
    return errorResponse("prompt, roomId, and projectId are required", 400)
  }

  if (body.roomId !== body.projectId) {
    return errorResponse("roomId must match projectId", 400)
  }

  const access = await getProjectAccess(body.projectId)
  if (!access.ok) {
    return accessErrorResponse(access)
  }

  let triggeredRun
  try {
    triggeredRun = await triggerDesignAgent({ prompt: body.prompt, roomId: body.roomId })
  } catch (error) {
    console.error("Failed to trigger the design-agent task", error)
    return errorResponse("Failed to start design generation", 502)
  }

  try {
    await prisma.taskRun.create({
      data: {
        runId: triggeredRun.runId,
        projectId: body.projectId,
        userId: identity.userId,
      },
    })
  } catch (error) {
    console.error(`Failed to record TaskRun ${triggeredRun.runId}`, error)
    return errorResponse("Failed to record the design run", 500)
  }

  return NextResponse.json({ runId: triggeredRun.runId })
}
