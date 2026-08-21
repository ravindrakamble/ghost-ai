import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-response"
import { getProjectAccess, type ProjectAccessResult } from "@/lib/project-access"
import { fetchCanvasSnapshot, uploadCanvasSnapshot, type CanvasSnapshot } from "@/lib/canvas-blob"

interface RouteContext {
  params: Promise<{ projectId: string }>
}

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

interface SaveCanvasBody {
  nodes?: unknown
  edges?: unknown
}

function isValidCanvasBody(body: SaveCanvasBody): body is CanvasSnapshot {
  return Array.isArray(body.nodes) && Array.isArray(body.edges)
}

/**
 * PUT /api/projects/[projectId]/canvas — save the current canvas snapshot to
 * Vercel Blob and record the reference on `Project.canvasJsonPath`.
 *
 * Owner-or-collaborator (`getProjectAccess`), not the owner-only gate
 * `PATCH`/`DELETE /api/projects/[projectId]` use — collaborators actively
 * edit the shared canvas, so their autosave writes must not be blocked by an
 * owner-only check. See spec 21's Analyst Brief, Open Questions #4.
 *
 * 401 unauthenticated, 404 missing project, 403 authenticated non-member.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { projectId } = await params
  const access = await getProjectAccess(projectId)
  if (!access.ok) {
    return accessErrorResponse(access)
  }

  let body: SaveCanvasBody
  try {
    body = (await request.json()) as SaveCanvasBody
  } catch {
    return errorResponse("Invalid JSON body", 400)
  }

  if (!isValidCanvasBody(body)) {
    return errorResponse("nodes and edges arrays are required", 400)
  }

  let canvasJsonPath: string
  try {
    canvasJsonPath = await uploadCanvasSnapshot(projectId, body)
  } catch (error) {
    console.error(`Failed to upload canvas snapshot for project ${projectId}`, error)
    return errorResponse("Failed to save canvas", 500)
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { canvasJsonPath },
  })

  return NextResponse.json({ canvasJsonPath })
}

/**
 * GET /api/projects/[projectId]/canvas — load the previously-saved canvas
 * snapshot. Same owner-or-collaborator access gate as `PUT`. Reads
 * `canvasJsonPath` from Prisma, fetches the canvas JSON from Vercel Blob
 * server-side, and returns the JSON content itself in the response body —
 * never the raw blob URL (acceptance criterion 4).
 *
 * Returns 404 both when the project has no saved canvas yet
 * (`canvasJsonPath` is `null`, or the referenced blob is missing/corrupt) and
 * — per this repo's standard access precedence — when the project itself
 * doesn't exist or the caller lacks access. The editor's load logic
 * (`components/editor/canvas.tsx`) treats any non-OK response here as
 * "nothing to load," never a user-facing error — see spec 21's Analyst
 * Brief, Open Questions #3.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { projectId } = await params
  const access = await getProjectAccess(projectId)
  if (!access.ok) {
    return accessErrorResponse(access)
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { canvasJsonPath: true },
  })

  if (!project?.canvasJsonPath) {
    return errorResponse("No saved canvas for this project", 404)
  }

  let snapshot: CanvasSnapshot | null
  try {
    snapshot = await fetchCanvasSnapshot(project.canvasJsonPath)
  } catch (error) {
    console.error(`Failed to fetch canvas snapshot for project ${projectId}`, error)
    return errorResponse("Failed to load canvas", 500)
  }

  if (!snapshot) {
    return errorResponse("No saved canvas for this project", 404)
  }

  return NextResponse.json(snapshot)
}
