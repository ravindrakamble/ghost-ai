"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import type { Project } from "@/types/project"
import { EditorNavbar } from "./editor-navbar"
import { ProjectDialogsProvider } from "./project-dialogs-provider"
import { ProjectSidebar } from "./project-sidebar"

interface EditorShellProps {
  children: React.ReactNode
  ownedProjects: Project[]
  sharedProjects: Project[]
}

export function EditorShell({ children, ownedProjects, sharedProjects }: EditorShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // `roomId` is `undefined` on `/editor` (the project-list "home") and a
  // real ID on `/editor/[roomId]` (a project's canvas) — same
  // `useParams<{ roomId?: string }>()` convention already used by
  // `project-sidebar.tsx`/`hooks/use-project-actions.ts`. `EditorShell`
  // itself never remounts across a sibling navigation between these two
  // (it's rendered by the shared `/editor` layout), so a plain
  // mount-time-only default wouldn't reopen the sidebar when navigating
  // *back* to home from inside a project (e.g. via the new Home link) —
  // this effect reacts to that transition instead. Only opens, never
  // force-closes: if the user closes the sidebar while still on `/editor`,
  // `roomId` hasn't changed, so this doesn't re-fire and snap it back open.
  const { roomId } = useParams<{ roomId?: string }>()

  useEffect(() => {
    if (!roomId) {
      setSidebarOpen(true)
    }
  }, [roomId])

  return (
    <ProjectDialogsProvider ownedProjects={ownedProjects} sharedProjects={sharedProjects}>
      <div className="relative flex h-screen flex-col overflow-hidden bg-base">
        <EditorNavbar
          sidebarOpen={sidebarOpen}
          onSidebarToggle={() => setSidebarOpen((prev) => !prev)}
        />
        <ProjectSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="flex flex-1 flex-col overflow-hidden pt-12">
          {children}
        </main>
      </div>
    </ProjectDialogsProvider>
  )
}
