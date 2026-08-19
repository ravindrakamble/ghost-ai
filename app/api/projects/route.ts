import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-response";
import { DEFAULT_PROJECT_NAME, getAuthenticatedUserId } from "@/lib/projects";

/**
 * GET /api/projects — list the authenticated user's owned projects.
 */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return errorResponse("Unauthorized", 401);
  }

  const projects = await prisma.project.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ projects });
}

interface CreateProjectBody {
  name?: unknown;
  description?: unknown;
}

/**
 * POST /api/projects — create a project owned by the authenticated user.
 * Missing/empty `name` defaults to "Untitled Project". IDs are server-generated
 * via the schema's default `cuid()` strategy.
 */
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return errorResponse("Unauthorized", 401);
  }

  let body: CreateProjectBody;
  try {
    body = (await request.json()) as CreateProjectBody;
  } catch {
    // No body / invalid JSON is treated as "no fields provided" so that a
    // bare POST still creates a project with default values.
    body = {};
  }

  const trimmedName = typeof body.name === "string" ? body.name.trim() : "";
  const name = trimmedName.length > 0 ? trimmedName : DEFAULT_PROJECT_NAME;

  const trimmedDescription =
    typeof body.description === "string" ? body.description.trim() : "";
  const description =
    trimmedDescription.length > 0 ? trimmedDescription : undefined;

  const project = await prisma.project.create({
    data: {
      ownerId: userId,
      name,
      description,
    },
  });

  return NextResponse.json({ project }, { status: 201 });
}
