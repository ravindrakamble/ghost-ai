import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { Project as ProjectRecord } from "../generated/prisma/client";
import type { Project } from "@/types/project";

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

export interface ProjectLists {
  owned: Project[];
  shared: Project[];
}

/**
 * Resolves the current Clerk identity (user ID + primary email —
 * `ProjectCollaborator` is keyed by email, not user ID) and returns the
 * projects the caller owns plus the projects they've been added to as a
 * collaborator, as two separate lists.
 *
 * Returns empty lists when there is no signed-in user. Every route that
 * reaches this (e.g. `/editor`) runs behind Clerk's `auth.protect()`
 * middleware, so this is a defensive fallback rather than the expected path.
 */
export async function getProjectsForUser(): Promise<ProjectLists> {
  const user = await currentUser();
  if (!user) {
    return { owned: [], shared: [] };
  }

  const email = user.primaryEmailAddress?.emailAddress;

  const [owned, shared] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    email
      ? prisma.project.findMany({
          where: { collaborators: { some: { email } } },
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return { owned, shared };
}

export type ProjectLookupResult =
  | { ok: true; project: ProjectRecord }
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
