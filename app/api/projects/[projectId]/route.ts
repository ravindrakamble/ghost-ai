import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-response";
import { getAuthenticatedUserId, getOwnedProjectOrError } from "@/lib/projects";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

function ownershipErrorResponse(status: 403 | 404) {
  return status === 404
    ? errorResponse("Project not found", 404)
    : errorResponse("Forbidden", 403);
}

interface RenameProjectBody {
  name?: unknown;
}

/**
 * PATCH /api/projects/[projectId] — rename a project. Owner-only.
 * 401 unauthenticated, 404 missing project, 403 authenticated non-owner.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return errorResponse("Unauthorized", 401);
  }

  let body: RenameProjectBody;
  try {
    body = (await request.json()) as RenameProjectBody;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return errorResponse("Name is required", 400);
  }

  const { projectId } = await params;
  const lookup = await getOwnedProjectOrError(projectId, userId);
  if (!lookup.ok) {
    return ownershipErrorResponse(lookup.status);
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: { name },
  });

  return NextResponse.json({ project });
}

/**
 * DELETE /api/projects/[projectId] — delete a project. Owner-only.
 * 401 unauthenticated, 404 missing project, 403 authenticated non-owner.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return errorResponse("Unauthorized", 401);
  }

  const { projectId } = await params;
  const lookup = await getOwnedProjectOrError(projectId, userId);
  if (!lookup.ok) {
    return ownershipErrorResponse(lookup.status);
  }

  await prisma.project.delete({ where: { id: projectId } });

  return NextResponse.json({ success: true });
}
