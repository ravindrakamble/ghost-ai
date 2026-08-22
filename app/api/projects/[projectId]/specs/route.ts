import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-response"
import { getProjectAccess, type ProjectAccessResult } from "@/lib/project-access"

interface RouteContext {
  params: Promise<{ projectId: string }>
}

/**
 * Maps a failed `getProjectAccess` result to this repo's standard error
 * envelope, preserving the 401/404/403 precedence every other project route
 * already follows (identical to `app/api/projects/[projectId]/canvas/route.ts`).
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
 * GET /api/projects/[projectId]/specs — list the metadata for every
 * generated spec belonging to this project, newest first.
 *
 * Not named in the raw spec text's own numbered implementation items, but
 * added per spec 28's Analyst Brief, Open Questions #3's recommendation: the
 * download route's own "verify the spec belongs to that project" check
 * presupposes a client already knows a real `specId`, and spec 29's raw text
 * explicitly assumes "the existing ProjectSpec API" for fetching a list.
 *
 * Metadata only (`id`, a derived `filename`, `createdAt`) — never
 * `ProjectSpec.filePath` (the raw Blob URL) and never spec content, which
 * only the access-checked download route serves. Open Questions #3's own
 * text offers "filePath or a derived filename" as the two options; the
 * derived filename is chosen to keep this route consistent with every other
 * Blob-backed route in this codebase (`canvas`, `specs/[specId]/download`),
 * none of which ever put a raw Blob URL in a response body.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { projectId } = await params
  const access = await getProjectAccess(projectId)
  if (!access.ok) {
    return accessErrorResponse(access)
  }

  const specs = await prisma.projectSpec.findMany({
    where: { projectId },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({
    specs: specs.map((spec) => ({
      id: spec.id,
      filename: `spec-${spec.id}.md`,
      createdAt: spec.createdAt,
    })),
  })
}
