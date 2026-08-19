import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { removeCollaborator } from "@/lib/collaborators";
import { getAuthenticatedUserId, getOwnedProjectOrError } from "@/lib/projects";

interface RouteContext {
  params: Promise<{ projectId: string; collaboratorId: string }>;
}

function ownershipErrorResponse(status: 403 | 404) {
  return status === 404 ? errorResponse("Project not found", 404) : errorResponse("Forbidden", 403);
}

/**
 * DELETE /api/projects/[projectId]/collaborators/[collaboratorId] — remove
 * a collaborator by `ProjectCollaborator.id`. Owner-only, enforced
 * server-side regardless of what the client UI shows (spec 09 acceptance
 * criterion 9).
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return errorResponse("Unauthorized", 401);
  }

  const { projectId, collaboratorId } = await params;
  const lookup = await getOwnedProjectOrError(projectId, userId);
  if (!lookup.ok) {
    return ownershipErrorResponse(lookup.status);
  }

  const result = await removeCollaborator(projectId, collaboratorId);
  if (!result.ok) {
    return errorResponse("Collaborator not found", 404);
  }

  return NextResponse.json({ success: true });
}
