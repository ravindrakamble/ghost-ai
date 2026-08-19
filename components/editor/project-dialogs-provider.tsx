"use client"

import { createContext, useContext } from "react"
import { CreateProjectDialog } from "@/components/editor/dialogs/create-project-dialog"
import { DeleteProjectDialog } from "@/components/editor/dialogs/delete-project-dialog"
import { RenameProjectDialog } from "@/components/editor/dialogs/rename-project-dialog"
import { useProjectActions } from "@/hooks/use-project-actions"
import type { Project } from "@/types/project"

type ProjectDialogsValue = ReturnType<typeof useProjectActions> & {
  ownedProjects: Project[]
  sharedProjects: Project[]
}

const ProjectDialogsContext = createContext<ProjectDialogsValue | null>(null)

interface ProjectDialogsProviderProps {
  children: React.ReactNode
  ownedProjects: Project[]
  sharedProjects: Project[]
}

export function ProjectDialogsProvider({
  children,
  ownedProjects,
  sharedProjects,
}: ProjectDialogsProviderProps) {
  const actions = useProjectActions()
  const value: ProjectDialogsValue = { ...actions, ownedProjects, sharedProjects }

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
