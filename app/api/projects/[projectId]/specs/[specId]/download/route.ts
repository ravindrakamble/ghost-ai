import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-response"
import { getProjectAccess, type ProjectAccessResult } from "@/lib/project-access"
import { fetchSpecMarkdown } from "@/lib/spec-blob"

interface RouteContext {
  params: Promise<{ projectId: string; specId: string }>
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
 * GET /api/projects/[projectId]/specs/[specId]/download — fetch a previously
 * generated spec's Markdown content from Vercel Blob and return it as a
 * downloadable attachment.
 *
 * Owner-or-collaborator access (`getProjectAccess`), the same gate
 * `app/api/projects/[projectId]/canvas/route.ts` uses — collaborators who
 * can view/edit the canvas and trigger generation should also be able to
 * download the result (spec 28's Analyst Brief, Concrete deliverables).
 *
 * Failure precedence: 401 unauthenticated -> 404/403 via `getProjectAccess`
 * -> 404 unknown `specId` or a `specId` belonging to a different project ->
 * 404 the referenced Blob content is missing -> 500 a genuine upstream Blob
 * failure. The raw Blob URL is never returned in the response body or
 * headers — only the fetched Markdown content itself (acceptance
 * criterion 5).
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { projectId, specId } = await params
  const access = await getProjectAccess(projectId)
  if (!access.ok) {
    return accessErrorResponse(access)
  }

  const spec = await prisma.projectSpec.findUnique({
    where: { id: specId },
    select: { projectId: true, filePath: true },
  })

  if (!spec || spec.projectId !== projectId) {
    return errorResponse("Spec not found", 404)
  }

  let markdown: string | null
  try {
    markdown = await fetchSpecMarkdown(spec.filePath)
  } catch (error) {
    console.error(`Failed to fetch spec markdown for spec ${specId}`, error)
    return errorResponse("Failed to load spec", 500)
  }

  if (markdown === null) {
    return errorResponse("Spec content not found", 404)
  }

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="spec-${specId}.md"`,
    },
  })
}
