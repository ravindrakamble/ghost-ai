import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { errorResponse } from "@/lib/api-response";
import { getCursorColor } from "@/lib/liveblocks-color";
import { getLiveblocksClient } from "@/lib/liveblocks";
import { getProjectAccess } from "@/lib/project-access";

interface LiveblocksAuthRequestBody {
  room?: unknown;
}

/**
 * POST /api/liveblocks-auth — issues a Liveblocks session token scoped to a
 * single room, whose ID is the target project's ID (per spec 10).
 *
 * Failure precedence mirrors the rest of this codebase's route handlers
 * (e.g. `app/api/projects/[projectId]/collaborators/route.ts`): 401
 * (unauthenticated) -> 400 (malformed body) -> 404/403 (via
 * `getProjectAccess`'s own discriminants) -> 500/502 (server misconfiguration
 * or upstream Liveblocks failure). The spec's brief only states "return 403
 * for unauthorized project access" — this follows spec 10's Open Questions
 * #4 recommendation rather than collapsing every failure case into 403.
 */
export async function POST(request: NextRequest) {
  let body: LiveblocksAuthRequestBody;
  try {
    body = (await request.json()) as LiveblocksAuthRequestBody;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const roomId = typeof body.room === "string" ? body.room.trim() : "";
  if (!roomId) {
    return errorResponse("A `room` (project ID) is required", 400);
  }

  // `getProjectAccess` uses the room ID as the project ID (spec 10) and
  // enforces Clerk authentication plus owner-or-collaborator membership.
  const access = await getProjectAccess(roomId);
  if (!access.ok) {
    if (access.reason === "unauthenticated") {
      return errorResponse("Unauthorized", 401);
    }
    return access.reason === "not-found"
      ? errorResponse("Project not found", 404)
      : errorResponse("Forbidden", 403);
  }

  // Re-fetch the caller's Clerk profile for display name + avatar. Not
  // reused from `getProjectAccess` (which only exposes `userId`/`email`
  // internally, not the full profile) to avoid changing that shared helper
  // for this spec's needs (spec 10's Out-of-scope callouts).
  const caller = await currentUser();
  if (!caller) {
    // Extremely unlikely race (session revoked between the access check
    // above and this lookup) — treat it the same as "no signed-in session."
    return errorResponse("Unauthorized", 401);
  }

  const name =
    [caller.firstName, caller.lastName].filter(Boolean).join(" ").trim() ||
    caller.username ||
    "Anonymous";
  const avatar = caller.imageUrl ?? "";
  const color = getCursorColor(caller.id);

  let liveblocks;
  try {
    liveblocks = getLiveblocksClient();
  } catch (error) {
    console.error("Liveblocks client is not configured", error);
    return errorResponse("Realtime collaboration is not configured", 500);
  }

  try {
    // Idempotent "create only if needed" room existence check — does not
    // recreate or reset an already-existing room.
    await liveblocks.getOrCreateRoom(roomId, { defaultAccesses: [] });

    const session = liveblocks.prepareSession(caller.id, {
      userInfo: { name, avatar, color },
    });
    session.allow(roomId, ["room:write"]);

    const { status, body: authorizedBody } = await session.authorize();
    return new NextResponse(authorizedBody, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Liveblocks room/session request failed", error);
    return errorResponse("Failed to reach the realtime collaboration service", 502);
  }
}
