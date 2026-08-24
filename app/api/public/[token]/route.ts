import { NextRequest, NextResponse } from "next/server"
import { errorResponse } from "@/lib/api-response"
import { getPublicProjectData } from "@/lib/public-project"

interface RouteContext {
  params: Promise<{ token: string }>
}

/**
 * GET /api/public/[token] — unauthenticated, read-only lookup backing the
 * `/share/[token]` public page (spec 34). No Clerk check of any kind; this
 * is one of the two routes newly allowlisted in `proxy.ts#isPublicRoute`.
 *
 * A token with no matching project returns 404 — identical whether the
 * token was never valid or was just revoked, per this spec's own explicit
 * "do not distinguish" instruction (acceptance criterion 4). A genuine
 * upstream Blob failure while resolving the project's canvas/spec content
 * surfaces as a 500, not a 404 — the token itself is still valid.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { token } = await params

  let data
  try {
    data = await getPublicProjectData(token)
  } catch (error) {
    console.error(`Failed to load public project data for token`, error)
    return errorResponse("Failed to load project", 500)
  }

  if (!data) {
    return errorResponse("Not found", 404)
  }

  return NextResponse.json(data)
}
