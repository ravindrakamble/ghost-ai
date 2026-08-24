import { prisma } from "@/lib/prisma"
import { fetchCanvasSnapshot } from "@/lib/canvas-blob"
import { fetchSpecMarkdown } from "@/lib/spec-blob"

/**
 * Shared lookup for a project's public, unauthenticated read-only view (spec
 * 34). Used by both `app/api/public/[token]/route.ts` (the unauthenticated
 * JSON API) and `app/share/[token]/page.tsx` (the Server Component page) —
 * the page calls this directly rather than self-`fetch()`ing its own API
 * route, mirroring this codebase's existing convention for a Server
 * Component's data needs (`app/editor/[roomId]/page.tsx` calls
 * `lib/project-access.ts#getProjectAccess` directly rather than fetching
 * `GET /api/projects/[projectId]`). This also sidesteps needing a
 * server-side origin-resolution mechanism this codebase has never had (see
 * spec 34's Analyst Brief, Open Questions #5) just to make a same-origin
 * `fetch()` call work from a Server Component.
 *
 * Deliberately returns only the fields a public, unauthenticated viewer may
 * see — never `ownerId`, `ProjectCollaborator` data, `publicShareToken`
 * itself, or any raw Blob URL (spec 34's Analyst Brief, acceptance criterion
 * 4).
 */

export interface PublicProjectSpec {
  markdown: string
  createdAt: Date
}

export interface PublicProjectData {
  projectName: string
  /** Round-tripped from Vercel Blob, same opaque `unknown[]` shape
   * `lib/canvas-blob.ts#CanvasSnapshot` already uses — this module only
   * resolves *whether* a snapshot exists, not its per-node/per-edge shape. */
  nodes: unknown[]
  edges: unknown[]
  spec: PublicProjectSpec | null
}

/**
 * Resolves a public share token to the data its page/API response need.
 *
 * Returns `null` for any token with no matching project — a never-valid
 * token and a just-revoked one are indistinguishable by design (spec 34's
 * Analyst Brief, acceptance criterion 4).
 *
 * A missing/never-saved canvas (`canvasJsonPath` is `null`) or missing spec
 * is a non-error case — `nodes`/`edges` come back empty, `spec` comes back
 * `null` — never folded into the "token not found" `null` return, since the
 * token and project are both still genuinely valid (spec 34's Analyst
 * Brief, Open Questions #3). A genuine upstream Blob failure (not "nothing
 * there") is left to throw, so the caller can surface it as a real error
 * rather than silently mispresenting an outage as "no content yet."
 */
export async function getPublicProjectData(token: string): Promise<PublicProjectData | null> {
  const project = await prisma.project.findUnique({
    where: { publicShareToken: token },
    select: {
      name: true,
      canvasJsonPath: true,
      specs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { filePath: true, createdAt: true },
      },
    },
  })

  if (!project) {
    return null
  }

  const snapshot = project.canvasJsonPath ? await fetchCanvasSnapshot(project.canvasJsonPath) : null

  const latestSpec = project.specs[0] ?? null
  let spec: PublicProjectSpec | null = null
  if (latestSpec) {
    const markdown = await fetchSpecMarkdown(latestSpec.filePath)
    if (markdown !== null) {
      spec = { markdown, createdAt: latestSpec.createdAt }
    }
  }

  return {
    projectName: project.name,
    nodes: snapshot?.nodes ?? [],
    edges: snapshot?.edges ?? [],
    spec,
  }
}
