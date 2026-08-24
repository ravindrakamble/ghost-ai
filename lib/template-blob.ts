import { del, get, put } from "@vercel/blob"

/**
 * Shared Vercel Blob upload/fetch/delete helpers for saved custom canvas
 * templates (spec 33), per `architecture-context.md`'s Storage Model and
 * spec 33's Analyst Brief, Concrete deliverables. Mirrors `lib/canvas-blob.ts`/
 * `lib/spec-blob.ts`'s exact shape — same lazy-token pattern, same store
 * access level — plus a new `deleteTemplateJson`, genuinely new territory in
 * this codebase (grepped: no `del` call exists anywhere yet, since neither
 * canvas snapshots nor generated specs are ever deleted).
 *
 * `@vercel/blob`'s `put`/`get`/`del` already read `BLOB_READ_WRITE_TOKEN`
 * from `process.env` lazily, inside their own function bodies — not at
 * module import time — so merely importing this module can't break `next
 * build`'s page-data collection the way an eagerly-instantiated client
 * could. `requireBlobToken` below still checks for the token explicitly,
 * with a clear message, *before* calling any of the three, the same "fail
 * only when actually invoked, with a legible error" behavior
 * `lib/liveblocks.ts#getLiveblocksClient`/`lib/canvas-blob.ts`/
 * `lib/spec-blob.ts` established.
 *
 * Store visibility: the provisioned Vercel Blob store is configured for
 * `private` access (confirmed live in `lib/canvas-blob.ts`'s own docblock),
 * so this module authenticates every read/write/delete with
 * `BLOB_READ_WRITE_TOKEN` rather than relying on a publicly-fetchable URL.
 * Neither API route built on top of this module (`app/api/templates/route.ts`,
 * `app/api/templates/[templateId]/route.ts`) ever returns the raw blob URL
 * to the client either way — only the fetched node/edge JSON content itself
 * (spec 33's Analyst Brief, Concrete deliverables, `GET /api/templates`'s
 * "never `filePath`" requirement).
 */

const TEMPLATE_BLOB_ACCESS = "private" as const

function requireBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Add it to the environment to read/write/delete saved templates to Vercel Blob.",
    )
  }
  return token
}

/** Deterministic per-user-per-template blob pathname, per the Storage Model convention. */
export function templateBlobPathname(ownerId: string, templateId: string): string {
  return `templates/${ownerId}/${templateId}.json`
}

/**
 * Saved-template snapshot shape persisted to Blob: the full-fidelity node/edge
 * JSON validated by `app/api/templates/route.ts`'s own dedicated Zod schemas
 * (`CustomTemplateNodeSchema`/`CustomTemplateEdgeSchema`, `lib/
 * template-schema.ts`) before this module is ever called — this module only
 * round-trips already-validated JSON through Blob storage, the same "opaque
 * JSON in, opaque JSON out" posture `lib/canvas-blob.ts#CanvasSnapshot`
 * already takes for the same reason (the real untrusted-external-input
 * boundary is the route handler, not this shared helper).
 */
export interface TemplateSnapshot {
  nodes: unknown[]
  edges: unknown[]
}

function isTemplateSnapshot(value: unknown): value is TemplateSnapshot {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges)
}

/**
 * Uploads a saved template's node/edge JSON to
 * `templates/{ownerId}/{templateId}.json`. `allowOverwrite: true` mirrors
 * `uploadCanvasSnapshot`/`uploadSpecMarkdown`'s own setting — this spec has
 * no edit-in-place flow (delete-and-re-save only, per its own Scope Limits),
 * so overwrite never actually fires for a *different* save, but keeps this
 * helper consistent with its two Blob-upload siblings and tolerant of a
 * retried upload for the same already-created `CustomTemplate` row. Returns
 * the blob's URL, the value persisted as `CustomTemplate.filePath`.
 */
export async function uploadTemplateJson(
  ownerId: string,
  templateId: string,
  snapshot: TemplateSnapshot,
): Promise<string> {
  const token = requireBlobToken()

  const { url } = await put(templateBlobPathname(ownerId, templateId), JSON.stringify(snapshot), {
    access: TEMPLATE_BLOB_ACCESS,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  })

  return url
}

/**
 * Fetches and parses a previously-saved template's node/edge JSON from Blob,
 * given the URL stored in `CustomTemplate.filePath`.
 *
 * Returns `null` only for the "nothing usable is there" cases — the blob
 * itself reports not-found, or its content isn't valid JSON matching
 * `TemplateSnapshot`'s shape — since those should read as "no saved content"
 * rather than a hard failure. A genuine upstream error (network failure,
 * auth failure, etc.) is left to throw, so `GET /api/templates/[templateId]`
 * can correctly surface it as a 500 rather than silently returning a 404 for
 * a real outage — mirrors `fetchCanvasSnapshot`/`fetchSpecMarkdown`'s
 * existing distinction between "nothing there" and "a real failure
 * happened."
 */
export async function fetchTemplateJson(blobUrl: string): Promise<TemplateSnapshot | null> {
  const token = requireBlobToken()

  const result = await get(blobUrl, { access: TEMPLATE_BLOB_ACCESS, token })
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

  return isTemplateSnapshot(parsed) ? parsed : null
}

/**
 * Deletes a saved template's Blob object, given the URL stored in
 * `CustomTemplate.filePath`. Genuinely new territory in this codebase (no
 * `del` call exists anywhere else) — neither canvas snapshots nor generated
 * specs are ever deleted, so `canvas-blob.ts`/`spec-blob.ts` are upload+fetch
 * only.
 *
 * Deliberately does *not* swallow a failure here — a caller that needs
 * "best-effort, don't fail the request" behavior (per spec 33's Analyst
 * Brief, Open Questions #4's recommended delete-ordering: Prisma row first,
 * then a try/caught Blob delete that only logs) wraps this call in its own
 * try/catch rather than this helper silently succeeding on a real upstream
 * failure — the same "let a genuine error propagate, only 'not found' is a
 * non-error" posture `fetchCanvasSnapshot`/`fetchSpecMarkdown`/
 * `fetchTemplateJson` already take, applied here to writes: `del` on an
 * already-missing blob resolves without throwing (per `@vercel/blob`'s own
 * documented behavior), so this function only ever throws for a genuine
 * upstream failure (network, auth, etc.), never for "there was nothing to
 * delete."
 */
export async function deleteTemplateJson(blobUrl: string): Promise<void> {
  const token = requireBlobToken()
  await del(blobUrl, { token })
}
