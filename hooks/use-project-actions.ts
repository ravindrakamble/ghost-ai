"use client"

import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { generateShortSuffix, slugify } from "@/lib/slug"
import type { Project } from "@/types/project"

type DialogType = "create" | "rename" | "delete" | null

interface ProjectApiResponse {
  project?: { id: string; name: string }
  error?: string
}

/**
 * Parses a project mutation route's JSON response. Falls back to a generic
 * message if the body isn't valid JSON (e.g. an upstream 500 with no body).
 */
async function parseProjectResponse(response: Response): Promise<ProjectApiResponse> {
  try {
    return (await response.json()) as ProjectApiResponse
  } catch {
    return {}
  }
}

/**
 * Owns dialog state and the real create/rename/delete mutations for the
 * editor home sidebar and dialogs. Replaces the mock `useProjectDialogs`
 * hook from spec 04 — see spec 07.
 */
export function useProjectActions() {
  const router = useRouter()
  const params = useParams<{ roomId?: string }>()

  const [dialogType, setDialogType] = useState<DialogType>(null)
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [name, setName] = useState("")
  const [roomIdSuffix, setRoomIdSuffix] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slug = slugify(name)
  // Cosmetic, room-ID-style preview only — the real ID is server-generated.
  // See lib/slug.ts and spec 07's Open Questions #2.
  const roomIdPreview = slug ? `${slug}-${roomIdSuffix}` : ""

  function closeDialog() {
    setDialogType(null)
    setActiveProject(null)
    setName("")
    setError(null)
  }

  function openCreateDialog() {
    setActiveProject(null)
    setName("")
    setRoomIdSuffix(generateShortSuffix())
    setError(null)
    setDialogType("create")
  }

  function openRenameDialog(project: Project) {
    setActiveProject(project)
    setName(project.name)
    setError(null)
    setDialogType("rename")
  }

  function openDeleteDialog(project: Project) {
    setActiveProject(project)
    setError(null)
    setDialogType("delete")
  }

  async function submitCreate() {
    const trimmedName = name.trim()
    if (!trimmedName || isLoading) return

    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      })
      const body = await parseProjectResponse(response)

      if (!response.ok || !body.project) {
        setError(body.error ?? "Failed to create project. Please try again.")
        return
      }

      const createdProjectId = body.project.id
      closeDialog()
      router.push(`/editor/${createdProjectId}`)
    } catch {
      setError("Failed to create project. Please check your connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  async function submitRename() {
    const trimmedName = name.trim()
    if (!activeProject || !trimmedName || isLoading) return

    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${activeProject.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      })

      if (!response.ok) {
        const body = await parseProjectResponse(response)
        setError(body.error ?? "Failed to rename project. Please try again.")
        return
      }

      closeDialog()
      router.refresh()
    } catch {
      setError("Failed to rename project. Please check your connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  async function submitDelete() {
    if (!activeProject || isLoading) return

    const deletedProjectId = activeProject.id
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${deletedProjectId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const body = await parseProjectResponse(response)
        setError(body.error ?? "Failed to delete project. Please try again.")
        return
      }

      closeDialog()

      // "Active workspace" lines up with the future /editor/[roomId] segment
      // from spec 08 — until that route exists, params.roomId is always
      // undefined, so this branch is a no-op and delete always refreshes.
      const isActiveWorkspace = params?.roomId === deletedProjectId
      if (isActiveWorkspace) {
        router.push("/editor")
      } else {
        router.refresh()
      }
    } catch {
      setError("Failed to delete project. Please check your connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return {
    dialogType,
    activeProject,
    name,
    slug,
    roomIdPreview,
    isLoading,
    error,
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
