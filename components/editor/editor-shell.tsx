"use client"

import { useState } from "react"
import { EditorNavbar } from "./editor-navbar"
import { ProjectDialogsProvider } from "./project-dialogs-provider"
import { ProjectSidebar } from "./project-sidebar"

interface EditorShellProps {
  children: React.ReactNode
}

export function EditorShell({ children }: EditorShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <ProjectDialogsProvider>
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
