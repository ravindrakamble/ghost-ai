"use client"

import { useState } from "react"
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
