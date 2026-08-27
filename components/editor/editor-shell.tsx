"use client"

import { useState } from "react"
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
  // `roomId` is `undefined` on `/editor` (the project-list "home") and a
  // real ID on `/editor/[roomId]` (a project's canvas) — same
  // `useParams<{ roomId?: string }>()` convention already used by
  // `project-sidebar.tsx`/`hooks/use-project-actions.ts`.
  const { roomId } = useParams<{ roomId?: string }>()
  const [sidebarOpen, setSidebarOpen] = useState(() => !roomId)

  // `EditorShell` itself never remounts across a sibling navigation between
  // `/editor` and `/editor/[roomId]` (it's rendered by the shared `/editor`
  // layout), so reopening the sidebar when navigating *back* to home (e.g.
  // via the Home link) needs to react to the `roomId` transition, not just
  // the initial mount. Adjusted during render via a second `useState` that
  // tracks the previous `roomId` — React's own documented pattern for state
  // that depends on a prop change (a `useRef` would work under plain React
  // rules but is rejected by this repo's Compiler-safe `react-hooks/refs`
  // lint rule, which forbids reading/writing ref values during render) —
  // rather than inside a `useEffect`, which would call `setState`
  // synchronously in the effect body and force an extra, avoidable render
  // pass. Only opens, never force-closes: if the user closes the sidebar
  // while still on `/editor`, `roomId` hasn't changed, so this comparison
  // doesn't re-fire.
  const [prevRoomId, setPrevRoomId] = useState(roomId)
  if (prevRoomId !== roomId) {
    setPrevRoomId(roomId)
    if (!roomId) {
      setSidebarOpen(true)
    }
  }

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
