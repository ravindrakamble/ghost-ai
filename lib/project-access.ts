import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { Project } from "@/types/project";

/**
 * Current Clerk identity for workspace-view access checks: the signed-in
 * user's ID plus their primary email. `ProjectCollaborator` is keyed by
 * email (see `lib/projects.ts#getProjectsForUser`), so both are needed to
 * resolve owner-or-collaborator access.
 */
export interface CallerIdentity {
  userId: string;
  email: string | null;
}

/**
 * Resolves the current Clerk identity, or `null` when there is no
 * signed-in session. Mirrors the `currentUser()` pattern already used in
 * `lib/projects.ts#getProjectsForUser`.
 */
export async function getCallerIdentity(): Promise<CallerIdentity | null> {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  return { userId, email };
}

/**
 * Discriminated result of a workspace-view access check.
 *
 * This is a *view*-access gate for `/editor/[roomId]` only — it must not be
 * used for mutation ownership checks. `lib/projects.ts#getOwnedProjectOrError`
 * remains the separate, owner-only gate for `PATCH`/`DELETE /api/projects/[id]`.
 */
export type ProjectAccessResult =
  | { ok: false; reason: "unauthenticated" }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "forbidden" }
  | { ok: true; project: Project; isOwner: boolean };

/**
 * Loads a project by ID and checks that the current caller may view it —
 * either the owner (`ownerId === userId`) or a collaborator (matched by
 * primary email against `ProjectCollaborator.email`).
 *
 * - No signed-in session → `{ ok: false, reason: "unauthenticated" }`
 * - Project does not exist → `{ ok: false, reason: "not-found" }`
 * - Signed in, but neither owner nor collaborator → `{ ok: false, reason: "forbidden" }`
 * - Signed in and owner or collaborator → `{ ok: true, project, isOwner }`
 *
 * `isOwner` is a UX-only signal for deciding which controls to render (e.g.
 * the Share dialog's invite/remove affordances, spec 09) — it is not itself
 * a security boundary. Mutation routes must still enforce ownership
 * server-side via `lib/projects.ts#getOwnedProjectOrError`.
 */
export async function getProjectAccess(projectId: string): Promise<ProjectAccessResult> {
  const identity = await getCallerIdentity();
  if (!identity) {
    return { ok: false, reason: "unauthenticated" };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      collaborators: { select: { email: true } },
    },
  });

  if (!project) {
    return { ok: false, reason: "not-found" };
  }

  const isOwner = project.ownerId === identity.userId;
  const isCollaborator = identity.email
    ? project.collaborators.some((collaborator) => collaborator.email === identity.email)
    : false;

  if (!isOwner && !isCollaborator) {
    return { ok: false, reason: "forbidden" };
  }

  return { ok: true, project: { id: project.id, name: project.name }, isOwner };
}
