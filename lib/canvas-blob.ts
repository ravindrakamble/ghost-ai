import { get, put } from "@vercel/blob"

/**
 * Shared Vercel Blob upload/fetch helpers for canvas JSON snapshots, per
 * `architecture-context.md`'s Storage Model (`canvas/{projectId}.json`) and
 * spec 21's Analyst Brief, Concrete deliverables.
 *
 * `@vercel/blob`'s `put`/`get` already read `BLOB_READ_WRITE_TOKEN` from
 * `process.env` lazily, inside their own function bodies — not at module
 * import time — so merely importing this module can't break `next build`'s
 * page-data collection the way an eagerly-instantiated client could.
 * `requireBlobToken` below still checks for the token explicitly, with a
 * clear message, *before* calling either function — the same "fail only
 * when actually invoked, with a legible error" behavior
 * `lib/liveblocks.ts#getLiveblocksClient` established for a missing
 * `LIVEBLOCKS_SECRET_KEY` (spec 10), applied here to a missing Blob token.
 *
 * Store visibility (`public` vs. `private`) is a cross-cutting open item
 * logged in `progress-tracker.md`'s "Deferred — Production Hardening"
 * section, not resolved by this spec. `public` is used here as the
 * practical default; the `GET` route (`app/api/projects/[projectId]/canvas/
 * route.ts`) never returns the raw blob URL to the client — only the fetched
 * JSON body itself — which keeps this spec from making that deferred gap any
 * worse (spec 21's Analyst Brief, Open Questions #6).
 */

const CANVAS_BLOB_ACCESS = "public" as const

function requireBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Add it to the environment to read/write canvas snapshots to Vercel Blob.",
    )
  }
  return token
}

/** Deterministic per-project blob pathname, per the Storage Model convention. */
export function canvasBlobPathname(projectId: string): string {
  return `canvas/${projectId}.json`
}

/**
 * Canvas snapshot shape persisted to Blob: React Flow's own `nodes`/`edges`
 * arrays, serialized as-is. Kept as `unknown[]` rather than
 * `CanvasNode[]`/`CanvasEdge[]` — this module only round-trips opaque JSON
 * through Blob storage; validating the actual *shape* of each node/edge is
 * the `PUT` route's job (the real untrusted-external-input boundary), not
 * this shared helper's.
 */
export interface CanvasSnapshot {
  nodes: unknown[]
  edges: unknown[]
}

function isCanvasSnapshot(value: unknown): value is CanvasSnapshot {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges)
}

/**
 * Uploads the current canvas snapshot to `canvas/{projectId}.json`,
 * overwriting any previous snapshot for this project (`allowOverwrite: true`,
 * `addRandomSuffix: false`) — exactly one snapshot per project, never a
 * history, per `project-overview.md`'s Out of Scope wall. Returns the blob's
 * URL, the value persisted as `Project.canvasJsonPath`.
 */
export async function uploadCanvasSnapshot(
  projectId: string,
  snapshot: CanvasSnapshot,
): Promise<string> {
  const token = requireBlobToken()

  const { url } = await put(canvasBlobPathname(projectId), JSON.stringify(snapshot), {
    access: CANVAS_BLOB_ACCESS,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  })

  return url
}

/**
 * Fetches and parses a previously-saved canvas snapshot from Blob, given the
 * URL stored in `Project.canvasJsonPath`.
 *
 * Returns `null` only for the "nothing usable is there" cases — the blob
 * itself reports not-found, or its content isn't valid JSON matching
 * `CanvasSnapshot`'s shape — since those should read as "no saved canvas"
 * rather than a hard failure. A genuine upstream error (network failure,
 * auth failure, etc.) is left to throw, so the route handler can correctly
 * surface it as a 500 rather than silently pretending the project has no
 * saved canvas when it actually does — see spec 21's Analyst Brief, Open
 * Questions #3.
 */
export async function fetchCanvasSnapshot(blobUrl: string): Promise<CanvasSnapshot | null> {
  const token = requireBlobToken()

  const result = await get(blobUrl, { access: CANVAS_BLOB_ACCESS, token })
  if (!result || result.statusCode !== 200) {
    return null
  }

  let parsed: unknown
  try {
    const text = await new Response(result.stream).text()
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  return isCanvasSnapshot(parsed) ? parsed : null
}
