import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-response"
import { getProjectAccess, type ProjectAccessResult } from "@/lib/project-access"
import { fetchSpecIac } from "@/lib/spec-blob"

interface RouteContext {
  params: Promise<{ projectId: string; specId: string }>
}

/**
 * Maps a failed `getProjectAccess` result to this repo's standard error
 * envelope, preserving the 401/404/403 precedence every other project route
 * already follows (identical to `app/api/projects/[projectId]/specs/[specId]
 * /download/route.ts`).
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
 * GET /api/projects/[projectId]/specs/[specId]/download-iac — fetch a
 * previously generated spec's Terraform skeleton from Vercel Blob and return
 * it as a downloadable attachment (spec 35's Analyst Brief).
 *
 * Mirrors `download/route.ts` exactly: same owner-or-collaborator access
 * gate (`getProjectAccess`), same "spec not found" 404 when the `specId`
 * doesn't exist or belongs to a different project. Selects `iacFilePath`
 * (not `filePath`) from the `ProjectSpec` row.
 *
 * Failure precedence: 401 unauthenticated -> 404/403 via `getProjectAccess`
 * -> 404 unknown `specId` or a `specId` belonging to a different project ->
 * 404 no IaC was ever generated for this spec (`iacFilePath` is `null`, a
 * spec generated before this feature shipped) or the referenced Blob
 * content is missing -> 500 a genuine upstream Blob failure. The raw Blob
 * URL is never returned in the response body or headers — only the fetched
 * Terraform content itself.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { projectId, specId } = await params
  const access = await getProjectAccess(projectId)
  if (!access.ok) {
    return accessErrorResponse(access)
  }

  const spec = await prisma.projectSpec.findUnique({
    where: { id: specId },
    select: { projectId: true, iacFilePath: true },
  })

  if (!spec || spec.projectId !== projectId) {
    return errorResponse("Spec not found", 404)
  }

  if (spec.iacFilePath === null) {
    return errorResponse("IaC content not found", 404)
  }

  let terraform: string | null
  try {
    terraform = await fetchSpecIac(spec.iacFilePath)
  } catch (error) {
    console.error(`Failed to fetch spec IaC content for spec ${specId}`, error)
    return errorResponse("Failed to load spec", 500)
  }

  if (terraform === null) {
    return errorResponse("IaC content not found", 404)
  }

  return new NextResponse(terraform, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="spec-${specId}.tf"`,
    },
  })
}
