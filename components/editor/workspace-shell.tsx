"use client"

import { useState } from "react"
import { AiSidebar } from "@/components/editor/ai-sidebar"
import { Canvas } from "@/components/editor/canvas"
import { ShareDialog } from "@/components/editor/share-dialog"
import { WorkspaceNavbar } from "@/components/editor/workspace-navbar"
import { useCollaborators } from "@/hooks/use-collaborators"
import type { CanvasSaveStatus } from "@/hooks/use-canvas-autosave"
import type { Project } from "@/types/project"

interface WorkspaceShellProps {
  project: Project
  isOwner: boolean
}

/**
 * `/editor/[roomId]` workspace layout: project-name navbar with share/AI-toggle
 * actions, the Liveblocks-backed canvas, and a slide-over `AiSidebar` (spec
 * 20). Client component because the AI-sidebar toggle and Share dialog need
 * local UI state. `project.id` is passed as the canvas's Liveblocks room ID,
 * per spec 10's convention (room ID = project ID). `isAiSidebarOpen` still
 * fully controls the sidebar's visibility (toggled from
 * `WorkspaceNavbar`'s button); the new `onClose` prop lets the sidebar's own
 * header close button collapse it too, without moving the open/close state
 * out of this component. No AI chat/backend logic lives here or in
 * `AiSidebar` yet — presentational shell only.
 *
 * Owns the `useCollaborators` hook (rather than `ShareDialog` owning it
 * internally) so the initial collaborator fetch can be triggered directly
 * from the Share button's `onClick` — a real event handler — instead of a
 * `useEffect` watching the dialog's `open` prop, which
 * `react-hooks/set-state-in-effect` flags as a cascading-render pattern.
 *
 * `isTemplatesModalOpen`/`setIsTemplatesModalOpen` (spec 18) are threaded
 * down as `Canvas` props — the same direction `roomId` already flows — since
 * the starter templates modal itself is rendered by `CanvasFlow`
 * (`components/editor/canvas.tsx`), the only place the real import
 * mechanism (`nodes`/`edges`/`onNodesChange`/`onEdgesChange`/`fitView`)
 * lives. `WorkspaceShell` only owns the open/close boolean, mirroring
 * `isShareOpen` above.
 *
 * `saveStatus` (spec 21) is owned here too, so `WorkspaceNavbar` can render
 * it via `SaveStatusIndicator` — but unlike `isTemplatesModalOpen`, the
 * setter (`setSaveStatus`) is passed down to `Canvas` as `onSaveStatusChange`
 * rather than the boolean/value itself, since the real status is only known
 * inside `CanvasFlow` (`useCanvasAutosave` needs the room's synced
 * `nodes`/`edges`) and gets pushed back up through that callback. See
 * `Canvas`'s own docblock for the full reasoning.
 */
export function WorkspaceShell({ project, isOwner }: WorkspaceShellProps) {
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<CanvasSaveStatus>("idle")
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
        onOpenTemplates={() => setIsTemplatesModalOpen(true)}
        saveStatus={saveStatus}
      />
      <div className="relative flex flex-1 overflow-hidden">
        <Canvas
          roomId={project.id}
          isTemplatesModalOpen={isTemplatesModalOpen}
          setIsTemplatesModalOpen={setIsTemplatesModalOpen}
          onSaveStatusChange={setSaveStatus}
        />
        <AiSidebar isOpen={isAiSidebarOpen} onClose={() => setIsAiSidebarOpen(false)} />
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
