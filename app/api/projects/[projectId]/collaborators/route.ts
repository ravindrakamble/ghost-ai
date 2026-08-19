import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { errorResponse } from "@/lib/api-response";
import { inviteCollaborator, isValidEmail, listCollaborators } from "@/lib/collaborators";
import { getProjectAccess } from "@/lib/project-access";
import { getAuthenticatedUserId, getOwnedProjectOrError } from "@/lib/projects";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

function ownershipErrorResponse(status: 403 | 404) {
  return status === 404 ? errorResponse("Project not found", 404) : errorResponse("Forbidden", 403);
}

/**
 * GET /api/projects/[projectId]/collaborators — list collaborators,
 * Clerk-enriched with display name + avatar. Gated the same way as
 * `/editor/[roomId]` (owner-or-collaborator view access, not owner-only) —
 * per spec 09's Open Questions #4, since the collaborator list is
 * project-scoped data any member may view.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { projectId } = await params;
  const access = await getProjectAccess(projectId);

  if (!access.ok) {
    if (access.reason === "unauthenticated") {
      return errorResponse("Unauthorized", 401);
    }
    return access.reason === "not-found"
      ? errorResponse("Project not found", 404)
      : errorResponse("Forbidden", 403);
  }

  const collaborators = await listCollaborators(projectId);
  return NextResponse.json({ collaborators });
}

interface InviteCollaboratorBody {
  email?: unknown;
}

/**
 * POST /api/projects/[projectId]/collaborators — invite a collaborator by
 * email. Owner-only, enforced server-side regardless of what the client UI
 * shows (spec 09 acceptance criterion 8). Mirrors the 401/404/403
 * precedence from `app/api/projects/[projectId]/route.ts`.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return errorResponse("Unauthorized", 401);
  }

  let body: InviteCollaboratorBody;
  try {
    body = (await request.json()) as InviteCollaboratorBody;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return errorResponse("A valid email address is required", 400);
  }

  const { projectId } = await params;
  const lookup = await getOwnedProjectOrError(projectId, userId);
  if (!lookup.ok) {
    return ownershipErrorResponse(lookup.status);
  }

  // Reject inviting the owner's own email — an owner can't be a redundant
  // collaborator on their own project. `lookup.ok` already confirms
  // `userId === project.ownerId`, so the caller's own Clerk profile *is*
  // the owner's profile here.
  const caller = await currentUser();
  const callerEmail = caller?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
  if (callerEmail && callerEmail === email) {
    return errorResponse("You already own this project", 400);
  }

  const result = await inviteCollaborator(projectId, email);
  if (!result.ok) {
    return errorResponse(result.message, result.status);
  }

  return NextResponse.json({ collaborator: result.collaborator }, { status: 201 });
}
