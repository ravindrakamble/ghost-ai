import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { Project } from "../generated/prisma/client";

/** Default name applied when a project is created without one. */
export const DEFAULT_PROJECT_NAME = "Untitled Project";

/**
 * Resolves the authenticated Clerk user ID for the current request, or
 * `null` when there is no signed-in session. Route handlers use this to
 * enforce the 401 boundary before touching the database.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

export type ProjectLookupResult =
  | { ok: true; project: Project }
  | { ok: false; status: 404 }
  | { ok: false; status: 403 };

/**
 * Loads a project by ID and checks that `userId` owns it.
 * - Project missing → `{ ok: false, status: 404 }`
 * - Project exists but owned by someone else → `{ ok: false, status: 403 }`
 * - Project exists and is owned by `userId` → `{ ok: true, project }`
 *
 * Centralizes the ownership check so mutation routes stay thin and every
 * route enforces the same 404-before-403 precedence.
 */
export async function getOwnedProjectOrError(
  projectId: string,
  userId: string,
): Promise<ProjectLookupResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return { ok: false, status: 404 };
  }

  if (project.ownerId !== userId) {
    return { ok: false, status: 403 };
  }

  return { ok: true, project };
}
