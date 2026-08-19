/**
 * Display shape of a project collaborator as consumed by the Share dialog.
 *
 * `ProjectCollaborator` is stored email-only in Postgres (see
 * `prisma/schema.prisma`) — `name`/`avatarUrl` are looked up live from the
 * Clerk Backend API per request (`lib/collaborators.ts`), never persisted.
 * Both are `null` when no Clerk user matches the stored email, in which
 * case the UI falls back to showing the raw email.
 */
export interface Collaborator {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
}
