import { useState } from "react"
import { MOCK_PROJECTS } from "@/lib/mock-projects"
import { slugify } from "@/lib/slug"
import type { Project } from "@/types/project"

type DialogType = "create" | "rename" | "delete" | null

export function useProjectDialogs() {
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS)
  const [dialogType, setDialogType] = useState<DialogType>(null)
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [name, setName] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const slug = slugify(name)

  function closeDialog() {
    setDialogType(null)
    setActiveProject(null)
    setName("")
  }

  function openCreateDialog() {
    setActiveProject(null)
    setName("")
    setDialogType("create")
  }

  function openRenameDialog(project: Project) {
    setActiveProject(project)
    setName(project.name)
    setDialogType("rename")
  }

  function openDeleteDialog(project: Project) {
    setActiveProject(project)
    setDialogType("delete")
  }

  function submitCreate() {
    const trimmedName = name.trim()
    if (!trimmedName) return

    setIsLoading(true)
    setProjects((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: trimmedName, slug: slugify(trimmedName), role: "owner" },
    ])
    setIsLoading(false)
    closeDialog()
  }

  function submitRename() {
    const trimmedName = name.trim()
    if (!activeProject || !trimmedName) return

    setIsLoading(true)
    setProjects((prev) =>
      prev.map((project) =>
        project.id === activeProject.id
          ? { ...project, name: trimmedName, slug: slugify(trimmedName) }
          : project
      )
    )
    setIsLoading(false)
    closeDialog()
  }

  function submitDelete() {
    if (!activeProject) return

    setIsLoading(true)
    setProjects((prev) => prev.filter((project) => project.id !== activeProject.id))
    setIsLoading(false)
    closeDialog()
  }

  return {
    projects,
    dialogType,
    activeProject,
    name,
    slug,
    isLoading,
    setName,
    openCreateDialog,
    openRenameDialog,
    openDeleteDialog,
    closeDialog,
    submitCreate,
    submitRename,
    submitDelete,
  }
}
