import { get, put } from "@vercel/blob"

/**
 * Shared Vercel Blob upload/fetch helpers for generated spec Markdown, per
 * `architecture-context.md`'s Storage Model (`specs/{projectId}/{specId}.md`)
 * and spec 28's Analyst Brief, Concrete deliverables. Mirrors
 * `lib/canvas-blob.ts`'s exact shape — same lazy-token pattern, same store
 * access level.
 *
 * `@vercel/blob`'s `put`/`get` already read `BLOB_READ_WRITE_TOKEN` from
 * `process.env` lazily, inside their own function bodies — not at module
 * import time — so merely importing this module can't break `next build`'s
 * page-data collection the way an eagerly-instantiated client could.
 * `requireBlobToken` below still checks for the token explicitly, with a
 * clear message, *before* calling either function — the same "fail only
 * when actually invoked, with a legible error" behavior
 * `lib/liveblocks.ts#getLiveblocksClient`/`lib/canvas-blob.ts` established.
 *
 * Store visibility: the provisioned Vercel Blob store is configured for
 * `private` access (confirmed live — a `public` `put`/`get` call is rejected
 * outright with "Cannot use public access on a private store"; this was a
 * real bug in `lib/canvas-blob.ts` fixed in a follow-up PR after spec 27
 * shipped). This module authenticates every read/write with
 * `BLOB_READ_WRITE_TOKEN` rather than relying on a publicly-fetchable URL
 * from the start — not a fresh decision, the already-established,
 * already-verified convention for this exact Blob store. The download route
 * (`app/api/projects/[projectId]/specs/[specId]/download/route.ts`) never
 * returns the raw blob URL to the client either way — only the fetched
 * Markdown content itself (spec 28's Analyst Brief, acceptance criterion 5).
 */

const SPEC_BLOB_ACCESS = "private" as const

function requireBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Add it to the environment to read/write spec Markdown to Vercel Blob.",
    )
  }
  return token
}

/** Deterministic per-spec blob pathname, per the Storage Model convention. */
export function specBlobPathname(projectId: string, specId: string): string {
  return `specs/${projectId}/${specId}.md`
}

/**
 * Uploads the generated spec's Markdown content to
 * `specs/{projectId}/{specId}.md`. `allowOverwrite: true` mirrors
 * `uploadCanvasSnapshot`'s own setting purely so a retried upload for the
 * same already-created `ProjectSpec` row doesn't fail on a duplicate
 * pathname — it does not imply specs overwrite each other, since each
 * generation run gets its own newly-created `specId` (spec 28's Analyst
 * Brief, Open Questions #5: multiple independently-downloadable specs per
 * project, never a single overwritten record). Returns the blob's URL, the
 * value persisted as `ProjectSpec.filePath`.
 */
export async function uploadSpecMarkdown(
  projectId: string,
  specId: string,
  markdown: string,
): Promise<string> {
  const token = requireBlobToken()

  const { url } = await put(specBlobPathname(projectId, specId), markdown, {
    access: SPEC_BLOB_ACCESS,
    contentType: "text/markdown",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  })

  return url
}

/**
 * Fetches a previously-generated spec's Markdown content from Blob, given
 * the URL stored in `ProjectSpec.filePath`.
 *
 * Returns `null` only for the "nothing usable is there" case — the blob
 * itself reports not-found or a non-200 status — since that should read as
 * "no spec content" rather than a hard failure. A genuine upstream error
 * (network failure, auth failure, etc.) is left to throw, so the download
 * route can correctly surface it as a 500 rather than silently returning a
 * 404 for a real outage — mirrors `fetchCanvasSnapshot`'s existing
 * distinction between "nothing there" and "a real failure happened" (spec
 * 28's Analyst Brief, acceptance criterion 6).
 */
export async function fetchSpecMarkdown(blobUrl: string): Promise<string | null> {
  const token = requireBlobToken()

  const result = await get(blobUrl, { access: SPEC_BLOB_ACCESS, token })
  if (!result || result.statusCode !== 200) {
    return null
  }

  return new Response(result.stream).text()
}
