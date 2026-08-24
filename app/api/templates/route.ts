import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-response"
import { getCallerIdentity } from "@/lib/project-access"
import { uploadTemplateJson } from "@/lib/template-blob"
import { CreateCustomTemplateSchema } from "@/lib/template-schema"

/**
 * GET /api/templates — list the current user's own saved `CustomTemplate`
 * rows, newest first (spec 33). Auth required, no `getProjectAccess` call —
 * a saved template is not project-scoped (spec 33's Analyst Brief, Concrete
 * deliverables, Open Questions #1).
 *
 * Metadata only (`id`, `name`, `description`, `createdAt`) — never
 * `CustomTemplate.filePath` (the raw Blob URL), mirroring
 * `GET /api/projects/[projectId]/specs`'s existing metadata-only convention.
 *
 * POST /api/templates — save the current canvas as a new named template.
 * Failure precedence: 401 unauthenticated -> 400 malformed/invalid body
 * (Zod) -> 500 Blob/Prisma failure, mirroring
 * `app/api/projects/[projectId]/specs/route.ts` (spec 28) and
 * `app/api/ai/design/route.ts`'s own precedence convention.
 */
export async function GET() {
  const identity = await getCallerIdentity()
  if (!identity) {
    return errorResponse("Unauthorized", 401)
  }

  const templates = await prisma.customTemplate.findMany({
    where: { ownerId: identity.userId },
    select: { id: true, name: true, description: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ templates })
}

export async function POST(request: NextRequest) {
  const identity = await getCallerIdentity()
  if (!identity) {
    return errorResponse("Unauthorized", 401)
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return errorResponse("Invalid JSON body", 400)
  }

  const parsed = CreateCustomTemplateSchema.safeParse(rawBody)
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid template data", 400)
  }

  const { name, description, nodes, edges } = parsed.data

  // A placeholder row is created first to obtain a generated `id`, matching
  // spec 28's `persistGeneratedSpec` two-write pattern (`filePath` needs the
  // row's own `id` for its Blob pathname) — then updated with the real
  // `filePath` once the upload succeeds. If the upload or follow-up update
  // fails, the placeholder row is deleted (best-effort) before surfacing the
  // failure, so a failed save never leaves an unfetchable "ghost" template
  // behind.
  const placeholder = await prisma.customTemplate.create({
    data: {
      ownerId: identity.userId,
      name,
      description: description || null,
      filePath: "",
    },
  })

  try {
    const filePath = await uploadTemplateJson(identity.userId, placeholder.id, { nodes, edges })
    const template = await prisma.customTemplate.update({
      where: { id: placeholder.id },
      data: { filePath },
      select: { id: true, name: true, description: true, createdAt: true },
    })

    return NextResponse.json({ template })
  } catch (error) {
    console.error(`Failed to persist CustomTemplate ${placeholder.id}`, error)
    try {
      await prisma.customTemplate.delete({ where: { id: placeholder.id } })
    } catch (cleanupError) {
      console.error(`Failed to clean up placeholder CustomTemplate ${placeholder.id}`, cleanupError)
    }
    return errorResponse("Failed to save the template", 500)
  }
}
