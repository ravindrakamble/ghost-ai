import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "../generated/prisma/client";
import type { Collaborator } from "@/types/collaborator";

/** Basic shape check, not full RFC 5322 validation — good enough for a 400 boundary. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

interface ClerkEnrichment {
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Looks up Clerk users matching the given emails via the Clerk Backend API
 * and returns a lowercase-email-keyed map of display name + avatar.
 *
 * Enrichment is best-effort: if the Clerk Backend API call itself fails
 * (network/upstream error, distinct from "no matching user"), this falls
 * back to an empty map rather than failing the whole collaborator list —
 * the DB-sourced list of emails is still valid and should still render.
 */
async function fetchClerkEnrichmentByEmail(
  emails: string[],
): Promise<Map<string, ClerkEnrichment>> {
  const map = new Map<string, ClerkEnrichment>();
  if (emails.length === 0) {
    return map;
  }

  let users;
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ emailAddress: emails });
    users = data;
  } catch (error) {
    console.error("Failed to enrich collaborators via the Clerk Backend API", error);
    return map;
  }

  const wanted = new Set(emails.map((email) => email.toLowerCase()));
  for (const user of users) {
    const matchedEmail = user.emailAddresses.find((address) =>
      wanted.has(address.emailAddress.toLowerCase()),
    )?.emailAddress;
    if (!matchedEmail) {
      continue;
    }

    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    map.set(matchedEmail.toLowerCase(), {
      name: name.length > 0 ? name : null,
      avatarUrl: user.imageUrl || null,
    });
  }

  return map;
}

function toCollaborator(
  row: { id: string; email: string },
  enrichment: Map<string, ClerkEnrichment>,
): Collaborator {
  const match = enrichment.get(row.email.toLowerCase());
  return {
    id: row.id,
    email: row.email,
    name: match?.name ?? null,
    avatarUrl: match?.avatarUrl ?? null,
  };
}

/**
 * Lists a project's collaborators, Clerk-enriched with display name and
 * avatar when a matching Clerk user exists for the stored email.
 */
export async function listCollaborators(projectId: string): Promise<Collaborator[]> {
  const rows = await prisma.projectCollaborator.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });

  const enrichment = await fetchClerkEnrichmentByEmail(rows.map((row) => row.email));
  return rows.map((row) => toCollaborator(row, enrichment));
}

export type InviteCollaboratorResult =
  | { ok: true; collaborator: Collaborator }
  | { ok: false; status: 409; message: string };

/**
 * Adds a `ProjectCollaborator` row for `email` and returns it Clerk-enriched.
 * Maps the schema's `@@unique([projectId, email])` constraint violation
 * (Prisma error `P2002`) to a 409 rather than letting it surface as a 500 —
 * per spec 09's Open Questions #3.
 *
 * Callers are responsible for format validation (`isValidEmail`) and
 * ownership/self-invite checks before calling this — this function only
 * owns the persistence + enrichment concern.
 */
export async function inviteCollaborator(
  projectId: string,
  email: string,
): Promise<InviteCollaboratorResult> {
  let row;
  try {
    row = await prisma.projectCollaborator.create({
      data: { projectId, email },
      select: { id: true, email: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        status: 409,
        message: "This email is already a collaborator on this project.",
      };
    }
    throw error;
  }

  const enrichment = await fetchClerkEnrichmentByEmail([email]);
  return { ok: true, collaborator: toCollaborator(row, enrichment) };
}

export type RemoveCollaboratorResult = { ok: true } | { ok: false; status: 404 };

/**
 * Removes a collaborator by `ProjectCollaborator.id`, scoped to `projectId`
 * so a collaborator ID from a different project can't be used to delete a
 * row it doesn't belong to. `deleteMany` keeps the existence + scope check
 * atomic in a single query.
 */
export async function removeCollaborator(
  projectId: string,
  collaboratorId: string,
): Promise<RemoveCollaboratorResult> {
  const { count } = await prisma.projectCollaborator.deleteMany({
    where: { id: collaboratorId, projectId },
  });

  if (count === 0) {
    return { ok: false, status: 404 };
  }

  return { ok: true };
}
