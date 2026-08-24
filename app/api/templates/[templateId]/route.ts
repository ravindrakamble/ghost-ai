import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-response"
import { getCallerIdentity } from "@/lib/project-access"
import { deleteTemplateJson, fetchTemplateJson } from "@/lib/template-blob"

interface RouteContext {
  params: Promise<{ templateId: string }>
}

/**
 * Loads a `CustomTemplate` by ID and checks that the caller owns it — the
 * same 404-before-403 precedence `lib/projects.ts#getOwnedProjectOrError`
 * already establishes for owner-only routes, structurally reused (not
 * imported directly) since `CustomTemplate` has no `Project` relation for
 * that exact helper to query (spec 33's Analyst Brief, Concrete
 * deliverables, Dependencies).
 */
async function loadOwnedTemplateOrError(templateId: string, userId: string) {
  const template = await prisma.customTemplate.findUnique({ where: { id: templateId } })

  if (!template) {
    return { ok: false as const, status: 404 as const }
  }
  if (template.ownerId !== userId) {
    return { ok: false as const, status: 403 as const }
  }
  return { ok: true as const, template }
}

function ownershipErrorResponse(status: 403 | 404) {
  return status === 404
    ? errorResponse("Template not found", 404)
    : errorResponse("Forbidden", 403)
}

/**
 * GET /api/templates/[templateId] — fetch one saved template's full
 * node/edge content, for import. Owner-only. Returns the exact shape
 * `CanvasTemplate` (`components/editor/starter-templates.ts`) expects
 * (`{ id, name, description, nodes, edges }`), so the modal can hand the
 * response straight to `onImport` with no reshaping.
 *
 * A genuine upstream Blob failure (as opposed to "nothing there") surfaces
 * as a 500 — mirrors `fetchCanvasSnapshot`/`fetchSpecMarkdown`'s existing
 * distinction. "Nothing there" for a row that does exist in Prisma is a data
 * inconsistency (the row's own upload previously failed and wasn't cleaned
 * up), not a normal "no saved canvas yet" case — surfaced as a 404 too,
 * since there is genuinely no importable content at this ID.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const identity = await getCallerIdentity()
  if (!identity) {
    return errorResponse("Unauthorized", 401)
  }

  const { templateId } = await params
  const lookup = await loadOwnedTemplateOrError(templateId, identity.userId)
  if (!lookup.ok) {
    return ownershipErrorResponse(lookup.status)
  }

  let snapshot
  try {
    snapshot = await fetchTemplateJson(lookup.template.filePath)
  } catch (error) {
    console.error(`Failed to fetch CustomTemplate ${templateId} content from Blob`, error)
    return errorResponse("Failed to load the template", 500)
  }

  if (!snapshot) {
    return errorResponse("Template not found", 404)
  }

  return NextResponse.json({
    id: lookup.template.id,
    name: lookup.template.name,
    description: lookup.template.description,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
  })
}

/**
 * DELETE /api/templates/[templateId] — delete a saved template. Owner-only.
 *
 * Delete ordering (spec 33's Analyst Brief, Open Questions #4): the Prisma
 * row is deleted first, so the template disappears from the owner's list
 * immediately and can never be re-fetched via `GET /api/templates/[templateId]`
 * even if the Blob delete below fails. `deleteTemplateJson` then runs
 * best-effort in a try/catch that logs but does not fail the request on
 * error — an orphaned Blob object with no reachable Prisma row is a
 * harmless, low-stakes leftover (private store, never listed or served to
 * any client), matching spec 28's `persistGeneratedSpec`'s own "the row is
 * the source of truth, a stray Blob object is an acceptable non-fatal
 * leftover" posture.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const identity = await getCallerIdentity()
  if (!identity) {
    return errorResponse("Unauthorized", 401)
  }

  const { templateId } = await params
  const lookup = await loadOwnedTemplateOrError(templateId, identity.userId)
  if (!lookup.ok) {
    return ownershipErrorResponse(lookup.status)
  }

  await prisma.customTemplate.delete({ where: { id: templateId } })

  try {
    await deleteTemplateJson(lookup.template.filePath)
  } catch (error) {
    console.error(`Failed to delete Blob content for CustomTemplate ${templateId}`, error)
  }

  return NextResponse.json({ success: true })
}
