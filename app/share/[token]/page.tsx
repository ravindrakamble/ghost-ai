import { notFound } from "next/navigation"
import { PublicCanvasPreview } from "@/components/editor/public-canvas-preview"
import { PublicSpecView } from "@/components/editor/public-spec-view"
import { getPublicProjectData } from "@/lib/public-project"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"

interface SharePageProps {
  params: Promise<{ token: string }>
}

/**
 * `/share/[token]` — public, unauthenticated, read-only project preview
 * (spec 34). Server Component (default per `code-standards.md`; no browser
 * interactivity needed at the page-shell level): calls
 * `lib/public-project.ts#getPublicProjectData` directly rather than
 * self-`fetch()`ing `GET /api/public/[token]`, the same "call the shared
 * lookup function directly" pattern `app/editor/[roomId]/page.tsx` already
 * uses for its own access check — see that lib module's docblock for why.
 * The standalone `GET /api/public/[token]` route still exists and is
 * independently reachable/testable exactly as the brief specifies; only
 * this page's own internal data-loading path differs from a literal
 * self-fetch.
 *
 * No Clerk auth check of any kind here — this route is allowlisted in
 * `proxy.ts#isPublicRoute`. A token with no matching project (never valid,
 * or just revoked — indistinguishable by design) renders Next's real
 * not-found UI via `notFound()`. No node/edge interaction, no chat, no AI
 * sidebar, no navbar mutation actions, and no Liveblocks room join of any
 * kind — this renders only the last persisted snapshot.
 */
export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params
  const data = await getPublicProjectData(token)

  if (!data) {
    notFound()
  }

  // Shallow shape-check only, mirroring `components/editor/canvas.tsx`'s
  // own `isCanvasSnapshotBody` convention for this exact "round-tripped
  // through Vercel Blob, not arbitrary third-party input" case.
  const nodes = data.nodes as CanvasNode[]
  const edges = data.edges as CanvasEdge[]

  return (
    <main className="min-h-screen bg-base px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-copy-muted">Public read-only view</p>
          <h1 className="text-2xl font-semibold text-copy-primary">{data.projectName}</h1>
        </div>

        <PublicCanvasPreview nodes={nodes} edges={edges} />

        {data.spec && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-copy-muted">
              Latest spec &middot; generated {new Date(data.spec.createdAt).toLocaleString()}
            </h2>
            <PublicSpecView markdown={data.spec.markdown} />
          </div>
        )}
      </div>
    </main>
  )
}
