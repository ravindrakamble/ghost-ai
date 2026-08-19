"use client"

import { useState } from "react"
import { AiSidebarPlaceholder } from "@/components/editor/ai-sidebar-placeholder"
import { Canvas } from "@/components/editor/canvas"
import { ShareDialog } from "@/components/editor/share-dialog"
import { WorkspaceNavbar } from "@/components/editor/workspace-navbar"
import { useCollaborators } from "@/hooks/use-collaborators"
import type { Project } from "@/types/project"

interface WorkspaceShellProps {
  project: Project
  isOwner: boolean
}

/**
 * `/editor/[roomId]` workspace layout: project-name navbar with share/AI-toggle
 * actions, the Liveblocks-backed canvas, and a slide-over AI sidebar
 * placeholder. Client component because the AI-sidebar toggle and Share
 * dialog need local UI state. `project.id` is passed as the canvas's
 * Liveblocks room ID, per spec 10's convention (room ID = project ID). No
 * AI chat logic lives here yet.
 *
 * Owns the `useCollaborators` hook (rather than `ShareDialog` owning it
 * internally) so the initial collaborator fetch can be triggered directly
 * from the Share button's `onClick` — a real event handler — instead of a
 * `useEffect` watching the dialog's `open` prop, which
 * `react-hooks/set-state-in-effect` flags as a cascading-render pattern.
 */
export function WorkspaceShell({ project, isOwner }: WorkspaceShellProps) {
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const { collaborators, isLoading, error, isInviting, removingId, invite, remove, refetch } =
    useCollaborators(project.id)

  function handleOpenShare() {
    setIsShareOpen(true)
    void refetch()
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <WorkspaceNavbar
        projectName={project.name}
        isAiSidebarOpen={isAiSidebarOpen}
        onToggleAiSidebar={() => setIsAiSidebarOpen((prev) => !prev)}
        onOpenShare={handleOpenShare}
      />
      <div className="relative flex flex-1 overflow-hidden">
        <Canvas roomId={project.id} />
        <AiSidebarPlaceholder isOpen={isAiSidebarOpen} />
      </div>
      <ShareDialog
        open={isShareOpen}
        onOpenChange={setIsShareOpen}
        projectId={project.id}
        isOwner={isOwner}
        collaborators={collaborators}
        isLoading={isLoading}
        error={error}
        isInviting={isInviting}
        removingId={removingId}
        onInvite={invite}
        onRemove={remove}
      />
    </div>
  )
}
