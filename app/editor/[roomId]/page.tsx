import { redirect } from "next/navigation"
import { AccessDenied } from "@/components/editor/access-denied"
import { WorkspaceShell } from "@/components/editor/workspace-shell"
import { getProjectAccess } from "@/lib/project-access"

interface EditorRoomPageProps {
  params: Promise<{ roomId: string }>
}

/**
 * `/editor/[roomId]` — `roomId` is the `Project.id` (see spec 07's Dev
 * Notes; the app never introduced a separate Liveblocks room ID). Server
 * component: resolves access before rendering anything, per spec 08.
 */
export default async function EditorRoomPage({ params }: EditorRoomPageProps) {
  const { roomId } = await params
  const access = await getProjectAccess(roomId)

  if (!access.ok && access.reason === "unauthenticated") {
    redirect("/sign-in")
  }

  if (!access.ok) {
    return <AccessDenied />
  }

  return <WorkspaceShell project={access.project} isOwner={access.isOwner} />
}
