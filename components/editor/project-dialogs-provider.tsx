"use client"

import { createContext, useContext } from "react"
import { CreateProjectDialog } from "@/components/editor/dialogs/create-project-dialog"
import { DeleteProjectDialog } from "@/components/editor/dialogs/delete-project-dialog"
import { RenameProjectDialog } from "@/components/editor/dialogs/rename-project-dialog"
import { useProjectDialogs } from "@/components/editor/use-project-dialogs"

type ProjectDialogsValue = ReturnType<typeof useProjectDialogs>

const ProjectDialogsContext = createContext<ProjectDialogsValue | null>(null)

export function ProjectDialogsProvider({ children }: { children: React.ReactNode }) {
  const value = useProjectDialogs()

  return (
    <ProjectDialogsContext.Provider value={value}>
      {children}
      <CreateProjectDialog />
      <RenameProjectDialog />
      <DeleteProjectDialog />
    </ProjectDialogsContext.Provider>
  )
}

export function useProjectDialogsContext() {
  const context = useContext(ProjectDialogsContext)
  if (!context) {
    throw new Error("useProjectDialogsContext must be used within a ProjectDialogsProvider")
  }
  return context
}
