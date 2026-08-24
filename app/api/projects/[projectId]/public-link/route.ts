import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-response"
import { getAuthenticatedUserId, getOwnedProjectOrError } from "@/lib/projects"

interface RouteContext {
  params: Promise<{ projectId: string }>
}

/**
 * Owner-only public share link management (spec 34). All three handlers
 * share the same `getOwnedProjectOrError` gate `PATCH`/`DELETE
 * /api/projects/[projectId]` already use — **not** `getProjectAccess`, per
 * the raw spec text's own explicit instruction (a collaborator is not the
 * owner and must not be able to generate/revoke/see the link). Failure
 * precedence: 401 unauthenticated -> 404 missing project -> 403
 * authenticated non-owner, mirroring `app/api/projects/[projectId]/route.ts`.
 */
function ownershipErrorResponse(status: 403 | 404) {
  return status === 404 ? errorResponse("Project not found", 404) : errorResponse("Forbidden", 403)
}

/**
 * GET /api/projects/[projectId]/public-link — reports whether a public link
 * currently exists, so the Share dialog knows which state to render on
 * open. Not named in the raw spec text's own numbered Implementation list —
 * added per this spec's Analyst Brief, Open Questions #1, since nothing
 * else lets the dialog distinguish "no link yet" from "link exists" without
 * it. Owner-only, same gate as `POST`/`DELETE` below.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const userId = await getAuthenticatedUserId()
  if (!userId) {
    return errorResponse("Unauthorized", 401)
  }

  const { projectId } = await params
  const lookup = await getOwnedProjectOrError(projectId, userId)
  if (!lookup.ok) {
    return ownershipErrorResponse(lookup.status)
  }

  return NextResponse.json({ token: lookup.project.publicShareToken })
}

/**
 * POST /api/projects/[projectId]/public-link — generates (or regenerates,
 * overwriting any existing value) a public share token. Returns the raw
 * token only, not a fully-qualified URL — this codebase has no existing
 * server-side origin-resolution mechanism, so the client builds the
 * shareable `/share/{token}` URL itself via `window.location.origin`, the
 * same way `share-dialog.tsx#handleCopyLink` already does (spec 34's
 * Analyst Brief, Open Questions #5).
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const userId = await getAuthenticatedUserId()
  if (!userId) {
    return errorResponse("Unauthorized", 401)
  }

  const { projectId } = await params
  const lookup = await getOwnedProjectOrError(projectId, userId)
  if (!lookup.ok) {
    return ownershipErrorResponse(lookup.status)
  }

  const token = randomUUID()
  await prisma.project.update({
    where: { id: projectId },
    data: { publicShareToken: token },
  })

  return NextResponse.json({ token })
}

/**
 * DELETE /api/projects/[projectId]/public-link — revokes the current public
 * link by clearing `publicShareToken` back to `null`. Any request against
 * the old token immediately 404s (`GET /api/public/[token]`), since the
 * value is simply gone from the row.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const userId = await getAuthenticatedUserId()
  if (!userId) {
    return errorResponse("Unauthorized", 401)
  }

  const { projectId } = await params
  const lookup = await getOwnedProjectOrError(projectId, userId)
  if (!lookup.ok) {
    return ownershipErrorResponse(lookup.status)
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { publicShareToken: null },
  })

  return NextResponse.json({ success: true })
}
